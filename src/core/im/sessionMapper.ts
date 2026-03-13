/**
 * SessionMapper — Map IM messages to Abu conversations
 *
 * Session resolution rules:
 * 1. Has thread (Slack thread_ts, Feishu messageId reply) → key = "platform:chatId:threadId"
 * 2. No thread → key = "platform:chatId:window"
 * 3. Timeout (default 30 min no interaction) → create new session
 * 4. Exceeded maxRounds → create new session
 * 5. "继续上次" / "continue" → recover previous session
 */

import { useIMChannelStore } from '../../stores/imChannelStore';
import { useChatStore } from '../../stores/chatStore';
import type { IMSession, IMCapabilityLevel } from '../../types/imChannel';
import type { IMPlatform } from '../../types/trigger';
import type { NormalizedIMMessage } from './inboundRouter';
import type { IMChannel } from '../../types/imChannel';

export interface SessionResolveResult {
  session: IMSession;
  isNew: boolean;
  /** If user asked to recover previous session */
  isRecovered?: boolean;
}

const CONTINUE_PATTERNS = [
  '继续上次',
  '继续上一次',
  '恢复上次',
  'continue',
  'continue last',
  'resume',
];

export class SessionMapper {
  private previousSessions = new Map<string, IMSession>(); // key → last expired session

  /**
   * Resolve which Abu conversation this IM message belongs to.
   */
  resolve(
    message: NormalizedIMMessage,
    channel: IMChannel,
    capability: IMCapabilityLevel,
  ): SessionResolveResult {
    const store = useIMChannelStore.getState();
    const sessionKey = this.buildKey(message);

    // Check for "continue last" request
    if (this.isContinueRequest(message.text)) {
      const prev = this.previousSessions.get(this.buildWindowKey(message));
      if (prev) {
        // Recover previous session
        const recovered: IMSession = {
          ...prev,
          lastActiveAt: Date.now(),
          capability,
        };
        store.upsertSession(prev.key, recovered);
        this.previousSessions.delete(this.buildWindowKey(message));
        return { session: recovered, isNew: false, isRecovered: true };
      }
    }

    // Look for existing session
    const existing = store.sessions[sessionKey];

    if (existing) {
      const timeoutMs = channel.sessionTimeoutMinutes * 60 * 1000;
      const isExpired = Date.now() - existing.lastActiveAt > timeoutMs;
      const isMaxRounds = existing.messageCount >= channel.maxRoundsPerSession;

      if (!isExpired && !isMaxRounds) {
        // Session still valid
        store.incrementSessionRound(sessionKey);
        return { session: { ...existing, messageCount: existing.messageCount + 1 }, isNew: false };
      }

      // Session expired or max rounds — archive for potential recovery
      this.previousSessions.set(this.buildWindowKey(message), existing);
      store.removeSession(sessionKey);
    }

    // Create new session
    const newSession = this.createSession(message, channel, capability);
    store.upsertSession(sessionKey, newSession);
    return { session: newSession, isNew: true };
  }

  /**
   * Build session key from message.
   * Thread-aware platforms use thread ID; others use window-based key.
   */
  private buildKey(message: NormalizedIMMessage): string {
    // Slack thread
    if (message.platform === 'slack' && message.replyContext.threadTs) {
      return `slack:${message.chatId}:${message.replyContext.threadTs}`;
    }
    // Feishu thread (reply to specific message)
    if (message.platform === 'feishu' && message.replyContext.messageId) {
      return `feishu:${message.chatId}:${message.replyContext.messageId}`;
    }
    // Others: window-based
    return this.buildWindowKey(message);
  }

  private buildWindowKey(message: NormalizedIMMessage): string {
    return `${message.platform}:${message.chatId}:window`;
  }

  private createSession(
    message: NormalizedIMMessage,
    channel: IMChannel,
    capability: IMCapabilityLevel,
  ): IMSession {
    // Create a new Abu conversation for this IM session
    const chatStore = useChatStore.getState();
    const workspacePath = channel.workspacePaths[0] ?? null;
    const conversationId = chatStore.createConversation(workspacePath, {
      skipActivate: true,
      imChannelId: channel.id,
      imPlatform: message.platform,
    });

    // Set conversation title with IM context
    const platformLabels: Record<IMPlatform, string> = {
      dchat: 'D-Chat', feishu: '飞书', dingtalk: '钉钉', wecom: '企微', slack: 'Slack',
    };
    const title = `[${platformLabels[message.platform]}] ${message.senderName}${message.chatName ? ` · ${message.chatName}` : ''}`;
    chatStore.renameConversation(conversationId, title);

    return {
      key: this.buildKey(message),
      channelId: channel.id,
      conversationId,
      lastActiveAt: Date.now(),
      messageCount: 1,
      userId: message.senderId,
      userName: message.senderName,
      capability,
      platform: message.platform,
      chatId: message.chatId,
      chatName: message.chatName,
    };
  }

  private isContinueRequest(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return CONTINUE_PATTERNS.some((p) => lower === p || lower.startsWith(p));
  }

  /**
   * Clean up expired sessions and archive them for recovery.
   */
  cleanup() {
    const store = useIMChannelStore.getState();
    const now = Date.now();

    for (const [key, session] of Object.entries(store.sessions)) {
      const channel = store.channels[session.channelId];
      const timeoutMs = (channel?.sessionTimeoutMinutes ?? 30) * 60 * 1000;

      if (now - session.lastActiveAt > timeoutMs) {
        // Archive for "continue last" recovery
        const windowKey = `${session.platform}:${session.chatId}:window`;
        this.previousSessions.set(windowKey, session);
        store.removeSession(key);
      }
    }

    // Clean up very old archived sessions (>24h)
    const maxArchiveAge = 24 * 60 * 60 * 1000;
    for (const [key, session] of this.previousSessions) {
      if (now - session.lastActiveAt > maxArchiveAge) {
        this.previousSessions.delete(key);
      }
    }
  }
}

export const sessionMapper = new SessionMapper();

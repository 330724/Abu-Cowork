/**
 * IMChannelRouter — Core integration for Phase 2 IM independent channel
 *
 * Flow: InboundMessage → AuthGate → SessionMapper → agentLoop → StreamingReply
 *
 * This router handles IM messages that target channels (not triggers).
 * It is registered as a listener on the 'im-inbound-event' Tauri event,
 * alongside the trigger engine's own IM listener.
 */

import { useIMChannelStore } from '../../stores/imChannelStore';
import { useChatStore } from '../../stores/chatStore';
import { runAgentLoop } from '../agent/agentLoop';
import { parseInboundMessage } from './inboundRouter';
import type { NormalizedIMMessage } from './inboundRouter';
import { resolveCapability, getCallbacksForLevel } from './authGate';
import { sessionMapper } from './sessionMapper';
import { sendThinking, sendFinal, addProcessingReaction } from './streamingReply';
import type { AbuMessage } from './adapters/types';
import type { IMChannel, IMCapabilityLevel } from '../../types/imChannel';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const MAX_CONCURRENT_IM = 5;
/** Maximum time (ms) to wait for agentLoop before aborting */
const AGENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

class IMChannelRouter {
  private runningCount = 0;
  private queuedMessages: { message: NormalizedIMMessage; channelId: string }[] = [];
  private unlistenIM: UnlistenFn | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /** Track recently processed message IDs to prevent duplicate webhook deliveries */
  private recentMessageIds = new Set<string>();

  async start() {
    this.unlistenIM = await listen<{ platform: string; payload: Record<string, unknown> }>(
      'im-inbound-event',
      (event) => {
        const { platform, payload } = event.payload;
        this.handleInbound(platform, payload);
      }
    );

    // Periodic session cleanup (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      sessionMapper.cleanup();
      // Purge dedup set to prevent memory leak
      this.recentMessageIds.clear();
    }, 5 * 60 * 1000);

    console.log('[IMChannel] Router started');
  }

  stop() {
    this.unlistenIM?.();
    this.unlistenIM = null;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.queuedMessages = [];
    this.runningCount = 0;
    this.recentMessageIds.clear();
    console.log('[IMChannel] Router stopped');
  }

  private handleInbound(platform: string, rawPayload: Record<string, unknown>) {
    const message = parseInboundMessage(platform, rawPayload);
    if (!message) return;

    // Dedup: skip if we've already processed this exact message recently
    const dedupKey = `${message.platform}:${message.chatId}:${message.senderId}:${message.text}`;
    if (this.recentMessageIds.has(dedupKey)) {
      console.log('[IMChannel] Duplicate message skipped');
      return;
    }
    this.recentMessageIds.add(dedupKey);

    // Find matching enabled channel for this platform
    const store = useIMChannelStore.getState();
    const channels = store.getChannelsByPlatform(message.platform).filter((c) => c.enabled);
    if (channels.length === 0) return;

    const channel = channels[0];

    // Auth check
    const authResult = resolveCapability(message.senderId, channel);
    if (!authResult.allowed) {
      console.log(`[IMChannel] Auth denied for ${message.senderId}: ${authResult.reason}`);
      return;
    }

    // Concurrency check
    if (this.runningCount >= MAX_CONCURRENT_IM) {
      console.log('[IMChannel] Concurrency limit reached, queueing message');
      this.queuedMessages.push({ message, channelId: channel.id });
      // Best-effort: notify user they're in queue
      const queuePos = this.queuedMessages.length;
      const queueMsg: AbuMessage = {
        content: `收到！当前有 ${this.runningCount} 个请求正在处理，你的请求已排队（第 ${queuePos} 位），请稍候。`,
      };
      sendThinking(message.platform, message.replyContext)
        .then((h) => sendFinal(h, queueMsg))
        .catch(() => {});
      return;
    }

    this.processMessage(message, channel, authResult.capability);
  }

  private async processMessage(
    message: NormalizedIMMessage,
    channel: IMChannel,
    capability: IMCapabilityLevel,
  ) {
    this.runningCount++;
    let removeReaction: (() => Promise<void>) | null = null;

    try {
      // 1. Session resolution
      const resolveResult = sessionMapper.resolve(message, channel, capability);
      const { session, isRecovered, hasRecoverableSession, recoverableContext } = resolveResult;

      // 2. Send thinking acknowledgment (or recovery/hint messages)
      let replyHandle;

      if (isRecovered) {
        // Send recovery confirmation
        const confirmMsg: AbuMessage = {
          content: `已恢复上次对话上下文（${recoverableContext ?? ''}）。请继续。`,
        };
        replyHandle = await sendThinking(message.platform, message.replyContext);
        await sendFinal(replyHandle, confirmMsg);
        useIMChannelStore.getState().setChannelStatus(channel.id, 'connected');
        console.log(`[IMChannel] Recovered session for ${message.senderName}`);
        return; // "继续上次" is not a real question — just confirm and wait for next message
      }

      if (hasRecoverableSession) {
        // Hint the user that they can recover
        const hintMsg: AbuMessage = {
          content: `上一个话题已结束。回复"继续上次"可恢复上下文，或直接描述新的问题。`,
        };
        // Send hint as a side-effect, don't block main flow
        sendThinking(message.platform, message.replyContext)
          .then((h) => sendFinal(h, hintMsg))
          .catch(() => {});
      }

      // Add processing indicator: emoji reaction for Feishu/Slack, thinking message for others
      const adapter = (await import('./adapters/registry')).getAdapter(message.platform);

      if (adapter?.config.supportsMessageUpdate) {
        // Feishu/Slack: add emoji reaction as processing indicator
        removeReaction = await addProcessingReaction(message.platform, message.replyContext);
        replyHandle = {
          platform: message.platform,
          supportsUpdate: true,
          replyContext: message.replyContext,
        };
      } else {
        replyHandle = await sendThinking(message.platform, message.replyContext);
      }

      // 3. Run agent with timeout (agentLoop adds the user message internally)

      const callbacks = getCallbacksForLevel(capability);
      await this.runWithTimeout(
        runAgentLoop(session.conversationId, message.text, {
          commandConfirmCallback: callbacks.commandConfirmCallback,
          filePermissionCallback: callbacks.filePermissionCallback,
        }),
        AGENT_TIMEOUT_MS,
      );

      // 5. Extract and send reply
      const lastAIContent = this.extractLastAIReply(session.conversationId);
      if (lastAIContent) {
        const replyMessage: AbuMessage = {
          content: lastAIContent,
          footer: `Abu AI · ${new Date().toLocaleString('zh-CN')}`,
        };
        const result = await sendFinal(replyHandle, replyMessage);
        if (!result.success) {
          console.warn(`[IMChannel] Reply send failed: ${result.error}`);
        }
      } else {
        console.warn(`[IMChannel] No AI reply found for conversation ${session.conversationId}`);
      }

      // Clear channel error on success
      useIMChannelStore.getState().setChannelStatus(channel.id, 'connected');
      console.log(`[IMChannel] Completed: ${message.senderName} in ${message.platform}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[IMChannel] Error processing message:`, errorMsg);

      // Write error to channel store so UI can display it
      useIMChannelStore.getState().setChannelStatus(channel.id, 'error', errorMsg);

      // Best-effort error reply to user
      this.sendErrorReply(message, errorMsg).catch(() => {});
    } finally {
      // Remove processing reaction (emoji) if it was added
      if (removeReaction) {
        removeReaction().catch(() => {});
      }
      this.runningCount--;
      this.processQueue();
    }
  }

  /**
   * Wrap a promise with a timeout. Rejects with a clear message if exceeded.
   */
  private runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Agent timed out after ${ms / 1000}s`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /**
   * Best-effort: try to notify the user that an error occurred.
   */
  private async sendErrorReply(message: NormalizedIMMessage, error: string) {
    const truncated = error.length > 100 ? error.slice(0, 100) + '...' : error;
    const errorMessage: AbuMessage = {
      content: `Abu 处理出错: ${truncated}`,
    };
    const handle = { platform: message.platform, supportsUpdate: false, replyContext: message.replyContext };
    await sendFinal(handle, errorMessage);
  }

  private processQueue() {
    if (this.queuedMessages.length === 0 || this.runningCount >= MAX_CONCURRENT_IM) return;

    const next = this.queuedMessages.shift()!;
    const store = useIMChannelStore.getState();
    const channel = store.channels[next.channelId];
    if (!channel || !channel.enabled) return;

    const authResult = resolveCapability(next.message.senderId, channel);
    if (!authResult.allowed) return;

    this.processMessage(next.message, channel, authResult.capability);
  }

  private extractLastAIReply(conversationId: string): string | null {
    const conv = useChatStore.getState().conversations[conversationId];
    if (!conv) return null;

    const lastAI = [...conv.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAI) return null;

    if (typeof lastAI.content === 'string') return lastAI.content;

    // Multimodal content
    return (lastAI.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
  }
}

export const imChannelRouter = new IMChannelRouter();

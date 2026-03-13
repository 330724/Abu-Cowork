/**
 * StreamingReply — Platform-dependent reply strategy
 *
 * Platforms with supportsMessageUpdate (Feishu, Slack):
 *   1. Send "thinking..." placeholder
 *   2. Periodically update message content while agent runs
 *   3. Send final result
 *
 * Platforms without (DingTalk, D-Chat, WeCom):
 *   1. Send "正在分析..." acknowledgment
 *   2. Wait for completion
 *   3. Send final result as new message
 *
 * Note: Full streaming update and non-DingTalk direct replies require
 * API token auth (Phase 3). Currently only sessionWebhook (DingTalk) works.
 */

import { getAdapter } from './adapters/registry';
import type { AbuMessage } from './adapters/types';
import type { IMPlatform, IMReplyContext } from '../../types/trigger';

export interface ReplyHandle {
  /** Platform */
  platform: IMPlatform;
  /** Whether this platform supports streaming updates */
  supportsUpdate: boolean;
  /** The placeholder message ID (for update-capable platforms) */
  placeholderMessageId?: string;
  /** Reply context from inbound message */
  replyContext: IMReplyContext;
}

/**
 * Send an acknowledgment / thinking message.
 * Returns a handle for subsequent updates or final send.
 */
export async function sendThinking(
  platform: IMPlatform,
  replyContext: IMReplyContext,
  thinkingText?: string,
): Promise<ReplyHandle> {
  const adapter = getAdapter(platform);
  const supportsUpdate = adapter?.config.supportsMessageUpdate ?? false;
  const text = thinkingText ?? '收到，正在分析...';

  const handle: ReplyHandle = {
    platform,
    supportsUpdate,
    replyContext,
  };

  // Send thinking via sessionWebhook if available (DingTalk)
  if (replyContext.sessionWebhook && adapter) {
    const msg: AbuMessage = { content: text };
    try {
      await adapter.sendMessage(replyContext.sessionWebhook, msg);
    } catch (err) {
      console.warn(`[StreamingReply] Thinking send failed (non-critical):`, err);
    }
  }

  return handle;
}

/**
 * Send the final result.
 *
 * Resolution order:
 * 1. sessionWebhook (DingTalk) — send directly
 * 2. Other platforms — log warning and return degraded success
 *    (full API-token-based reply is Phase 3)
 */
export async function sendFinal(
  handle: ReplyHandle,
  message: AbuMessage,
): Promise<{ success: boolean; error?: string }> {
  const adapter = getAdapter(handle.platform);
  if (!adapter) {
    return { success: false, error: `Unknown platform: ${handle.platform}` };
  }

  // DingTalk / any platform that provides sessionWebhook
  if (handle.replyContext.sessionWebhook) {
    try {
      await adapter.sendMessage(handle.replyContext.sessionWebhook, message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Other platforms: no direct reply capability yet.
  // Return degraded success — the message is stored in the conversation
  // and can be viewed in Abu's UI. This is not a hard error.
  console.log(
    `[StreamingReply] No direct reply channel for ${handle.platform}. ` +
    `Reply stored in conversation only. API token auth needed for direct IM replies.`
  );
  return {
    success: true,
    error: `no_direct_reply:${handle.platform}`,
  };
}

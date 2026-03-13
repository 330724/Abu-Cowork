/**
 * StreamingReply Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock adapter registry
const mockSendMessage = vi.fn();
vi.mock('./adapters/registry', () => ({
  getAdapter: vi.fn((platform: string) => {
    if (platform === 'unknown') return null;
    return {
      config: {
        supportsMessageUpdate: platform === 'feishu' || platform === 'slack',
      },
      sendMessage: mockSendMessage,
    };
  }),
}));

import { sendThinking, sendFinal } from './streamingReply';
import type { IMReplyContext } from '../../types/trigger';

function makeContext(overrides: Partial<IMReplyContext> = {}): IMReplyContext {
  return {
    platform: 'dingtalk',
    ...overrides,
  };
}

describe('sendThinking', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('returns a handle with platform info', async () => {
    const handle = await sendThinking('dingtalk', makeContext());
    expect(handle.platform).toBe('dingtalk');
    expect(handle.supportsUpdate).toBe(false);
  });

  it('marks Feishu/Slack as supportsUpdate', async () => {
    const feishu = await sendThinking('feishu', makeContext({ platform: 'feishu' }));
    expect(feishu.supportsUpdate).toBe(true);

    const slack = await sendThinking('slack', makeContext({ platform: 'slack' }));
    expect(slack.supportsUpdate).toBe(true);
  });

  it('sends thinking via sessionWebhook when available', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    await sendThinking('dingtalk', makeContext({ sessionWebhook: 'https://hook.example.com' }));
    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockSendMessage.mock.calls[0][1].content).toBe('收到，正在分析...');
  });

  it('uses custom thinking text', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    await sendThinking('dingtalk', makeContext({ sessionWebhook: 'https://hook.example.com' }), 'Please wait...');
    expect(mockSendMessage.mock.calls[0][1].content).toBe('Please wait...');
  });

  it('does not throw if sendMessage fails (best-effort)', async () => {
    mockSendMessage.mockRejectedValue(new Error('network'));
    const handle = await sendThinking('dingtalk', makeContext({ sessionWebhook: 'https://hook.example.com' }));
    expect(handle.platform).toBe('dingtalk');
  });

  it('does not send if no sessionWebhook', async () => {
    await sendThinking('feishu', makeContext({ platform: 'feishu' }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('sendFinal', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('sends via sessionWebhook successfully', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const handle = {
      platform: 'dingtalk' as const,
      supportsUpdate: false,
      replyContext: makeContext({ sessionWebhook: 'https://hook.example.com' }),
    };
    const result = await sendFinal(handle, { content: 'Hello' });
    expect(result.success).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledOnce();
  });

  it('returns error if sessionWebhook send fails', async () => {
    mockSendMessage.mockRejectedValue(new Error('timeout'));
    const handle = {
      platform: 'dingtalk' as const,
      supportsUpdate: false,
      replyContext: makeContext({ sessionWebhook: 'https://hook.example.com' }),
    };
    const result = await sendFinal(handle, { content: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('returns error for unknown platform', async () => {
    const handle = {
      platform: 'unknown' as never,
      supportsUpdate: false,
      replyContext: makeContext(),
    };
    const result = await sendFinal(handle, { content: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown platform');
  });

  it('returns degraded success for platforms without sessionWebhook', async () => {
    const handle = {
      platform: 'feishu' as const,
      supportsUpdate: true,
      replyContext: makeContext({ platform: 'feishu' }),
    };
    const result = await sendFinal(handle, { content: 'Hello' });
    // Not a hard error — reply is stored in conversation
    expect(result.success).toBe(true);
    expect(result.error).toContain('no_direct_reply');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

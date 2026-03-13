/**
 * SessionMapper Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock stores
vi.mock('../../stores/imChannelStore', () => {
  const sessions: Record<string, unknown> = {};
  return {
    useIMChannelStore: {
      getState: () => ({
        channels: {},
        sessions,
        upsertSession: vi.fn((key: string, session: unknown) => {
          sessions[key] = session;
        }),
        removeSession: vi.fn((key: string) => {
          delete sessions[key];
        }),
        incrementSessionRound: vi.fn((key: string) => {
          const s = sessions[key] as { messageCount: number; lastActiveAt: number } | undefined;
          if (s) {
            s.messageCount++;
            s.lastActiveAt = Date.now();
          }
        }),
      }),
    },
  };
});

vi.mock('../../stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      conversations: { 'conv-new': { messages: [] } },
      createConversation: vi.fn(() => 'conv-new'),
      renameConversation: vi.fn(),
    }),
  },
}));

import { SessionMapper } from './sessionMapper';
import type { NormalizedIMMessage } from './inboundRouter';
import type { IMChannel } from '../../types/imChannel';
import { useIMChannelStore } from '../../stores/imChannelStore';

function makeMessage(overrides: Partial<NormalizedIMMessage> = {}): NormalizedIMMessage {
  return {
    senderId: 'u1',
    senderName: '张三',
    text: 'hello',
    isMention: true,
    isDirect: false,
    chatId: 'chat1',
    platform: 'dchat',
    replyContext: { platform: 'dchat', vchannelId: 'vc1' },
    raw: {},
    ...overrides,
  };
}

function makeChannel(overrides: Partial<IMChannel> = {}): IMChannel {
  return {
    id: 'ch1',
    platform: 'dchat',
    name: 'Test',
    appId: 'app1',
    appSecret: 'secret1',
    capability: 'safe_tools',
    allowedUsers: [],
    workspacePaths: [],
    sessionTimeoutMinutes: 30,
    maxRoundsPerSession: 50,
    enabled: true,
    status: 'connected',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('SessionMapper', () => {
  let mapper: SessionMapper;

  beforeEach(() => {
    mapper = new SessionMapper();
    // Clear mock sessions
    const store = useIMChannelStore.getState();
    for (const key of Object.keys(store.sessions)) {
      delete store.sessions[key];
    }
  });

  it('creates new session for first message', () => {
    const result = mapper.resolve(makeMessage(), makeChannel(), 'safe_tools');
    expect(result.isNew).toBe(true);
    expect(result.session.userId).toBe('u1');
    expect(result.session.platform).toBe('dchat');
  });

  it('reuses existing session within timeout', () => {
    const msg = makeMessage();
    const channel = makeChannel();

    // First message creates session
    const first = mapper.resolve(msg, channel, 'safe_tools');
    expect(first.isNew).toBe(true);

    // Second message reuses session
    const second = mapper.resolve(msg, channel, 'safe_tools');
    expect(second.isNew).toBe(false);
  });

  it('uses thread key for Slack with thread_ts', () => {
    const msg = makeMessage({
      platform: 'slack',
      replyContext: { platform: 'slack', channelId: 'C1', threadTs: '123.456' },
    });
    const result = mapper.resolve(msg, makeChannel({ platform: 'slack' }), 'safe_tools');
    expect(result.session.key).toBe('slack:chat1:123.456');
  });

  it('uses window key with senderId for group chats', () => {
    const result = mapper.resolve(makeMessage(), makeChannel(), 'safe_tools');
    expect(result.session.key).toBe('dchat:chat1:u1:window');
  });

  it('uses window key without senderId for direct chats', () => {
    const result = mapper.resolve(
      makeMessage({ isDirect: true }),
      makeChannel(),
      'safe_tools',
    );
    expect(result.session.key).toBe('dchat:chat1:window');
  });

  it('creates new session after timeout', () => {
    const msg = makeMessage();
    const channel = makeChannel({ sessionTimeoutMinutes: 0 }); // immediate timeout

    const first = mapper.resolve(msg, channel, 'safe_tools');
    expect(first.isNew).toBe(true);

    // Manually expire the session
    const store = useIMChannelStore.getState();
    const session = store.sessions['dchat:chat1:u1:window'] as { lastActiveAt: number };
    if (session) session.lastActiveAt = Date.now() - 1; // expired since timeout is 0

    const second = mapper.resolve(msg, channel, 'safe_tools');
    expect(second.isNew).toBe(true);
  });

  it('creates new session after maxRounds exceeded', () => {
    const msg = makeMessage();
    const channel = makeChannel({ maxRoundsPerSession: 2 });

    mapper.resolve(msg, channel, 'safe_tools');

    // Simulate reaching max rounds
    const store = useIMChannelStore.getState();
    const session = store.sessions['dchat:chat1:u1:window'] as { messageCount: number };
    if (session) session.messageCount = 2; // at limit

    const result = mapper.resolve(msg, channel, 'safe_tools');
    expect(result.isNew).toBe(true);
  });

  it('creates new session when conversation was deleted', () => {
    const msg = makeMessage();
    const channel = makeChannel();

    const first = mapper.resolve(msg, channel, 'safe_tools');
    expect(first.isNew).toBe(true);

    // Change the conversationId to one that doesn't exist in chatStore mock
    const store = useIMChannelStore.getState();
    const session = store.sessions['dchat:chat1:u1:window'] as { conversationId: string };
    if (session) session.conversationId = 'conv-deleted';

    const second = mapper.resolve(msg, channel, 'safe_tools');
    expect(second.isNew).toBe(true);
  });

  it('returns hasRecoverableSession hint after timeout', () => {
    const msg = makeMessage();
    const channel = makeChannel({ sessionTimeoutMinutes: 0 });

    mapper.resolve(msg, channel, 'safe_tools');

    // Expire the session
    const store = useIMChannelStore.getState();
    const session = store.sessions['dchat:chat1:u1:window'] as { lastActiveAt: number };
    if (session) session.lastActiveAt = Date.now() - 1;

    const result = mapper.resolve(msg, channel, 'safe_tools');
    expect(result.isNew).toBe(true);
    expect(result.hasRecoverableSession).toBe(true);
  });

  it('recovers previous session on "继续上次"', () => {
    const channel = makeChannel({ sessionTimeoutMinutes: 0 });

    // Create and expire a session
    const first = mapper.resolve(makeMessage(), channel, 'safe_tools');
    expect(first.isNew).toBe(true);

    const store = useIMChannelStore.getState();
    const session = store.sessions['dchat:chat1:u1:window'] as { lastActiveAt: number };
    if (session) session.lastActiveAt = Date.now() - 1;

    // Trigger new session (which archives the old one)
    mapper.resolve(makeMessage({ text: 'new topic' }), channel, 'safe_tools');

    // Now request recovery
    const recovered = mapper.resolve(
      makeMessage({ text: '继续上次' }),
      channel,
      'safe_tools',
    );
    expect(recovered.isRecovered).toBe(true);
  });

  describe('cleanup', () => {
    it('removes expired sessions and archives them', () => {
      const msg = makeMessage();
      const channel = makeChannel({ id: 'ch1', sessionTimeoutMinutes: 30 });

      mapper.resolve(msg, channel, 'safe_tools');

      // Expire the session
      const store = useIMChannelStore.getState();
      const key = 'dchat:chat1:u1:window';
      const session = store.sessions[key] as { lastActiveAt: number; channelId: string };
      if (session) session.lastActiveAt = Date.now() - 31 * 60 * 1000;

      // Add channel to store so cleanup can read timeout
      (store.channels as Record<string, unknown>)['ch1'] = channel;

      mapper.cleanup();

      expect(store.sessions[key]).toBeUndefined();
    });

    it('cleans up archived sessions older than 24h', () => {
      const channel = makeChannel({ sessionTimeoutMinutes: 0 });

      mapper.resolve(makeMessage(), channel, 'safe_tools');

      // Expire and archive
      const store = useIMChannelStore.getState();
      const key = 'dchat:chat1:u1:window';
      const session = store.sessions[key] as { lastActiveAt: number; channelId: string };
      if (session) session.lastActiveAt = Date.now() - 1;
      (store.channels as Record<string, unknown>)['ch1'] = channel;

      mapper.cleanup(); // archives the session

      // Age the archived session beyond 24h
      // Access internal previousSessions via another resolve that triggers archive check
      // We use cleanup again after manually aging — simplest approach: just call resolve
      // to verify old archive is gone by checking "继续上次" returns no recovery
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
      mapper.cleanup(); // should clean up >24h archived sessions

      const recovered = mapper.resolve(
        makeMessage({ text: '继续上次' }),
        channel,
        'safe_tools',
      );
      expect(recovered.isRecovered).toBeUndefined();
      vi.restoreAllMocks();
    });
  });
});

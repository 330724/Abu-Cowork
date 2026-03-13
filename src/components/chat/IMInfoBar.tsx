/**
 * IMInfoBar — Shows IM channel context at the top of IM conversations
 *
 * Displays: platform icon, sender name, chat name, capability level,
 * start time, round count, and an "End Session" button.
 */

import { useIMChannelStore } from '@/stores/imChannelStore';
import { useI18n } from '@/i18n';
import type { Conversation } from '@/types';
import type { IMCapabilityLevel } from '@/types/imChannel';
import { Radio, X } from 'lucide-react';

const PLATFORM_ICONS: Record<string, string> = {
  feishu: '🔷',
  dchat: '🟡',
  dingtalk: '🔵',
  wecom: '🟢',
  slack: '🟣',
};

const PLATFORM_LABELS: Record<string, string> = {
  feishu: '飞书',
  dchat: 'D-Chat',
  dingtalk: '钉钉',
  wecom: '企微',
  slack: 'Slack',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

interface IMInfoBarProps {
  conversation: Conversation;
}

export default function IMInfoBar({ conversation }: IMInfoBarProps) {
  const { t } = useI18n();
  const platform = conversation.imPlatform ?? '';
  const channelId = conversation.imChannelId;

  // Get session info from store
  const sessions = useIMChannelStore((s) => s.sessions);
  const session = Object.values(sessions).find((s) => s.conversationId === conversation.id);

  // Get channel info
  const channel = channelId ? useIMChannelStore((s) => s.channels[channelId]) : null;

  const capabilityLabels: Record<IMCapabilityLevel, string> = {
    chat_only: t.imChannel.capabilityChatOnly,
    read_tools: t.imChannel.capabilityReadTools,
    safe_tools: t.imChannel.capabilitySafeTools,
    full: t.imChannel.capabilityFull,
  };

  const capability = session?.capability ?? channel?.capability ?? 'safe_tools';
  const rounds = session?.messageCount ?? conversation.messages.filter((m) => m.role === 'user').length;
  const startTime = conversation.createdAt;

  const handleEndSession = () => {
    if (!session || !confirm(t.imChannel.infoBarEndConfirm)) return;
    useIMChannelStore.getState().removeSession(session.key);
  };

  return (
    <div className="shrink-0 flex items-center gap-3 px-6 md:px-10 py-2 bg-white/60 border-b border-[#e8e6df] text-[13px]">
      {/* Platform icon + context */}
      <div className="flex items-center gap-1.5">
        <span>{PLATFORM_ICONS[platform] ?? '💬'}</span>
        <span className="font-medium text-[#29261b]">
          {session?.userName ?? ''}
        </span>
        <span className="text-[#656358]">·</span>
        <span className="text-[#656358]">
          {PLATFORM_LABELS[platform] ?? platform}
        </span>
        {session?.chatName && (
          <>
            <span className="text-[#656358]">·</span>
            <span className="text-[#656358]">{session.chatName}</span>
          </>
        )}
      </div>

      {/* Divider */}
      <span className="text-[#d5d3cb]">|</span>

      {/* Capability */}
      <span className="text-[#656358]">
        {t.imChannel.infoBarCapability}: {capabilityLabels[capability]}
      </span>

      <span className="text-[#d5d3cb]">|</span>

      {/* Time + rounds */}
      <span className="text-[#656358]">
        {formatTime(startTime)}
      </span>
      <span className="text-[#d5d3cb]">|</span>
      <span className="text-[#656358]">
        {rounds} {t.imChannel.infoBarRounds}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* End session button */}
      {session && (
        <button
          onClick={handleEndSession}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] text-[#656358] hover:text-[#e53935] hover:bg-red-50 transition-colors"
        >
          <X className="h-3 w-3" />
          {t.imChannel.infoBarEndSession}
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useIMChannelStore } from '@/stores/imChannelStore';
import { useI18n } from '@/i18n';
import { triggerEngine } from '@/core/trigger/triggerEngine';
import { Plus, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Select } from '@/components/ui/select';
import type { IMPlatform } from '@/types/trigger';
import type { IMCapabilityLevel } from '@/types/imChannel';

const PLATFORMS: { value: IMPlatform; label: string }[] = [
  { value: 'dchat', label: 'D-Chat' },
  { value: 'feishu', label: '飞书' },
  { value: 'dingtalk', label: '钉钉' },
  { value: 'wecom', label: '企业微信' },
  { value: 'slack', label: 'Slack' },
];

const CAPABILITY_OPTIONS: { value: IMCapabilityLevel; labelKey: keyof ReturnType<typeof useCapLabels> }[] = [
  { value: 'chat_only', labelKey: 'chat_only' },
  { value: 'read_tools', labelKey: 'read_tools' },
  { value: 'safe_tools', labelKey: 'safe_tools' },
  { value: 'full', labelKey: 'full' },
];

function useCapLabels() {
  const { t } = useI18n();
  return {
    chat_only: t.imChannel.capabilityChatOnly,
    read_tools: t.imChannel.capabilityReadTools,
    safe_tools: t.imChannel.capabilitySafeTools,
    full: t.imChannel.capabilityFull,
  };
}

export default function IMChannelSection() {
  const { t } = useI18n();
  const channels = useIMChannelStore(s => s.channels);
  const sessions = useIMChannelStore(s => s.sessions);
  const addChannel = useIMChannelStore(s => s.addChannel);
  const updateChannel = useIMChannelStore(s => s.updateChannel);
  const removeChannel = useIMChannelStore(s => s.removeChannel);
  const capLabels = useCapLabels();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState<IMPlatform>('feishu');
  const [newAppId, setNewAppId] = useState('');
  const [newAppSecret, setNewAppSecret] = useState('');
  const [newCapability, setNewCapability] = useState<IMCapabilityLevel>('safe_tools');

  const channelList = Object.values(channels);
  const serverPort = triggerEngine.getServerPort() ?? 18080;

  const handleAdd = () => {
    if (!newName.trim() || !newAppId.trim() || !newAppSecret.trim()) return;
    addChannel({
      platform: newPlatform,
      name: newName.trim(),
      appId: newAppId.trim(),
      appSecret: newAppSecret.trim(),
      capability: newCapability,
    });
    setNewName('');
    setNewAppId('');
    setNewAppSecret('');
    setNewCapability('safe_tools');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm(t.imChannel.deleteConfirm)) {
      removeChannel(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  const getSessionCount = (channelId: string) =>
    Object.values(sessions).filter(s => s.channelId === channelId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-[#29261b]">{t.imChannel.title}</h3>
        <p className="text-xs text-[#888579] mt-1">{t.imChannel.description}</p>
      </div>

      {/* Channel List */}
      {channelList.length === 0 && !showAddForm && (
        <div className="p-8 rounded-xl border border-dashed border-[#d4d0c8] bg-white text-center">
          <p className="text-sm text-[#888579]">{t.imChannel.noChannels}</p>
          <p className="text-xs text-[#aaa89e] mt-1">{t.imChannel.noChannelsHint}</p>
        </div>
      )}

      {channelList.map((channel) => {
        const isExpanded = expandedId === channel.id;
        const sessionCount = getSessionCount(channel.id);
        const webhookUrl = `http://127.0.0.1:${serverPort}/im/${channel.platform}/webhook`;

        return (
          <div key={channel.id} className="rounded-xl border border-[#e8e4dd] bg-white overflow-hidden">
            {/* Channel header row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#faf8f5] transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : channel.id)}
            >
              <PlatformBadge platform={channel.platform} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#29261b] truncate">{channel.name}</span>
                  <StatusDot status={channel.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-[#888579] mt-0.5">
                  <span>{capLabels[channel.capability]}</span>
                  {sessionCount > 0 && (
                    <span>{t.imChannel.activeSessions}: {sessionCount}</span>
                  )}
                </div>
              </div>
              <Toggle
                checked={channel.enabled}
                onChange={(v) => {
                  // Stop event from toggling expand
                  updateChannel(channel.id, { enabled: v });
                }}
                size="sm"
              />
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-[#888579] shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#888579] shrink-0" />
              )}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-[#e8e4dd] px-4 py-4 space-y-4">
                {/* Webhook URL */}
                <WebhookUrlField url={webhookUrl} hint={t.imChannel.webhookUrlHint} label={t.imChannel.webhookUrl} />

                {/* Capability */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#29261b]">{t.imChannel.capability}</span>
                  <Select
                    variant="inline"
                    value={channel.capability}
                    options={CAPABILITY_OPTIONS.map(o => ({ value: o.value, label: capLabels[o.value] }))}
                    onChange={(v) => updateChannel(channel.id, { capability: v as IMCapabilityLevel })}
                  />
                </div>

                {/* Session timeout */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#29261b]">{t.imChannel.sessionTimeout}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={channel.sessionTimeoutMinutes}
                      onChange={(e) => updateChannel(channel.id, { sessionTimeoutMinutes: Number(e.target.value) || 30 })}
                      className="w-20 px-2 py-1 text-sm rounded-lg border border-[#e8e4dd] bg-[#faf8f5] text-right"
                    />
                    <span className="text-xs text-[#888579]">{t.imChannel.sessionTimeoutMinutes}</span>
                  </div>
                </div>

                {/* Max rounds */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#29261b]">{t.imChannel.maxRounds}</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={channel.maxRoundsPerSession}
                    onChange={(e) => updateChannel(channel.id, { maxRoundsPerSession: Number(e.target.value) || 50 })}
                    className="w-20 px-2 py-1 text-sm rounded-lg border border-[#e8e4dd] bg-[#faf8f5] text-right"
                  />
                </div>

                {/* Allowed users */}
                <TagInput
                  label={t.imChannel.allowedUsers}
                  hint={t.imChannel.allowedUsersHint}
                  placeholder={t.imChannel.allowedUsersPlaceholder}
                  values={channel.allowedUsers}
                  onChange={(users) => updateChannel(channel.id, { allowedUsers: users })}
                />

                {/* Error display */}
                {channel.lastError && (
                  <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                    {channel.lastError}
                  </div>
                )}

                {/* Delete button */}
                <div className="pt-2 border-t border-[#e8e4dd]">
                  <button
                    onClick={() => handleDelete(channel.id)}
                    className="flex items-center gap-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.common.delete}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Channel Form */}
      {showAddForm && (
        <div className="rounded-xl border border-[#d97757]/30 bg-white p-4 space-y-4">
          <h4 className="text-sm font-medium text-[#29261b]">{t.imChannel.addChannel}</h4>

          {/* Name */}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.imChannel.channelNamePlaceholder}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#e8e4dd] bg-[#faf8f5] placeholder:text-[#aaa89e]"
          />

          {/* Platform */}
          <div className="flex items-center gap-2 flex-wrap">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setNewPlatform(p.value)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  newPlatform === p.value
                    ? 'border-[#d97757] bg-[#d97757]/10 text-[#d97757] font-medium'
                    : 'border-[#e8e4dd] text-[#656358] hover:border-[#d97757]/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* App ID & Secret */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newAppId}
              onChange={(e) => setNewAppId(e.target.value)}
              placeholder={t.imChannel.appIdPlaceholder}
              className="px-3 py-2 text-sm rounded-lg border border-[#e8e4dd] bg-[#faf8f5] placeholder:text-[#aaa89e]"
            />
            <input
              type="password"
              value={newAppSecret}
              onChange={(e) => setNewAppSecret(e.target.value)}
              placeholder={t.imChannel.appSecretPlaceholder}
              className="px-3 py-2 text-sm rounded-lg border border-[#e8e4dd] bg-[#faf8f5] placeholder:text-[#aaa89e]"
            />
          </div>

          {/* Capability */}
          <Select
            variant="inline"
            value={newCapability}
            options={CAPABILITY_OPTIONS.map(o => ({ value: o.value, label: capLabels[o.value] }))}
            onChange={(v) => setNewCapability(v as IMCapabilityLevel)}
          />

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-[#656358] hover:text-[#29261b] rounded-lg transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newAppId.trim() || !newAppSecret.trim()}
              className="px-4 py-2 text-sm text-white bg-[#d97757] hover:bg-[#c4684a] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-[#d97757] border border-dashed border-[#d97757]/40 rounded-xl hover:bg-[#d97757]/5 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t.imChannel.addChannel}
        </button>
      )}
    </div>
  );
}

// ── Sub-components ──

function PlatformBadge({ platform }: { platform: IMPlatform }) {
  const labels: Record<IMPlatform, string> = {
    dchat: 'DC',
    feishu: '飞书',
    dingtalk: '钉钉',
    wecom: '微信',
    slack: 'SL',
  };
  return (
    <div className="h-8 w-8 rounded-lg bg-[#d97757]/10 flex items-center justify-center text-xs font-medium text-[#d97757] shrink-0">
      {labels[platform]?.slice(0, 2) ?? platform.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'connected' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-300';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

function WebhookUrlField({ url, hint, label }: { url: string; hint: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <span className="text-sm text-[#29261b]">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 px-3 py-1.5 text-xs bg-[#f5f3ef] border border-[#e8e4dd] rounded-lg text-[#656358] truncate select-all">
          {url}
        </code>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg hover:bg-[#f5f3ef] transition-colors"
          title="Copy"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-[#888579]" />}
        </button>
      </div>
      <p className="text-xs text-[#aaa89e] mt-1">{hint}</p>
    </div>
  );
}

function TagInput({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!values.includes(input.trim())) {
        onChange([...values, input.trim()]);
      }
      setInput('');
    }
  };
  const removeTag = (tag: string) => onChange(values.filter(v => v !== tag));

  return (
    <div>
      <span className="text-sm text-[#29261b]">{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-[#e8e4dd] bg-[#faf8f5]">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-[#d97757]/10 text-[#d97757] rounded-md"
          >
            {v}
            <button onClick={() => removeTag(v)} className="hover:text-red-500">×</button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] text-xs bg-transparent outline-none placeholder:text-[#aaa89e]"
        />
      </div>
      <p className="text-xs text-[#aaa89e] mt-1">{hint}</p>
    </div>
  );
}

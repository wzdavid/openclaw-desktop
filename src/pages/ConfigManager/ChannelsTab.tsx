// ═══════════════════════════════════════════════════════════
// Config Manager — ChannelsTab
// Phase 3: Channel management UI
// Design: aegis-* Tailwind classes only
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, Search } from 'lucide-react';
import clsx from 'clsx';
import type { GatewayRuntimeConfig, ChannelConfig } from './types';
import {
  MaskedInput,
  FormField,
  SelectField,
  ToggleSwitch,
  ChipInput,
  ConfirmDialog,
} from './components';
import {
  CHANNEL_TEMPLATES,
  getChannelTemplate,
  getChannelColor,
  type ChannelTemplate,
} from './channelTemplates';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelsTabProps {
  config: GatewayRuntimeConfig;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function TextField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
        'text-aegis-text text-sm placeholder:text-aegis-text-muted',
        'outline-none focus:border-aegis-primary transition-colors duration-200',
        className
      )}
    />
  );
}

function NumberField({
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : Number(v));
      }}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
        'text-aegis-text text-sm placeholder:text-aegis-text-muted',
        'outline-none focus:border-aegis-primary transition-colors duration-200'
      )}
    />
  );
}

function coerceFeishuStreaming(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'off' || normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    return true;
  }
  return false;
}

function coercePreviewStreamingMode(value: unknown, fallbackMode = 'off'): string {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized) return normalized;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const mode = (value as any).mode;
    if (typeof mode === 'string' && mode.trim()) return mode.trim().toLowerCase();
  }
  if (typeof value === 'boolean') return value ? 'partial' : 'off';
  return fallbackMode;
}

function toChannelStreamingValue(channelId: string, mode: string): ChannelConfig['streaming'] {
  const normalized = mode.trim().toLowerCase();
  if (!normalized) return undefined;
  if (channelId === 'telegram' || channelId === 'discord' || channelId === 'slack') {
    return { mode: normalized };
  }
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Icon
// ─────────────────────────────────────────────────────────────────────────────

function ChannelIcon({
  channelId,
  size = 'md',
}: {
  channelId: string;
  size?: 'sm' | 'md';
}) {
  const tmpl = getChannelTemplate(channelId);
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-lg font-bold text-aegis-btn-primary-text flex-shrink-0',
        `bg-gradient-to-br ${getChannelColor(channelId)}`,
        sizeClass
      )}
    >
      {tmpl?.icon ?? channelId[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Row (expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelRowProps {
  channelId: string;
  channelConfig: ChannelConfig;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
  onRemove: () => void;
}

function ChannelRow({ channelId, channelConfig, onChange, onRemove }: ChannelRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tmpl = getChannelTemplate(channelId);
  const isUnknown = !tmpl;
  const enabled = channelConfig.enabled !== false; // default true

  const updateChannel = (patch: Partial<ChannelConfig>) => {
    onChange((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelId]: { ...prev.channels?.[channelId], ...patch },
      },
    }));
  };

  const channelName = tmpl
    ? t(`config.channel.${channelId}`, { defaultValue: channelId })
    : channelId;

  return (
    <div className="mb-2">
      {/* Row header */}
      <div
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center justify-between px-3.5 py-3',
          'bg-aegis-elevated border border-aegis-border rounded-xl',
          'cursor-pointer transition-all duration-200',
          'hover:border-aegis-border-hover hover:bg-white/[0.02]',
          open && 'rounded-b-none border-aegis-primary/20'
        )}
      >
        {/* left */}
        <div className="flex items-center gap-3 min-w-0">
          <ChannelIcon channelId={channelId} />
          <div className="min-w-0">
            <div className="font-semibold text-sm text-aegis-text truncate">{channelName}</div>
            <div className="text-[11px] text-aegis-text-muted font-mono truncate">{channelId}</div>
          </div>
        </div>

        {/* right */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span
            className={clsx(
              'text-[10px] font-bold px-2 py-0.5 rounded-full border',
              enabled
                ? 'bg-aegis-success/10 text-aegis-success border-aegis-success/20'
                : 'bg-aegis-surface text-aegis-text-muted border-aegis-border'
            )}
          >
            {enabled ? t('config.enabled') : t('config.disabled')}
          </span>
          {isUnknown && (
            <span className="text-[10px] text-yellow-400 border border-yellow-400/20 bg-yellow-400/8 rounded-full px-2 py-0.5 font-bold">
              {t('config.unknownChannel')}
            </span>
          )}
          <svg
            width="14" height="14"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={clsx(
              'text-aegis-text-muted transition-transform duration-200',
              open && 'rotate-90'
            )}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div
          className={clsx(
            'border border-aegis-primary/20 border-t-0',
            'rounded-b-xl bg-white/[0.01] p-4 space-y-4'
          )}
        >
          {isUnknown ? (
            /* Unknown channel — show raw JSON */
            <div className="flex flex-col gap-2">
              <p className="text-xs text-yellow-400">{t('config.unknownChannel')} — raw config:</p>
              <pre className={clsx(
                'text-[11px] text-aegis-text-secondary bg-aegis-surface border border-aegis-border',
                'rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all'
              )}>
                {JSON.stringify(channelConfig, null, 2)}
              </pre>
            </div>
          ) : (
            <>
              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-aegis-text-secondary">
                  {t('config.enabled')}
                </span>
                <ToggleSwitch
                  value={enabled}
                  onChange={(v) => updateChannel({ enabled: v })}
                />
              </div>

              {/* Bot Token */}
              {tmpl.tokenField && (
                <FormField
                  label={t(
                    tmpl.tokenField === 'botToken'       ? 'config.botToken'
                    : tmpl.tokenField === 'appToken'     ? 'config.appToken'
                    : tmpl.tokenField === 'token'        ? 'config.botToken'
                    : tmpl.tokenField
                  )}
                  hint={tmpl.tokenEnvKey ? `Or set ${tmpl.tokenEnvKey}` : undefined}
                >
                  <MaskedInput
                    value={(channelConfig as any)[tmpl.tokenField] ?? ''}
                    onChange={(v) => updateChannel({ [tmpl.tokenField]: v || undefined })}
                    placeholder={tmpl.tokenEnvKey || `Enter ${tmpl.tokenField}...`}
                  />
                </FormField>
              )}

              {/* Slack extra — appToken */}
              {channelId === 'slack' && (
                <FormField label={t('config.appToken')} hint="Or set SLACK_APP_TOKEN">
                  <MaskedInput
                    value={(channelConfig as any).appToken ?? ''}
                    onChange={(v) => updateChannel({ appToken: v || undefined })}
                    placeholder="xapp-..."
                  />
                </FormField>
              )}

              {/* Feishu credentials — appId + appSecret */}
              {channelId === 'feishu' && (
                <>
                  <FormField label={t('config.appId')} hint="Or set FEISHU_APP_ID">
                    <MaskedInput
                      value={(channelConfig as any).appId ?? ''}
                      onChange={(v) => updateChannel({ appId: v || undefined } as any)}
                      placeholder="cli_xxx"
                    />
                  </FormField>
                  <FormField label={t('config.appSecret')} hint="Or set FEISHU_APP_SECRET">
                    <MaskedInput
                      value={(channelConfig as any).appSecret ?? ''}
                      onChange={(v) => updateChannel({ appSecret: v || undefined } as any)}
                      placeholder={t('config.appSecret')}
                    />
                  </FormField>
                </>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* DM Policy */}
                {tmpl.supportsDmPolicy && tmpl.dmPolicyOptions && (
                  <FormField label={t('config.dmPolicy')}>
                    <SelectField
                      value={channelConfig.dmPolicy ?? tmpl.defaultDmPolicy ?? ''}
                      onChange={(v) => updateChannel({ dmPolicy: v || undefined })}
                      options={tmpl.dmPolicyOptions.map((o) => ({ value: o, label: o }))}
                    />
                  </FormField>
                )}

                {/* Group Policy */}
                {tmpl.supportsGroupPolicy && tmpl.groupPolicyOptions && (
                  <FormField label={t('config.groupPolicy')}>
                    <SelectField
                      value={(channelConfig as any).groupPolicy ?? tmpl.defaultGroupPolicy ?? ''}
                      onChange={(v) => updateChannel({ groupPolicy: v || undefined })}
                      options={tmpl.groupPolicyOptions.map((o) => ({ value: o, label: o }))}
                    />
                  </FormField>
                )}

                {/* Streaming */}
                {tmpl.supportsStreaming && channelId === 'feishu' && (
                  <FormField label={t('config.streaming')}>
                    <ToggleSwitch
                      value={coerceFeishuStreaming(channelConfig.streaming)}
                      onChange={(v) => updateChannel({ streaming: v })}
                    />
                  </FormField>
                )}

                {tmpl.supportsStreaming && tmpl.streamingModes && channelId !== 'feishu' && (
                  <FormField label={t('config.streaming')}>
                    <SelectField
                      value={coercePreviewStreamingMode(channelConfig.streaming, tmpl.defaultStreaming ?? 'off')}
                      onChange={(v) => updateChannel({ streaming: toChannelStreamingValue(channelId, v) })}
                      options={tmpl.streamingModes.map((o) => ({ value: o, label: o }))}
                    />
                  </FormField>
                )}

                {/* Media Max MB */}
                {tmpl.defaultMediaMaxMb != null && (
                  <FormField label={t('config.mediaMaxMb')}>
                    <NumberField
                      value={(channelConfig as any).mediaMaxMb ?? tmpl.defaultMediaMaxMb}
                      onChange={(v) => updateChannel({ mediaMaxMb: v } as any)}
                      placeholder={String(tmpl.defaultMediaMaxMb)}
                      min={0}
                    />
                  </FormField>
                )}
              </div>

              {/* Allow From */}
              <FormField label={t('config.allowFrom')}>
                <ChipInput
                  values={(channelConfig as any).allowFrom ?? []}
                  onChange={(vals) => updateChannel({ allowFrom: vals } as any)}
                  placeholder={t('config.addIdentifier')}
                />
              </FormField>

              {/* Extra Fields */}
              {tmpl.extraFields?.map((field) => (
                <FormField key={field.key} label={t(`config.${field.key}`, { defaultValue: field.key })}>
                  {field.type === 'boolean' ? (
                    <ToggleSwitch
                      value={(channelConfig as any)[field.key] ?? field.defaultValue ?? false}
                      onChange={(v) => updateChannel({ [field.key]: v } as any)}
                    />
                  ) : field.type === 'number' ? (
                    <NumberField
                      value={(channelConfig as any)[field.key] ?? field.defaultValue}
                      onChange={(v) => updateChannel({ [field.key]: v } as any)}
                      placeholder={String(field.defaultValue ?? '')}
                    />
                  ) : (
                    <TextField
                      value={(channelConfig as any)[field.key] ?? field.defaultValue ?? ''}
                      onChange={(v) => updateChannel({ [field.key]: v || undefined } as any)}
                      placeholder={String(field.defaultValue ?? '')}
                    />
                  )}
                </FormField>
              ))}
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-aegis-border flex-wrap">
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                'border border-red-500/20 text-red-400 bg-red-400/5',
                'hover:bg-red-400/10 hover:border-red-500/40',
                'transition-all duration-200'
              )}
            >
              <Trash2 size={12} /> {t('config.removeChannel')}
            </button>
          </div>

        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={t('config.removeChannel')}
        message={t('config.removeChannelConfirm', { channel: channelName })}
        confirmLabel={t('config.removeChannel')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
        danger
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Channel Modal — Step 1: Pick template
// ─────────────────────────────────────────────────────────────────────────────

interface PickChannelStepProps {
  onPick: (tmpl: ChannelTemplate) => void;
  existingIds: string[];
}

function PickChannelStep({ onPick, existingIds }: PickChannelStepProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? CHANNEL_TEMPLATES.filter(
        (c) =>
          c.id.includes(search.toLowerCase()) ||
          t(`config.channel.${c.id}`, { defaultValue: c.id })
            .toLowerCase()
            .includes(search.toLowerCase())
      )
    : CHANNEL_TEMPLATES;

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-aegis-text-muted" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('config.selectChannelType')}
          className={clsx(
            'w-full bg-aegis-surface border border-aegis-border rounded-lg pl-9 pr-3 py-2',
            'text-aegis-text text-sm placeholder:text-aegis-text-muted',
            'outline-none focus:border-aegis-primary transition-colors duration-200'
          )}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-aegis-text-muted hover:text-aegis-text"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
        {filtered.map((tmpl) => {
          const alreadyAdded = existingIds.includes(tmpl.id);
          return (
            <button
              key={tmpl.id}
              onClick={() => !alreadyAdded && onPick(tmpl)}
              disabled={alreadyAdded}
              className={clsx(
                'flex items-center gap-2.5 p-3 rounded-xl',
                'border text-left transition-all duration-200',
                alreadyAdded
                  ? 'border-aegis-border bg-aegis-elevated opacity-50 cursor-not-allowed'
                  : 'border-aegis-border bg-aegis-elevated hover:border-aegis-border-hover hover:bg-white/[0.03] group cursor-pointer'
              )}
            >
              <div
                className={clsx(
                  'flex items-center justify-center w-9 h-9 rounded-lg font-bold text-aegis-btn-primary-text flex-shrink-0',
                  `bg-gradient-to-br ${tmpl.colorClass}`
                )}
              >
                {tmpl.icon}
              </div>
              <div className="min-w-0">
                <div className={clsx(
                  'font-semibold text-xs text-aegis-text truncate',
                  !alreadyAdded && 'group-hover:text-aegis-primary transition-colors'
                )}>
                  {t(`config.channel.${tmpl.id}`, { defaultValue: tmpl.id })}
                </div>
                {alreadyAdded && (
                  <div className="text-[9px] text-aegis-text-muted">
                    {t('config.alreadyAdded', 'Already added')}
                  </div>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center text-xs text-aegis-text-muted py-6">
            {t('config.noChannelsFound', 'No channels found')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Channel Modal — Step 2: Configure
// ─────────────────────────────────────────────────────────────────────────────

interface ConfigureChannelStepProps {
  tmpl: ChannelTemplate;
  onBack: () => void;
  onAdd: (channelId: string, channelConfig: ChannelConfig) => void;
}

function ConfigureChannelStep({ tmpl, onBack, onAdd }: ConfigureChannelStepProps) {
  const { t } = useTranslation();
  const [token, setToken]           = useState('');
  const [appToken, setAppToken]     = useState('');
  const [feishuAppId, setFeishuAppId]       = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [dmPolicy, setDmPolicy]     = useState(tmpl.defaultDmPolicy ?? '');
  const [streaming, setStreaming]   = useState(tmpl.defaultStreaming ?? '');
  const [feishuStreamingEnabled, setFeishuStreamingEnabled] = useState(
    tmpl.id === 'feishu' ? coerceFeishuStreaming(tmpl.defaultStreaming) : false
  );
  const channelName = t(`config.channel.${tmpl.id}`, { defaultValue: tmpl.id });

  const handleAdd = () => {
    const cfg: ChannelConfig = {
      enabled: true,
      dmPolicy: dmPolicy || undefined,
    };
    if (tmpl.id === 'feishu') {
      cfg.streaming = feishuStreamingEnabled;
    } else if (tmpl.supportsStreaming && tmpl.streamingModes) {
      const selectedMode = streaming || tmpl.defaultStreaming || '';
      cfg.streaming = toChannelStreamingValue(tmpl.id, selectedMode);
    }
    if (tmpl.tokenField && token) {
      (cfg as any)[tmpl.tokenField] = token;
    }
    if (tmpl.id === 'slack' && appToken) {
      (cfg as any).appToken = appToken;
    }
    if (tmpl.id === 'feishu') {
      if (feishuAppId) (cfg as any).appId = feishuAppId;
      if (feishuAppSecret) (cfg as any).appSecret = feishuAppSecret;
    }
    onAdd(tmpl.id, cfg);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-aegis-elevated border border-aegis-border rounded-xl">
        <div className={clsx(
          'flex items-center justify-center w-10 h-10 rounded-xl font-bold text-aegis-btn-primary-text text-base flex-shrink-0',
          `bg-gradient-to-br ${tmpl.colorClass}`
        )}>
          {tmpl.icon}
        </div>
        <div>
          <div className="font-bold text-sm text-aegis-text">{channelName}</div>
          {tmpl.docsUrl && (
            <a
              href={tmpl.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-aegis-primary hover:underline"
            >
              Docs ↗
            </a>
          )}
        </div>
      </div>

      {/* Token fields */}
      {tmpl.tokenField && (
        <FormField
          label={t('config.botToken')}
          hint={tmpl.tokenEnvKey ? `Or set ${tmpl.tokenEnvKey}` : undefined}
        >
          <MaskedInput
            value={token}
            onChange={setToken}
            placeholder={tmpl.tokenEnvKey || `Enter ${tmpl.tokenField}...`}
          />
        </FormField>
      )}

      {tmpl.id === 'slack' && (
        <FormField label={t('config.appToken')} hint="Or set SLACK_APP_TOKEN">
          <MaskedInput
            value={appToken}
            onChange={setAppToken}
            placeholder="xapp-..."
          />
        </FormField>
      )}

      {/* Feishu credentials — appId + appSecret */}
      {tmpl.id === 'feishu' && (
        <>
          <FormField label={t('config.appId')} hint="Or set FEISHU_APP_ID">
            <MaskedInput
              value={feishuAppId}
              onChange={setFeishuAppId}
              placeholder="cli_xxx"
            />
          </FormField>
          <FormField label={t('config.appSecret')} hint="Or set FEISHU_APP_SECRET">
            <MaskedInput
              value={feishuAppSecret}
              onChange={setFeishuAppSecret}
              placeholder={t('config.appSecret')}
            />
          </FormField>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* DM Policy */}
        {tmpl.supportsDmPolicy && tmpl.dmPolicyOptions && (
          <FormField label={t('config.dmPolicy')}>
            <SelectField
              value={dmPolicy}
              onChange={setDmPolicy}
              options={tmpl.dmPolicyOptions.map((o) => ({ value: o, label: o }))}
            />
          </FormField>
        )}

        {/* Streaming */}
        {tmpl.supportsStreaming && tmpl.id === 'feishu' && (
          <FormField label={t('config.streaming')}>
            <ToggleSwitch
              value={feishuStreamingEnabled}
              onChange={setFeishuStreamingEnabled}
            />
          </FormField>
        )}

        {tmpl.supportsStreaming && tmpl.streamingModes && tmpl.id !== 'feishu' && (
          <FormField label={t('config.streaming')}>
            <SelectField
              value={streaming}
              onChange={setStreaming}
              options={tmpl.streamingModes.map((o) => ({ value: o, label: o }))}
            />
          </FormField>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 pt-1 border-t border-aegis-border">
        <button
          onClick={onBack}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'border border-aegis-border text-aegis-text-secondary',
            'hover:bg-white/[0.03] hover:border-aegis-border-hover',
            'transition-all duration-200'
          )}
        >
          {t('config.back')}
        </button>
        <button
          onClick={handleAdd}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
            'text-sm font-bold bg-aegis-primary text-aegis-btn-primary-text',
            'hover:brightness-110 transition-all duration-200'
          )}
        >
          <Plus size={14} /> {t('config.addChannel')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Channel Modal — Shell
// ─────────────────────────────────────────────────────────────────────────────

interface AddChannelModalProps {
  onClose: () => void;
  onAdd: (channelId: string, channelConfig: ChannelConfig) => void;
  existingIds: string[];
}

function AddChannelModal({ onClose, onAdd, existingIds }: AddChannelModalProps) {
  const { t } = useTranslation();
  const [step, setStep]                       = useState<'pick' | 'configure'>('pick');
  const [selectedTmpl, setSelectedTmpl]       = useState<ChannelTemplate | null>(null);

  const handlePick = (tmpl: ChannelTemplate) => {
    setSelectedTmpl(tmpl);
    setStep('configure');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          'bg-aegis-card-solid border border-aegis-border rounded-2xl w-full max-w-lg',
          'max-h-[85vh] overflow-hidden flex flex-col',
          'shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
          'animate-[pop-in_0.15s_ease-out]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-aegis-border">
          <h3 className="text-sm font-bold text-aegis-text">
            {step === 'pick'
              ? t('config.addChannel')
              : `Configure ${selectedTmpl ? t(`config.channel.${selectedTmpl.id}`, { defaultValue: selectedTmpl.id }) : ''}`}
          </h3>
          <button
            onClick={onClose}
            className="text-aegis-text-muted hover:text-aegis-text transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="p-5 overflow-y-auto flex-1">
          {step === 'pick' ? (
            <PickChannelStep
              onPick={handlePick}
              existingIds={existingIds}
            />
          ) : selectedTmpl ? (
            <ConfigureChannelStep
              tmpl={selectedTmpl}
              onBack={() => setStep('pick')}
              onAdd={(id, cfg) => { onAdd(id, cfg); onClose(); }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChannelsTab — Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ChannelsTab({ config, onChange }: ChannelsTabProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  const channels    = config.channels ?? {};
  const channelKeys = Object.keys(channels);
  const enabledCount = channelKeys.filter((k) => channels[k]?.enabled !== false).length;
  const modelByChannel = (config.channels as any)?.modelByChannel;

  const addChannel = (channelId: string, channelConfig: ChannelConfig) => {
    onChange((prev) => ({
      ...prev,
      channels: { ...prev.channels, [channelId]: channelConfig },
    }));
  };

  const removeChannel = (channelId: string) => {
    onChange((prev) => {
      const chs = { ...prev.channels };
      delete chs[channelId];
      return { ...prev, channels: chs };
    });
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Overview Hero ── */}
      <div className="rounded-xl border border-aegis-border p-5 bg-white/[0.02] backdrop-blur-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-aegis-text">💬 {t('config.channels')}</h2>
            <p className="text-xs text-aegis-text-muted mt-0.5">
              {enabledCount} of {channelKeys.length} channels enabled
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
              'bg-aegis-primary text-aegis-btn-primary-text',
              'hover:brightness-110 transition-all duration-200'
            )}
          >
            <Plus size={12} /> {t('config.addChannel')}
          </button>
        </div>

        {/* Channel icon row */}
        {channelKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {channelKeys.map((id) => (
              <div
                key={id}
                title={t(`config.channel.${id}`, { defaultValue: id })}
                className={clsx(
                  'flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold text-aegis-btn-primary-text',
                  `bg-gradient-to-br ${getChannelColor(id)}`,
                  channels[id]?.enabled === false && 'opacity-40'
                )}
              >
                {getChannelTemplate(id)?.icon ?? id[0]?.toUpperCase() ?? '?'}
              </div>
            ))}
          </div>
        )}

        {/* Model by channel */}
        {modelByChannel && typeof modelByChannel === 'object' && (
          <div className="mt-3 p-3.5 bg-aegis-surface border border-aegis-border rounded-xl">
            <div className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider mb-2">
              {t('config.modelByChannel')}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(modelByChannel).map(([ch, model]) => (
                <div
                  key={ch}
                  className="flex items-center gap-1.5 text-xs bg-aegis-elevated border border-aegis-border rounded-full px-2.5 py-1"
                >
                  <span className="text-aegis-text-muted">{ch}</span>
                  <span className="text-aegis-border">→</span>
                  <span className="text-aegis-primary font-medium truncate max-w-[120px]">
                    {String(model)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Channel List ── */}
      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-aegis-border">
          <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
            📡 {t('config.channelList')}
          </h3>
        </div>

        <div className="p-4">
          {channelKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="text-4xl opacity-40">💬</div>
              <p className="text-sm font-medium text-aegis-text-secondary">{t('config.noChannels')}</p>
              <p className="text-xs text-aegis-text-muted">{t('config.addFirstChannel')}</p>
              <button
                onClick={() => setShowModal(true)}
                className={clsx(
                  'mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold',
                  'bg-aegis-primary text-aegis-btn-primary-text hover:brightness-110',
                  'transition-all duration-200'
                )}
              >
                <Plus size={14} /> {t('config.addChannel')}
              </button>
            </div>
          ) : (
            <>
              {channelKeys.map((channelId) => (
                <ChannelRow
                  key={channelId}
                  channelId={channelId}
                  channelConfig={channels[channelId]}
                  onChange={onChange}
                  onRemove={() => removeChannel(channelId)}
                />
              ))}

              {/* Add row */}
              <button
                onClick={() => setShowModal(true)}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 p-4 mt-1',
                  'border-2 border-dashed border-aegis-border rounded-xl',
                  'text-xs font-semibold text-aegis-text-muted',
                  'hover:border-aegis-primary hover:text-aegis-primary hover:bg-aegis-primary/5',
                  'transition-all duration-200 cursor-pointer'
                )}
              >
                <Plus size={13} /> {t('config.addChannel')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add Channel Modal */}
      {showModal && (
        <AddChannelModal
          onClose={() => setShowModal(false)}
          onAdd={addChannel}
          existingIds={channelKeys}
        />
      )}
    </div>
  );
}

export default ChannelsTab;

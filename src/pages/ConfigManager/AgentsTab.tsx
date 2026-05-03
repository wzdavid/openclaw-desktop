// ═══════════════════════════════════════════════════════════
// Config Manager — AgentsTab
// Phase 3: Agent defaults + agent list management
// Design: aegis-* Tailwind classes only
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Bot, Settings2, Activity, Cpu, Scissors } from 'lucide-react';
import clsx from 'clsx';
import type { GatewayRuntimeConfig, AgentConfig } from './types';
import {
  ExpandableCard,
  FormField,
  SelectField,
  ToggleSwitch,
  ChipInput,
  ConfirmDialog,
  MaskedInput,
} from './components';
import { ModelDropdown } from '@/components/shared/ModelDropdown';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentsTabProps {
  config: GatewayRuntimeConfig;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const THINKING_OPTIONS = [
  { value: 'off',    label: 'Off' },
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
];

const COMPACTION_MODE_OPTIONS = [
  { value: 'rolling',   label: 'Rolling' },
  { value: 'safeguard', label: 'Safeguard' },
  { value: 'full',      label: 'Full' },
  { value: 'off',       label: 'Off' },
];

const PRUNING_MODE_OPTIONS = [
  { value: 'adaptive',  label: 'Adaptive' },
  { value: 'cache-ttl', label: 'Cache TTL' },
  { value: 'off',       label: 'Off' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FallbackModelPicker — chips of existing fallbacks + ModelDropdown to add more
// ─────────────────────────────────────────────────────────────────────────────

interface FallbackModelPickerProps {
  values: string[];
  onChange: (vals: string[]) => void;
}

function FallbackModelPicker({ values, onChange }: FallbackModelPickerProps) {
  const { t } = useTranslation();
  const remove = (id: string) => onChange(values.filter((v) => v !== id));
  const add = (id: string) => {
    if (!id || values.includes(id)) return;
    onChange([...values, id]);
  };

  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((id) => (
            <span
              key={id}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono',
                'border border-aegis-border bg-aegis-elevated text-aegis-text-secondary'
              )}
            >
              {id}
              <button
                type="button"
                onClick={() => remove(id)}
                className="text-aegis-text-muted hover:text-red-400 transition-colors"
                aria-label={t('config.remove')}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <ModelDropdown
        value={null}
        onChange={add}
        placeholder={t('config.addFallbackModel', 'Add fallback model...')}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TextField — simple text input with aegis styling
// ─────────────────────────────────────────────────────────────────────────────

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}

function TextField({ value, onChange, placeholder, className, mono }: TextFieldProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
        'text-aegis-text text-sm placeholder:text-aegis-text-muted',
        'outline-none focus:border-aegis-primary transition-colors duration-200',
        mono && 'font-mono',
        className
      )}
    />
  );
}

interface NumberFieldProps {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}

function NumberField({ value, onChange, placeholder, min, max, className }: NumberFieldProps) {
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
        'outline-none focus:border-aegis-primary transition-colors duration-200',
        className
      )}
    />
  );
}

interface TextareaFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

function TextareaField({ value, onChange, placeholder, rows = 3, className }: TextareaFieldProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={clsx(
        'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
        'text-aegis-text text-sm placeholder:text-aegis-text-muted',
        'outline-none focus:border-aegis-primary transition-colors duration-200 resize-y',
        className
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Row (expandable)
// ─────────────────────────────────────────────────────────────────────────────

const MAIN_AGENT_ID = 'main';

interface AgentRowProps {
  agent: AgentConfig;
  displayIndex: number;
  isMain: boolean;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
  onUpdate: (patch: Partial<AgentConfig>) => void;
  onRemove: () => void;
}

function AgentRow({ agent, displayIndex, isMain, onChange, onUpdate, onRemove }: AgentRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const primaryModel = agent.model?.primary ?? '';
  const heartbeatEnabled = !!agent.heartbeat?.every;
  const isDefault = !!agent.isDefault;

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
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
            'bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary font-bold'
          )}>
            {(agent.name ?? agent.id).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-aegis-text truncate">
                {agent.name ?? agent.id}
              </span>
              {isMain && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary">
                  {t('agents.mainAgent', 'Main Agent')}
                </span>
              )}
              {!isMain && isDefault && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary">
                  {t('config.isDefault')}
                </span>
              )}
            </div>
            <div className="text-[11px] text-aegis-text-muted font-mono truncate">{agent.id}</div>
          </div>
        </div>

        {/* right */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {primaryModel && (
            <span className="text-[10px] text-aegis-text-muted bg-aegis-surface border border-aegis-border rounded-full px-2.5 py-0.5 max-w-[120px] truncate hidden sm:block">
              {primaryModel}
            </span>
          )}
          <div className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            heartbeatEnabled
              ? 'bg-aegis-success shadow-[0_0_6px_rgb(var(--aegis-success)/0.5)]'
              : 'bg-aegis-border'
          )} title={heartbeatEnabled ? 'Heartbeat on' : 'Heartbeat off'} />
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
        <div className={clsx(
          'border border-aegis-primary/20 border-t-0',
          'rounded-b-xl bg-white/[0.01] p-4 space-y-4'
        )}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label={t('config.agentName')}>
              <TextField
                value={agent.name ?? ''}
                onChange={(v) => onUpdate({ name: v || undefined })}
                placeholder={agent.id}
              />
            </FormField>
            <FormField label={t('config.primaryModel')} hint={t('config.inheritedFromDefaults')}>
              <ModelDropdown
                value={agent.model?.primary || null}
                onChange={(v) =>
                  onUpdate({ model: { ...agent.model, primary: v || undefined } })
                }
                placeholder={t('config.inheritedFromDefaults')}
              />
            </FormField>
          </div>

          <FormField label={t('config.workspace')} hint={t('config.inheritedFromDefaults')}>
            <TextField
              value={agent.workspace ?? ''}
              onChange={(v) => onUpdate({ workspace: v || undefined })}
              placeholder={t('config.inheritedFromDefaults')}
            />
          </FormField>

          {/* Heartbeat */}
          <div className="rounded-lg border border-aegis-border bg-aegis-surface p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-aegis-text-secondary uppercase tracking-wider">
                {t('config.heartbeat')}
              </span>
              <ToggleSwitch
                value={heartbeatEnabled}
                onChange={(v) =>
                  onUpdate({
                    heartbeat: v
                      ? { every: '30m', ...agent.heartbeat }
                      : { ...agent.heartbeat, every: undefined },
                  })
                }
              />
            </div>
            {heartbeatEnabled && (
              <FormField label={t('config.heartbeatEvery')} hint={t('config.heartbeatEveryHint', 'e.g. 30m, 1h, 45m')}>
                <TextField
                  value={agent.heartbeat?.every ?? ''}
                  onChange={(v) =>
                    onUpdate({ heartbeat: { ...agent.heartbeat, every: v } })
                  }
                  placeholder={t('config.heartbeatEveryPlaceholder', '30m')}
                />
              </FormField>
            )}
          </div>

          {/* Subagents */}
          <FormField label={t('config.allowAgents')} hint={t('config.subagents')}>
            <ChipInput
              values={agent.subagents?.allowAgents ?? []}
              onChange={(vals) =>
                onUpdate({ subagents: { ...agent.subagents, allowAgents: vals } })
              }
              placeholder={t('config.agentIdPlaceholder', 'agent-id...')}
            />
          </FormField>

          {/* Is Default */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">{t('config.isDefault')}</span>
            <ToggleSwitch
              value={isDefault}
              onChange={(v) => onUpdate({ isDefault: v || undefined })}
            />
          </div>

          {/* Actions — Main agent cannot be removed */}
          {!isMain && (
            <div className="flex gap-2 pt-1 border-t border-aegis-border">
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                  'border border-red-500/20 text-red-400 bg-red-400/5',
                  'hover:bg-red-400/10 hover:border-red-500/40',
                  'transition-all duration-200'
                )}
              >
                <Trash2 size={12} /> {t('config.removeAgent')}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={t('config.removeAgent')}
        message={t('config.removeAgentConfirm', { name: agent.name ?? agent.id })}
        confirmLabel={t('config.removeAgent')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
        danger
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Agent Modal
// ─────────────────────────────────────────────────────────────────────────────

interface AddAgentModalProps {
  onClose: () => void;
  onAdd: (agent: AgentConfig) => void;
  existingIds: string[];
}

function AddAgentModal({ onClose, onAdd, existingIds }: AddAgentModalProps) {
  const { t } = useTranslation();
  const [id, setId]       = useState('');
  const [name, setName]   = useState('');
  const [model, setModel] = useState('');
  const trimmedId = id.trim();
  const normalizedId = trimmedId.toLowerCase();
  const isMainId = normalizedId === MAIN_AGENT_ID;
  const hasDuplicateId = existingIds.some((existingId) => existingId.toLowerCase() === normalizedId);

  const handleAdd = () => {
    if (!trimmedId) return;
    if (isMainId || hasDuplicateId) {
      return; // Main agent is always present in the list; do not add duplicate
    }
    const agent: AgentConfig = {
      id: trimmedId,
      name: name.trim() || undefined,
      model: model.trim() ? { primary: model.trim() } : undefined,
    };
    onAdd(agent);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          'bg-aegis-card-solid border border-aegis-border rounded-2xl w-full max-w-md',
          'shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
          'animate-[pop-in_0.15s_ease-out]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-aegis-border">
          <h3 className="text-sm font-bold text-aegis-text">{t('config.addAgent')}</h3>
          <button
            onClick={onClose}
            className="text-aegis-text-muted hover:text-aegis-text transition-colors p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="p-5 space-y-4">
          <FormField label={t('config.agentId')} required>
            <TextField
              value={id}
              onChange={setId}
              placeholder={t('config.agentIdExample', 'my-agent')}
              mono
            />
          </FormField>
          <FormField label={t('config.agentName')}>
            <TextField
              value={name}
              onChange={setName}
              placeholder={t('config.agentNameExample', 'My Agent')}
            />
          </FormField>
          <FormField label={t('config.primaryModel')} hint={t('config.inheritedFromDefaults')}>
            <ModelDropdown
              value={model || null}
              onChange={setModel}
              placeholder={t('config.inheritedFromDefaults')}
            />
          </FormField>
        </div>

        {/* footer */}
        <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-aegis-border">
          <button
            onClick={onClose}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'border border-aegis-border text-aegis-text-secondary',
              'hover:bg-white/[0.03] hover:border-aegis-border-hover',
              'transition-all duration-200'
            )}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleAdd}
            disabled={!trimmedId || isMainId || hasDuplicateId}
            title={
              isMainId
                ? t('config.mainAgentReserved', 'Main agent is already in the list')
                : hasDuplicateId
                  ? t('config.agentIdExists', 'Agent ID already exists')
                  : undefined
            }
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'text-sm font-bold bg-aegis-primary text-aegis-btn-primary-text',
              'hover:brightness-110 transition-all duration-200',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <Plus size={14} /> {t('config.addAgent')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentsTab — Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AgentsTab({ config, onChange }: AgentsTabProps) {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);

  const mainAgentDefault: AgentConfig = {
    id: MAIN_AGENT_ID,
    name: t('agents.mainAgent', 'Main Agent'),
  };

  const normalizeAgentList = (input: AgentConfig[] | undefined): AgentConfig[] => {
    const list = Array.isArray(input) ? input : [];
    const mainInList = list.find((agent) => agent?.id === MAIN_AGENT_ID);
    const normalizedMain = mainInList
      ? { ...mainAgentDefault, ...mainInList, id: MAIN_AGENT_ID }
      : { ...mainAgentDefault };
    const others = list.filter((agent) => {
      const agentId = String(agent?.id ?? '').trim();
      return agentId.length > 0 && agentId !== MAIN_AGENT_ID;
    });
    return [normalizedMain, ...others];
  };

  const defaults = config.agents?.defaults ?? {};
  const list     = normalizeAgentList(config.agents?.list);

  // ── Patch helpers ──

  const patchDefaults = (patch: Partial<typeof defaults>) => {
    onChange((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        defaults: { ...prev.agents?.defaults, ...patch },
      },
    }));
  };

  const patchHeartbeat = (patch: Partial<typeof defaults.heartbeat>) => {
    patchDefaults({ heartbeat: { ...defaults.heartbeat, ...patch } });
  };

  const patchCompaction = (patch: Partial<typeof defaults.compaction>) => {
    patchDefaults({ compaction: { ...defaults.compaction, ...patch } });
  };

  const patchMemoryFlush = (patch: Partial<NonNullable<typeof defaults.compaction>['memoryFlush']>) => {
    patchCompaction({ memoryFlush: { ...defaults.compaction?.memoryFlush, ...patch } });
  };

  const patchPruning = (patch: Partial<typeof defaults.contextPruning>) => {
    patchDefaults({ contextPruning: { ...defaults.contextPruning, ...patch } });
  };

  const addAgent = (agent: AgentConfig) => {
    onChange((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        list: normalizeAgentList([...(prev.agents?.list ?? []), agent]),
      },
    }));
  };

  // Display list: Main Agent always first (from list or default), then others
  const displayList: AgentConfig[] = list;

  const updateAgentAtDisplayIndex = (displayIndex: number, patch: Partial<AgentConfig>) => {
    onChange((prev) => {
      const prevList = normalizeAgentList(prev.agents?.list);
      const main = prevList[0] ?? mainAgentDefault;
      const others = prevList.slice(1);
      if (displayIndex === 0) {
        const newList = normalizeAgentList([{ ...main, ...patch }, ...others]);
        return { ...prev, agents: { ...prev.agents, list: newList } };
      }
      const i = displayIndex - 1;
      const newOthers = [...others];
      newOthers[i] = { ...newOthers[i], ...patch };
      return { ...prev, agents: { ...prev.agents, list: normalizeAgentList([main, ...newOthers]) } };
    });
  };

  const removeAgentAtDisplayIndex = (displayIndex: number) => {
    if (displayIndex === 0) return; // Main agent cannot be removed
    onChange((prev) => {
      const prevList = normalizeAgentList(prev.agents?.list);
      const main = prevList[0] ?? mainAgentDefault;
      const others = prevList.slice(1);
      const newOthers = others.filter((_, j) => j !== displayIndex - 1);
      return { ...prev, agents: { ...prev.agents, list: normalizeAgentList([main, ...newOthers]) } };
    });
  };

  // Fallback models from model.fallbacks
  const fallbackModels = defaults.model?.fallbacks ?? [];
  const primaryModel   = defaults.model?.primary ?? '';

  return (
    <div className="flex flex-col gap-4">

      {/* ── A) Agent Defaults ── */}
      <ExpandableCard
        title={t('config.agentDefaults')}
        subtitle={primaryModel || t('config.inheritedFromDefaults')}
        icon={<Settings2 size={16} />}
        defaultExpanded
      >
        {/* Workspace — full row */}
        <FormField label={t('config.workspace')}>
          <TextField
            value={defaults.workspace ?? ''}
            onChange={(v) => patchDefaults({ workspace: v || undefined })}
            placeholder="/workspace/workspace-core"
          />
        </FormField>

        {/* Primary model + Fallback models — side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t('config.primaryModel')}>
            <ModelDropdown
              value={primaryModel || null}
              onChange={(v) =>
                patchDefaults({ model: { ...defaults.model, primary: v || undefined } })
              }
              placeholder="anthropic/claude-sonnet-4.5"
            />
          </FormField>

          <FormField label={t('config.fallbackModels')}>
            <FallbackModelPicker
              values={fallbackModels}
              onChange={(vals) =>
                patchDefaults({ model: { ...defaults.model, fallbacks: vals } })
              }
            />
          </FormField>
        </div>

        {/* Thinking default + Max Concurrent — side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t('config.thinkingDefault')}>
            <SelectField
              value={defaults.thinkingDefault ?? ''}
              onChange={(v) => patchDefaults({ thinkingDefault: v || undefined })}
              options={THINKING_OPTIONS}
              placeholder={t('config.inherit', 'Inherit')}
            />
          </FormField>

          <FormField label={t('config.maxConcurrent')}>
            <NumberField
              value={defaults.maxConcurrent}
              onChange={(v) => patchDefaults({ maxConcurrent: v })}
              placeholder="5"
              min={1}
              max={10}
            />
          </FormField>
        </div>
      </ExpandableCard>

      {/* ── B) Heartbeat Settings ── */}
      <ExpandableCard
        title={t('config.heartbeat')}
        subtitle={defaults.heartbeat?.every ?? '—'}
        icon={<Activity size={16} />}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t('config.heartbeatEvery')} hint="e.g. 30m, 1h, 45m">
            <TextField
              value={defaults.heartbeat?.every ?? ''}
              onChange={(v) => patchHeartbeat({ every: v || undefined })}
              placeholder="30m"
            />
          </FormField>
        </div>
        <FormField label={t('config.heartbeatPrompt')}>
          <TextareaField
            value={defaults.heartbeat?.prompt ?? ''}
            onChange={(v) => patchHeartbeat({ prompt: v || undefined })}
            placeholder={t('config.heartbeatReadmePlaceholder', 'Read HEARTBEAT.md if it exists...')}
            rows={4}
          />
        </FormField>
      </ExpandableCard>

      {/* ── C) Compaction Settings ── */}
      <ExpandableCard
        title={t('config.compaction')}
        subtitle={defaults.compaction?.mode ?? '—'}
        icon={<Cpu size={16} />}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t('config.compactionMode')}>
            <SelectField
              value={defaults.compaction?.mode ?? ''}
              onChange={(v) => patchCompaction({ mode: v || undefined })}
              options={COMPACTION_MODE_OPTIONS}
              placeholder={t('config.inherit', 'Inherit')}
            />
          </FormField>
          <FormField label={t('config.reserveTokensFloor')}>
            <NumberField
              value={defaults.compaction?.reserveTokensFloor}
              onChange={(v) => patchCompaction({ reserveTokensFloor: v })}
              placeholder="8000"
            />
          </FormField>
        </div>

        {/* Memory Flush sub-section */}
        <div className="rounded-lg border border-aegis-border bg-aegis-surface p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-aegis-text-secondary uppercase tracking-wider">
              {t('config.memoryFlush')}
            </span>
            <ToggleSwitch
              value={defaults.compaction?.memoryFlush?.enabled ?? false}
              onChange={(v) => patchMemoryFlush({ enabled: v })}
            />
          </div>

          {defaults.compaction?.memoryFlush?.enabled && (
            <div className="space-y-3 pt-1">
              <FormField label={t('config.softThresholdTokens')}>
                <NumberField
                  value={defaults.compaction?.memoryFlush?.softThresholdTokens}
                  onChange={(v) => patchMemoryFlush({ softThresholdTokens: v })}
                  placeholder="120000"
                />
              </FormField>
              <FormField label={t('config.heartbeatPrompt')}>
                <TextareaField
                  value={defaults.compaction?.memoryFlush?.prompt ?? ''}
                  onChange={(v) => patchMemoryFlush({ prompt: v || undefined })}
                  placeholder={t('config.memoryFlushPromptPlaceholder', 'Memory flush prompt...')}
                  rows={3}
                />
              </FormField>
              <FormField label="System Prompt">
                <TextareaField
                  value={defaults.compaction?.memoryFlush?.systemPrompt ?? ''}
                  onChange={(v) => patchMemoryFlush({ systemPrompt: v || undefined })}
                  placeholder={t('config.memoryFlushSystemPromptPlaceholder', 'System prompt for memory flush...')}
                  rows={3}
                />
              </FormField>
            </div>
          )}
        </div>
      </ExpandableCard>

      {/* ── D) Context Pruning (collapsed by default) ── */}
      <ExpandableCard
        title={t('config.contextPruning')}
        subtitle={defaults.contextPruning?.mode ?? '—'}
        icon={<Scissors size={16} />}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t('config.pruningMode')}>
            <SelectField
              value={defaults.contextPruning?.mode ?? ''}
              onChange={(v) => patchPruning({ mode: v || undefined })}
              options={PRUNING_MODE_OPTIONS}
              placeholder={t('config.inherit', 'Inherit')}
            />
          </FormField>
          <FormField label={t('config.ttl')} hint="e.g. 2h, 30m">
            <TextField
              value={defaults.contextPruning?.ttl ?? ''}
              onChange={(v) => patchPruning({ ttl: v || undefined })}
              placeholder="2h"
            />
          </FormField>
          <FormField label={t('config.keepLastAssistants')}>
            <NumberField
              value={defaults.contextPruning?.keepLastAssistants}
              onChange={(v) => patchPruning({ keepLastAssistants: v })}
              placeholder="3"
              min={0}
            />
          </FormField>
          <FormField label={t('config.softTrimRatio')} hint="0 – 1">
            <NumberField
              value={defaults.contextPruning?.softTrimRatio}
              onChange={(v) => patchPruning({ softTrimRatio: v })}
              placeholder="0.2"
              min={0}
              max={1}
            />
          </FormField>
          <FormField label={t('config.minPrunableToolChars')}>
            <NumberField
              value={defaults.contextPruning?.minPrunableToolChars}
              onChange={(v) => patchPruning({ minPrunableToolChars: v })}
              placeholder="500"
              min={0}
            />
          </FormField>
        </div>
      </ExpandableCard>

      {/* ── E) Agent List ── */}
      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-aegis-border">
          <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary flex items-center gap-2">
            <Bot size={13} /> {t('config.agentList')}
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
              'bg-aegis-primary text-aegis-btn-primary-text',
              'hover:brightness-110 transition-all duration-200'
            )}
          >
            <Plus size={12} /> {t('config.addAgent')}
          </button>
        </div>

        <div className="p-4">
          {displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="text-4xl opacity-40">👥</div>
              <p className="text-sm font-medium text-aegis-text-secondary">{t('config.noAgents')}</p>
              <p className="text-xs text-aegis-text-muted">{t('config.addFirstAgent')}</p>
              <button
                onClick={() => setShowAddModal(true)}
                className={clsx(
                  'mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold',
                  'bg-aegis-primary text-aegis-btn-primary-text hover:brightness-110',
                  'transition-all duration-200'
                )}
              >
                <Plus size={14} /> {t('config.addAgent')}
              </button>
            </div>
          ) : (
            <>
              {displayList.map((agent, displayIndex) => (
                <AgentRow
                  key={agent.id === MAIN_AGENT_ID ? MAIN_AGENT_ID : `${agent.id}-${displayIndex}`}
                  agent={agent}
                  displayIndex={displayIndex}
                  isMain={agent.id === MAIN_AGENT_ID}
                  onChange={onChange}
                  onUpdate={(patch) => updateAgentAtDisplayIndex(displayIndex, patch)}
                  onRemove={() => removeAgentAtDisplayIndex(displayIndex)}
                />
              ))}

              {/* Add row */}
              <button
                onClick={() => setShowAddModal(true)}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 p-4 mt-1',
                  'border-2 border-dashed border-aegis-border rounded-xl',
                  'text-xs font-semibold text-aegis-text-muted',
                  'hover:border-aegis-primary hover:text-aegis-primary hover:bg-aegis-primary/5',
                  'transition-all duration-200 cursor-pointer'
                )}
              >
                <Plus size={13} /> {t('config.addAgent')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add Agent Modal */}
      {showAddModal && (
        <AddAgentModal
          onClose={() => setShowAddModal(false)}
          onAdd={addAgent}
          existingIds={displayList.map((agent) => agent.id)}
        />
      )}
    </div>
  );
}

export default AgentsTab;

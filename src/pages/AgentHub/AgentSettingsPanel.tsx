// ═══════════════════════════════════════════════════════════
// AgentSettingsPanel — Slide-out configuration panel
// Per-agent: Model selector + session stats
// NOTE: Per-agent params (cacheRetention, temperature, etc.)
// are NOT in the Gateway AgentEntrySchema (.strict()) as of v2026.2.23.
// They live in agents.defaults.models[].params (per-model, not per-agent).
//
// Fix: The `agents.list` API does NOT return `model` or `params`.
// They live only in the config. So we fetch `config.get` on open
// to hydrate the form with real values.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, Loader2,
  Cpu, Check, ChevronDown, Activity, AlertCircle,
  Search, FolderOpen, Clock, Zap,
} from 'lucide-react';
import { gateway } from '@/services/gateway';
import { useGatewayDataStore } from '@/stores/gatewayDataStore';
import { themeHex, themeAlpha } from '@/utils/theme-colors';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface AgentForPanel {
  id: string;
  name?: string;
  model?: string;
  workspace?: string;
  params?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface SessionForPanel {
  key: string;
  label: string;
  model: string;
  totalTokens: number;
  running: boolean;
  updatedAt: number;
}

interface ModelOption {
  id: string;
  alias?: string;
  displayName: string;
}

interface AgentSettingsPanelProps {
  agent: AgentForPanel | null;
  agentSessions: SessionForPanel[];
  onClose: () => void;
  onSaved: () => void;
}

// Shape of an agent entry inside config.agents.list
// model can be string ("provider/model") or object ({ primary, fallbacks })
interface ConfigAgent {
  id: string;
  name?: string;
  model?: string | { primary?: string; fallbacks?: string[] };
  params?: {
    cacheRetention?: string;
    temperature?: number;
    maxTokens?: number;
    context1m?: boolean;
  };
  [k: string]: unknown;
}

// Shape of the config.get response
interface ConfigGetResponse {
  baseHash?: string;
  hash?: string;
  config?: {
    agents?: {
      list?: ConfigAgent[];
    };
    [k: string]: unknown;
  };
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/** Flexible model ID matching — handles provider/model vs bare model */
function modelsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Compare just the model name part (after the last /)
  const nameA = a.includes('/') ? a.split('/').pop() : a;
  const nameB = b.includes('/') ? b.split('/').pop() : b;
  return nameA === nameB;
}

/** Parse any shape the models.list API might return */
function parseModelsResponse(res: unknown): ModelOption[] {
  const list: ModelOption[] = [];

  // Format A: { models: { "provider/model": { alias, params } } }
  if (
    res !== null &&
    typeof res === 'object' &&
    'models' in res &&
    res.models !== null &&
    typeof res.models === 'object' &&
    !Array.isArray(res.models)
  ) {
    for (const [id, cfg] of Object.entries(res.models as Record<string, unknown>)) {
      const alias =
        cfg !== null && typeof cfg === 'object' && 'alias' in cfg
          ? (cfg as Record<string, unknown>).alias as string | undefined
          : undefined;
      list.push({ id, alias, displayName: alias ? `${alias} — ${id}` : id });
    }
  }
  // Format B: { models: [{ id, alias }] }
  else if (
    res !== null &&
    typeof res === 'object' &&
    'models' in res &&
    Array.isArray((res as Record<string, unknown>).models)
  ) {
    for (const m of (res as Record<string, unknown>).models as unknown[]) {
      if (m === null || typeof m !== 'object') continue;
      const mObj = m as Record<string, unknown>;
      const id = (mObj.id || mObj.model || '') as string;
      const alias = mObj.alias as string | undefined;
      if (id) list.push({ id, alias, displayName: alias ? `${alias} — ${id}` : id });
    }
  }
  // Format C: raw array
  else if (Array.isArray(res)) {
    for (const m of res as unknown[]) {
      const id = typeof m === 'string' ? m : ((m as Record<string, unknown>)?.id as string || '');
      const alias = typeof m === 'object' && m ? ((m as Record<string, unknown>).alias as string | undefined) : undefined;
      if (id) list.push({ id, alias, displayName: alias ? `${alias} — ${id}` : id });
    }
  }

  return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Format a token count to human-readable short form */
function formatTk(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Format a timestamp to relative time string */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════
// Main Panel Component
// ═══════════════════════════════════════════════════════════

export function AgentSettingsPanel({
  agent,
  agentSessions,
  onClose,
  onSaved,
}: AgentSettingsPanelProps) {
  const { t } = useTranslation();

  // ── Remote data ──
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // ── Config-fetch state ──
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // ── Save state ──
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Dropdown ──
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // ── Model search filter (UI state only — does not affect logic) ──
  const [modelSearch, setModelSearch] = useState('');

  // ── Form values ──
  const [selectedModel, setSelectedModel] = useState('');

  // ── Original model (from config.get) — used for hasChanges ──
  const [origModel, setOrigModel] = useState('');

  // Track which agent we last initialized for — prevents polling
  // refreshes from overwriting unsaved user edits.
  const [initializedForId, setInitializedForId] = useState<string | null>(null);

  // ── Fetch config on open (or when agent changes) ──
  useEffect(() => {
    if (!agent) {
      setInitializedForId(null);
      return;
    }

    // Skip if already initialized for this exact agent
    if (agent.id === initializedForId) return;

    let cancelled = false;
    setLoadingConfig(true);
    setConfigError(null);
    setModelDropdownOpen(false);
    setSaved(false);

    gateway.call('config.get', {})
      .then((res: unknown) => {
        if (cancelled) return;

        const snap = res as ConfigGetResponse;

        // Find this agent's entry in config.agents.list
        const agentConfig = snap?.config?.agents?.list?.find(
          (a: ConfigAgent) => a.id === agent.id
        );

        // Resolve model: config first, then agentSessions fallback
        // Model can be string ("provider/model") or object ({ primary, fallbacks })
        const rawModel = agentConfig?.model;
        const cfgModel = typeof rawModel === 'string'
          ? rawModel
          : (rawModel && typeof rawModel === 'object' && 'primary' in rawModel)
            ? String((rawModel as Record<string, unknown>).primary ?? '')
            : '';
        const sessionModel = agentSessions.length > 0 ? agentSessions[0].model : '';
        const resolvedModel = cfgModel || sessionModel || '';

        setSelectedModel(resolvedModel);
        setOrigModel(resolvedModel);
        setInitializedForId(agent.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setConfigError(msg || t('agentSettings.failedToLoadConfig', 'Failed to load config'));
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]); // Only re-run when the agent ID changes

  // ── Fetch available models when panel opens ──
  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    setLoadingModels(true);

    gateway.getAvailableModels()
      .then((res: unknown) => {
        if (cancelled) return;
        const parsed = parseModelsResponse(res);

        // If current model isn't in the list, prepend it so it shows in the dropdown
        if (selectedModel && !parsed.find(m => modelsMatch(m.id, selectedModel))) {
          parsed.unshift({
            id: selectedModel,
            alias: undefined,
            displayName: `${selectedModel.split('/').pop()} — ${selectedModel} (current)`,
          });
        }

        setModels(parsed);
      })
      .catch(() => { if (!cancelled) setModels([]); })
      .finally(() => { if (!cancelled) setLoadingModels(false); });

    return () => { cancelled = true; };
  // We intentionally only re-run on agent change, not on selectedModel change,
  // to avoid re-fetching whenever the user picks a different model.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  // ── hasChanges: disable Save button when nothing is different ──
  const hasChanges = !modelsMatch(selectedModel, origModel);

  // ── Save handler ──
  // Only model change is supported via agents.update RPC.
  // Per-agent params (cacheRetention, temperature, etc.) are NOT supported
  // in agents.list[] schema (.strict()) — removed until Gateway adds support.
  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    try {
      if (selectedModel && !modelsMatch(selectedModel, origModel)) {
        // agents.update persists to config file (writeConfigFile) AND updates runtime
        // No need for config.get/config.set — agents.update handles everything
        await gateway.updateAgent(agent.id, { model: selectedModel });

        // Update local store so agent cards reflect the new model immediately
        const store = useGatewayDataStore.getState();
        store.setAgents(
          store.agents.map(a =>
            a.id === agent.id ? { ...a, model: selectedModel } : a
          )
        );
      }

      setOrigModel(selectedModel);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setInitializedForId(null);
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`${t('agentSettings.saveFailed', 'Failed to save')}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [agent, selectedModel, origModel, onSaved, t]);

  // ── Escape key closes the panel ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Close model dropdown on outside click ──
  useEffect(() => {
    if (!modelDropdownOpen) return;
    // Delay by one tick to avoid closing on the same click that opened it
    const handler = () => setModelDropdownOpen(false);
    const timer = setTimeout(() => window.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); window.removeEventListener('click', handler); };
  }, [modelDropdownOpen]);

  // ── Session stats ──
  // Merge live sessions (from sessions.list) with historical usage data.
  // sessions.list only returns ACTIVE sessions — archived sub-agent sessions
  // (where sessions.json is {}) won't appear. sessionsUsage scans transcript
  // files and includes historical data, so we use it as a fallback.
  const sessionsUsage = useGatewayDataStore((s) => s.sessionsUsage);
  const runningSubAgents = useGatewayDataStore((s) => s.runningSubAgents);

  // Extract historical sessions for this agent from usage data
  const usageSessions = useMemo(() => {
    if (!agent || !sessionsUsage?.sessions) return [];
    const agentId = agent.id;
    return (sessionsUsage.sessions as any[]).filter((s: any) => {
      // Match by agentId field (if present) or by key pattern
      if (s.agentId === agentId) return true;
      const key = s.key || '';
      return key.startsWith(`agent:${agentId}:`);
    }).map((s: any) => ({
      key: s.key || s.sessionId || '',
      label: s.label || s.displayName || s.key || '',
      model: s.model || '',
      totalTokens: s.usage?.totalTokens ?? s.totalTokens ?? 0,
      running: false, // usage data is historical — never "running"
      updatedAt: s.updatedAt || s.usage?.lastActivity || 0,
    }));
  }, [agent, sessionsUsage]);

  // Merge: live sessions take priority (by key), usage sessions fill the gaps
  const mergedSessions = useMemo(() => {
    const liveKeys = new Set(agentSessions.map(s => s.key));
    const fromUsage = usageSessions.filter(s => !liveKeys.has(s.key));
    return [...agentSessions, ...fromUsage];
  }, [agentSessions, usageSessions]);

  // Check for spawned sub-agents (real-time tool stream tracking)
  const isSpawned = runningSubAgents.some(sa => sa.agentId === agent?.id);

  const activeSessions = agentSessions.filter(s => s.running).length + (isSpawned ? 1 : 0);
  const totalTokens = mergedSessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalSessionCount = mergedSessions.length;

  // Latest session by updatedAt — used for "last activity"
  const latestSession = mergedSessions.length > 0
    ? mergedSessions.reduce((latest, s) => s.updatedAt > latest.updatedAt ? s : latest)
    : null;

  // Filtered models list based on search input
  const filteredModels = modelSearch.trim()
    ? models.filter(m => {
        const q = modelSearch.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          (m.alias?.toLowerCase().includes(q) ?? false)
        );
      })
    : models;

  if (!agent) return null;

  const primaryColor = themeHex('primary');
  const successColor = themeHex('success');

  // Short model name shown in header chip (just the part after last /)
  const currentModelShort = (selectedModel || origModel).split('/').pop() ?? '';
  const currentProvider = (selectedModel || origModel).includes('/')
    ? (selectedModel || origModel).split('/')[0]
    : '';

  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* ── Panel (340px — compact and clean) ── */}
          <motion.div
            key="settings-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 end-0 bottom-0 w-[340px] max-w-[92vw] z-50 flex flex-col bg-aegis-bg border-s border-aegis-border shadow-2xl"
          >

            {/* ═══ Header ═══ */}
            <div
              className="shrink-0 px-5 pt-5 pb-4"
              style={{ borderBottom: `1px solid ${themeAlpha('border', 0.6)}` }}
            >
              {/* Top row: name + close */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-extrabold text-aegis-text leading-tight truncate">
                    {agent.name || agent.id}
                  </h2>
                  <p className="text-[9px] text-aegis-text-dim font-mono mt-0.5 truncate">
                    {agent.id}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg text-aegis-text-dim hover:text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.08)] transition-colors mt-0.5"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Current model chip */}
              {(currentModelShort || loadingConfig) && (
                <div className="flex items-center gap-1.5">
                  <Cpu size={10} style={{ color: primaryColor }} className="shrink-0" />
                  {loadingConfig
                    ? (
                      <div
                        className="h-4 w-24 rounded animate-pulse"
                        style={{ background: themeAlpha('overlay', 0.1) }}
                      />
                    )
                    : (
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className="text-[10px] font-bold truncate"
                          style={{ color: primaryColor }}
                        >
                          {currentModelShort}
                        </span>
                        {currentProvider && (
                          <span
                            className="text-[9px] text-aegis-text-dim truncate shrink-0 px-1.5 py-0.5 rounded"
                            style={{ background: themeAlpha('overlay', 0.07) }}
                          >
                            {currentProvider}
                          </span>
                        )}
                      </div>
                    )
                  }
                </div>
              )}
            </div>

            {/* ═══ Scrollable Body ═══ */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* ── Loading: fetching config ── */}
              {loadingConfig && (
                <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-aegis-text-dim">
                  <Loader2 size={24} className="animate-spin" style={{ color: primaryColor }} />
                  <span className="text-[11px]">{t('agentSettings.loadingConfig', 'Loading agent config…')}</span>
                </div>
              )}

              {/* ── Error: config.get failed ── */}
              {!loadingConfig && configError && (
                <div
                  className="rounded-xl border px-4 py-3 flex items-start gap-2.5"
                  style={{
                    background: themeAlpha('danger', 0.07),
                    borderColor: themeAlpha('danger', 0.25),
                  }}
                >
                  <AlertCircle
                    size={14}
                    className="shrink-0 mt-0.5"
                    style={{ color: themeHex('danger') }}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold" style={{ color: themeHex('danger') }}>
                      {t('agentSettings.failedToLoadConfig', 'Failed to load config')}
                    </p>
                    <p className="text-[9px] text-aegis-text-dim mt-0.5 font-mono break-all">
                      {configError}
                    </p>
                    <button
                      className="mt-1.5 text-[10px] font-bold underline"
                      style={{ color: themeHex('danger') }}
                      onClick={() => setInitializedForId(null)}
                    >
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Main form (shown once config is loaded) ── */}
              {!loadingConfig && !configError && (
                <>

                  {/* ── Section: Model Selector ── */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[9px] text-aegis-text-muted uppercase tracking-widest font-bold mb-2">
                      <Cpu size={10} />
                      {t('agentSettings.model', 'Model')}
                    </label>

                    {/* Trigger button */}
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setModelDropdownOpen(v => !v);
                          if (!modelDropdownOpen) setModelSearch('');
                        }}
                        className={clsx(
                          'w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-start text-[12px] transition-all',
                          'border focus:outline-none',
                          modelDropdownOpen
                            ? 'border-aegis-primary/40 bg-[rgb(var(--aegis-overlay)/0.06)]'
                            : 'border-[rgb(var(--aegis-overlay)/0.1)] bg-[rgb(var(--aegis-overlay)/0.04)] hover:border-aegis-primary/30'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          {selectedModel ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-aegis-text font-semibold truncate">
                                {selectedModel.split('/').pop()}
                              </span>
                              {selectedModel.includes('/') && (
                                <span
                                  className="text-[9px] text-aegis-text-dim shrink-0 px-1.5 py-0.5 rounded"
                                  style={{ background: themeAlpha('overlay', 0.08) }}
                                >
                                  {selectedModel.split('/')[0]}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-aegis-text-dim">
                              {t('agentSettings.selectModel', 'Select a model...')}
                            </span>
                          )}
                        </div>
                        {loadingModels
                          ? <Loader2 size={13} className="animate-spin text-aegis-text-dim shrink-0 ms-2" />
                          : (
                            <ChevronDown
                              size={13}
                              className={clsx(
                                'text-aegis-text-dim shrink-0 ms-2 transition-transform',
                                modelDropdownOpen && 'rotate-180'
                              )}
                            />
                          )
                        }
                      </button>

                      {/* Dropdown */}
                      <AnimatePresence>
                        {modelDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.12 }}
                            className="absolute top-full mt-1.5 inset-x-0 z-20 rounded-xl border border-[rgb(var(--aegis-overlay)/0.12)] bg-aegis-bg shadow-2xl overflow-hidden"
                          >
                            {/* Search input */}
                            <div
                              className="px-3 py-2.5 border-b"
                              style={{ borderColor: themeAlpha('overlay', 0.08) }}
                            >
                              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[rgb(var(--aegis-overlay)/0.06)]">
                                <Search size={11} className="text-aegis-text-dim shrink-0" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={modelSearch}
                                  onChange={e => setModelSearch(e.target.value)}
                                  placeholder={t('agentSettings.filterModels', 'Filter models…')}
                                  className="flex-1 bg-transparent text-[11px] text-aegis-text placeholder:text-aegis-text-dim outline-none min-w-0"
                                />
                                {modelSearch && (
                                  <button
                                    onClick={() => setModelSearch('')}
                                    className="text-aegis-text-dim hover:text-aegis-text transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Model list */}
                            <div className="max-h-[200px] overflow-y-auto">
                              {filteredModels.length === 0 && !loadingModels && (
                                <div className="px-4 py-3.5 text-[11px] text-aegis-text-dim text-center">
                                  {modelSearch
                                    ? `No models match "${modelSearch}"`
                                    : t('agentSettings.noModels', 'No models available')}
                                </div>
                              )}
                              {filteredModels.map(m => {
                                const isSelected = modelsMatch(selectedModel, m.id);
                                const modelName = m.id.split('/').pop() ?? m.id;
                                const provider = m.id.includes('/') ? m.id.split('/')[0] : '';
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      setSelectedModel(m.id);
                                      setModelDropdownOpen(false);
                                      setModelSearch('');
                                    }}
                                    className={clsx(
                                      'w-full text-start px-3.5 py-2.5 transition-colors flex items-center gap-2.5',
                                      isSelected
                                        ? 'bg-aegis-accent/10'
                                        : 'hover:bg-[rgb(var(--aegis-overlay)/0.05)]'
                                    )}
                                  >
                                    {/* Selection indicator */}
                                    <div
                                      className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center border transition-colors"
                                      style={{
                                        borderColor: isSelected ? primaryColor : themeAlpha('overlay', 0.2),
                                        background: isSelected ? `${primaryColor}18` : 'transparent',
                                      }}
                                    >
                                      {isSelected && (
                                        <Check size={9} style={{ color: primaryColor }} />
                                      )}
                                    </div>

                                    {/* Model info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                          className={clsx(
                                            'text-[11px] font-semibold truncate',
                                            isSelected ? 'text-aegis-text' : 'text-aegis-text'
                                          )}
                                        >
                                          {modelName}
                                        </span>
                                        {m.alias && (
                                          <span
                                            className="text-[8px] font-bold shrink-0 px-1 py-0.5 rounded"
                                            style={{
                                              color: primaryColor,
                                              background: `${primaryColor}15`,
                                            }}
                                          >
                                            {m.alias}
                                          </span>
                                        )}
                                      </div>
                                      {provider && (
                                        <div className="text-[9px] text-aegis-text-dim mt-0.5 font-mono truncate">
                                          {provider}
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* ── Section: Agent Info card ── */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[9px] text-aegis-text-muted uppercase tracking-widest font-bold mb-2">
                      <Activity size={10} />
                      {t('agentSettings.stats', 'Session Stats')}
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {/* Active sessions */}
                      <div
                        className="rounded-xl p-3 border"
                        style={{
                          background: themeAlpha('overlay', 0.03),
                          borderColor: themeAlpha('overlay', 0.08),
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Zap size={10} style={{ color: themeHex('success') }} />
                          <span className="text-[8px] text-aegis-text-dim uppercase tracking-wider">
                            {t('agentSettings.activeSessions', 'Active')}
                          </span>
                        </div>
                        <div className="text-[22px] font-extrabold text-aegis-text leading-none">
                          {activeSessions}
                        </div>
                        <div className="text-[9px] text-aegis-text-dim mt-0.5">
                          of {totalSessionCount} total
                        </div>
                      </div>

                      {/* Total tokens */}
                      <div
                        className="rounded-xl p-3 border"
                        style={{
                          background: themeAlpha('overlay', 0.03),
                          borderColor: themeAlpha('overlay', 0.08),
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Activity size={10} style={{ color: primaryColor }} />
                          <span className="text-[8px] text-aegis-text-dim uppercase tracking-wider">
                            {t('agentSettings.totalTokens', 'Tokens')}
                          </span>
                        </div>
                        <div
                          className="text-[22px] font-extrabold leading-none"
                          style={{ color: primaryColor }}
                        >
                          {formatTk(totalTokens)}
                        </div>
                        <div className="text-[9px] text-aegis-text-dim mt-0.5">
                          all sessions
                        </div>
                      </div>
                    </div>

                    {/* Agent metadata rows */}
                    <div
                      className="rounded-xl border divide-y overflow-hidden"
                      style={{
                        borderColor: themeAlpha('overlay', 0.08),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ['--tw-divide-opacity' as any]: 1,
                      }}
                    >
                      {/* Workspace path */}
                      {agent.workspace && (
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[rgb(var(--aegis-overlay)/0.02)]">
                          <FolderOpen size={11} className="text-aegis-text-dim shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[8px] text-aegis-text-dim uppercase tracking-wider mb-0.5">
                              Workspace
                            </div>
                            <div className="text-[10px] text-aegis-text font-mono truncate">
                              {agent.workspace}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Last activity */}
                      {latestSession && (
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[rgb(var(--aegis-overlay)/0.02)]">
                          <Clock size={11} className="text-aegis-text-dim shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[8px] text-aegis-text-dim uppercase tracking-wider mb-0.5">
                              Last Activity
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  background: latestSession.running
                                    ? themeHex('success')
                                    : themeAlpha('overlay', 0.3),
                                }}
                              />
                              <span className="text-[10px] text-aegis-text truncate">
                                {formatRelativeTime(latestSession.updatedAt)}
                              </span>
                              <span className="text-[9px] text-aegis-text-dim truncate">
                                · {latestSession.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* No sessions fallback */}
                      {mergedSessions.length === 0 && !agent.workspace && (
                        <div className="px-3.5 py-3 text-center text-[10px] text-aegis-text-dim bg-[rgb(var(--aegis-overlay)/0.02)]">
                          No sessions yet
                        </div>
                      )}
                    </div>
                  </div>

                </>
              )}
            </div>

            {/* ═══ Footer ═══ */}
            <div
              className="shrink-0 px-5 py-4 flex items-center gap-2.5"
              style={{ borderTop: `1px solid ${themeAlpha('border', 0.6)}` }}
            >
              {/* Cancel — ghost/minimal */}
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[12px] font-medium text-aegis-text-dim hover:text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Save — solid primary */}
              <motion.button
                onClick={handleSave}
                disabled={saving || loadingConfig || !!configError || !hasChanges}
                whileTap={hasChanges && !saving ? { scale: 0.97 } : undefined}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[12px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: saved
                    ? `${successColor}22`
                    : hasChanges
                      ? primaryColor
                      : themeAlpha('overlay', 0.08),
                  color: saved
                    ? successColor
                    : hasChanges
                      ? `rgb(var(--aegis-btn-primary-text))`
                      : getComputedStyle(document.documentElement).getPropertyValue('--aegis-text-dim').trim() || '#5a6370',
                  border: `1px solid ${
                    saved
                      ? `${successColor}40`
                      : hasChanges
                        ? `${primaryColor}80`
                        : themeAlpha('overlay', 0.12)
                  }`,
                  boxShadow: hasChanges && !saved && !saving
                    ? `0 2px 12px ${primaryColor}30`
                    : 'none',
                }}
              >
                {saving
                  ? <Loader2 size={12} className="animate-spin" />
                  : saved
                    ? <Check size={12} />
                    : <Save size={12} />
                }
                {saving
                  ? t('agentSettings.saving', 'Saving...')
                  : saved
                    ? t('agentSettings.saved', 'Saved!')
                    : t('settings.save', 'Save')}
              </motion.button>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

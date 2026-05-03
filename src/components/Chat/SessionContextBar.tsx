import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { gateway } from '@/services/gateway';
import { useChatStore } from '@/stores/chatStore';
import { ModelDropdown } from '@/components/shared/ModelDropdown';
import { exportChatMarkdown } from '@/utils/exportChat';

const SESSION_MODEL_PREFS_KEY = 'aegis:session-model-prefs';

function persistSessionModelPreference(sessionKey: string, modelId: string) {
  try {
    const raw = localStorage.getItem(SESSION_MODEL_PREFS_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const next = (prev && typeof prev === 'object') ? prev : {};
    next[sessionKey] = modelId;
    localStorage.setItem(SESSION_MODEL_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
}

const THINKING_LEVELS = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'off', label: 'Off' },
];

function SessionModelPicker({ currentModel }: { currentModel: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const { setManualModelOverride, manualModelOverride, availableModels } = useChatStore();
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const effectiveModel = manualModelOverride ?? currentModel;

  const handleSelect = async (modelId: string) => {
    if (switching) return;
    setSwitching(true);
    try {
      const sessionKey = activeSessionKey || 'agent:main:main';
      await gateway.setSessionModel(modelId, sessionKey);
      setManualModelOverride(modelId);
      persistSessionModelPreference(sessionKey, modelId);
      setTimeout(() => window.dispatchEvent(new Event('aegis:model-changed')), 500);
    } catch (err) {
      console.error('[SessionModelPicker] Failed to switch model:', err);
    } finally {
      setSwitching(false);
    }
  };

  if (availableModels.length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/config')}
        className={clsx(
          'no-drag flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono transition-all duration-150',
          'text-aegis-warning hover:text-aegis-warning/80',
          'hover:bg-aegis-warning/[0.08] border border-aegis-warning/30',
        )}
        title={t('config.addFirstProvider', 'Add your first AI provider to get started')}
      >
        <span>{t('config.setupProviderShort', 'Setup →')}</span>
      </button>
    );
  }

  return (
    <div className="no-drag">
      <ModelDropdown
        value={switching ? null : effectiveModel}
        onChange={handleSelect}
        variant="pill"
        onlyAliased
        placeholder={switching ? '…' : t('config.notSet', 'Not set')}
        disabled={switching}
      />
    </div>
  );
}

function SessionThinkingPicker({ currentThinking }: { currentThinking: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { setCurrentThinking } = useChatStore();
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (level: string) => {
    if (switching) return;
    setOpen(false);
    setSwitching(true);
    try {
      const sessionKey = activeSessionKey || 'agent:main:main';
      const nextLevel = level === 'auto' ? null : level;
      await gateway.setSessionThinking(nextLevel, sessionKey);
      setCurrentThinking(nextLevel);
    } catch (err) {
      console.error('[SessionThinkingPicker] Failed to switch thinking:', err);
    } finally {
      setSwitching(false);
    }
  };

  const currentThinkingId = currentThinking ?? 'auto';
  const active = THINKING_LEVELS.find((it) => it.id === currentThinkingId);
  const displayLabel = t(`titlebar.thinking.levels.${active?.id ?? 'auto'}`, active?.label ?? 'Auto');

  return (
    <div ref={ref} className="relative no-drag">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-label={t('titlebar.thinking.ariaLabel', { level: displayLabel })}
        title={t('titlebar.thinking.ariaLabel', { level: displayLabel })}
        className={clsx(
          'flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[11px] transition-all duration-150',
          'text-aegis-text-muted hover:text-aegis-text-secondary',
          'hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
          open && 'bg-[rgb(var(--aegis-overlay)/0.08)]',
          switching && 'opacity-60 cursor-wait',
        )}
      >
        <span className="text-[10px] uppercase tracking-[0.5px] text-aegis-text-dim">
          {t('titlebar.thinking.label')}
        </span>
        <span className="font-mono text-aegis-text-secondary">
          {switching ? t('titlebar.thinking.updating') : displayLabel}
        </span>
        <ChevronDown size={9} className={clsx('transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[150px] rounded-xl overflow-hidden bg-aegis-menu-bg border border-aegis-menu-border"
          style={{ boxShadow: 'var(--aegis-menu-shadow)' }}
        >
          {THINKING_LEVELS.map((level) => {
            const isActive = currentThinkingId === level.id;
            return (
              <button
                key={level.id}
                onClick={() => handleSelect(level.id)}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 text-[12px] text-start transition-colors',
                  isActive
                    ? 'text-aegis-primary bg-[rgb(var(--aegis-primary)/0.08)]'
                    : 'text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
                )}
              >
                <span className="font-mono">{t(`titlebar.thinking.levels.${level.id}`, level.label)}</span>
                {isActive && <Check size={11} className="text-aegis-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SessionContextBar() {
  const { t } = useTranslation();
  const { tokenUsage, currentModel, currentThinking, availableModels, renderBlocks, activeSessionKey } = useChatStore();
  const hasProviders = availableModels.length > 0;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshed, setIsRefreshed] = useState(false);

  const usedTokens = tokenUsage?.contextTokens || 0;
  const maxTokens = tokenUsage?.maxTokens || 0;
  const usedK = Math.round(usedTokens / 1000);
  const maxLabel = maxTokens >= 1_000_000
    ? `${(maxTokens / 1_000_000).toFixed(maxTokens % 1_000_000 === 0 ? 0 : 1)}M`
    : `${Math.round(maxTokens / 1000)}K`;

  return (
    <div className="h-[32px] shrink-0 flex items-center gap-2 px-3 border-b border-[rgb(var(--aegis-overlay)/0.06)] bg-[var(--aegis-bg-frosted-60)]">
      <span className="text-[10px] uppercase tracking-[0.5px] text-aegis-text-dim">
        {t('chat.currentSession', 'Current Session')}
      </span>
      <span className="text-aegis-text-dim opacity-40">·</span>

      <SessionModelPicker currentModel={currentModel} />
      {hasProviders && (
        <>
          <span className="text-aegis-text-dim opacity-40">·</span>
          <SessionThinkingPicker currentThinking={currentThinking} />
          <span className="text-aegis-text-dim opacity-40">·</span>
          <span className="text-[11px] text-aegis-text-muted font-mono">
            {maxTokens > 0 ? `${usedK}K / ${maxLabel}` : t('config.notSet', 'Not set')}
          </span>
        </>
      )}
      <div className="ms-auto flex items-center gap-2 pl-2 border-l border-[rgb(var(--aegis-overlay)/0.06)]">
        {renderBlocks.length > 0 && (
          <button
            onClick={() => exportChatMarkdown(renderBlocks, activeSessionKey)}
            className="p-1.5 rounded-md transition-colors text-aegis-text-dim hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.05)]"
            title={t('chat.exportMarkdown', 'Export as Markdown')}
          >
            <Download size={13} />
          </button>
        )}
        <button
          onClick={() => {
            if (isRefreshing) return;
            setIsRefreshed(false);
            setIsRefreshing(true);
            window.dispatchEvent(new Event('aegis:refresh'));
            setTimeout(() => {
              setIsRefreshing(false);
              setIsRefreshed(true);
              setTimeout(() => setIsRefreshed(false), 1200);
            }, 800);
          }}
          className={clsx(
            'p-1.5 rounded-md transition-colors text-aegis-text-dim hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.05)]',
            isRefreshing && 'opacity-50 cursor-wait',
            isRefreshed && 'text-aegis-success hover:text-aegis-success',
          )}
          title={isRefreshed ? t('chat.refreshDone', 'Refreshed') : t('chat.refresh', 'Refresh chat')}
        >
          {isRefreshed
            ? <Check size={13} />
            : <RotateCcw size={13} className={clsx('transition-transform', isRefreshing && 'animate-spin')} />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event('aegis:open-new-session-picker'))}
          className="p-1.5 rounded-md transition-colors text-aegis-text-dim hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.05)]"
          title={t('chat.newTab', 'New tab')}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

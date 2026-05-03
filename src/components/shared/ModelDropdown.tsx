// ═══════════════════════════════════════════════════════════
// ModelDropdown — Shared model selector used throughout the app.
//
// Variants:
//   'pill'  — compact inline trigger (TitleBar)
//   'field' — full-width form field trigger (ConfigManager)
//
// Model data comes from useChatStore().availableModels, already
// kept in sync by App.tsx polling — no extra gateway calls.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

// ── Helpers ───────────────────────────────────────────────

/** Converts full model IDs to short display names. */
export function formatModelName(model: string | null | undefined): string {
  if (!model) return '—';
  const m = model.toLowerCase();
  if (m.includes('claude-opus-4-6'))   return 'Opus 4.6';
  if (m.includes('claude-opus-4-5'))   return 'Opus 4.5';
  if (m.includes('claude-sonnet-4-6')) return 'Sonnet 4.6';
  if (m.includes('claude-sonnet-4-5')) return 'Sonnet 4.5';
  if (m.includes('claude-haiku-3-5'))  return 'Haiku 3.5';
  if (m.includes('claude-haiku'))      return 'Haiku';
  if (m.includes('claude-3-5'))        return 'Claude 3.5';
  if (m.includes('gemini-2.5-pro'))    return 'Gemini 2.5 Pro';
  if (m.includes('gemini-2.0'))        return 'Gemini 2.0';
  if (m.includes('gemini'))            return 'Gemini';
  if (m.includes('gpt-4o'))            return 'GPT-4o';
  if (m.includes('gpt-4'))             return 'GPT-4';
  if (m.includes('o3'))                return 'o3';
  if (m.includes('o1'))                return 'o1';
  const parts = model.split('/');
  return parts[parts.length - 1];
}

function providerLabel(provider: string): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'google')    return 'Google';
  if (provider === 'openai')    return 'OpenAI';
  return provider;
}

// ── Props ─────────────────────────────────────────────────

export interface ModelDropdownProps {
  /** Currently selected model ID (full "provider/model" string or bare name). */
  value: string | null | undefined;
  /** Called with the full model ID when user selects a model. */
  onChange: (modelId: string) => void;
  /** Placeholder text shown when no model is selected. */
  placeholder?: string;
  /**
   * Visual variant:
   *  - 'pill'  — compact inline trigger (for TitleBar)
   *  - 'field' — full-width form-field trigger (for ConfigManager)
   */
  variant?: 'pill' | 'field';
  /**
   * When true, only models that have an alias are shown
   * (TitleBar behaviour — explicitly configured models only).
   * When false (default), all available models are shown.
   */
  onlyAliased?: boolean;
  /** Extra class names applied to the root wrapper. */
  className?: string;
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────

export function ModelDropdown({
  value,
  onChange,
  placeholder,
  variant = 'field',
  onlyAliased = false,
  className,
  disabled,
}: ModelDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { availableModels } = useChatStore();

  const modelList = onlyAliased
    ? availableModels.filter((m) => m.alias)
    : availableModels;

  // Group by provider
  const grouped = modelList.reduce<Record<string, typeof modelList>>((acc, m) => {
    const provider = m.id.includes('/') ? m.id.split('/')[0] : 'other';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {});
  const providers = Object.keys(grouped);

  // Outside click closes dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = modelList.find((m) => m.id === value);
  const hasValue = Boolean(value);
  const displayShort = active?.alias || (hasValue ? formatModelName(value) : (placeholder ?? t('config.notSet', 'Not set')));
  const displayProvider = hasValue && value?.includes('/') ? value.split('/')[0] : '';

  return (
    <div ref={ref} className={clsx('relative', className)}>
      {/* ── Trigger ── */}
      {variant === 'pill' ? (
        <button
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono transition-all duration-150',
            'text-aegis-text-muted hover:text-aegis-text-secondary',
            'hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
            open && 'bg-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          <span>{displayShort}</span>
          <ChevronDown size={10} className={clsx('transition-transform duration-150', open && 'rotate-180')} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className={clsx(
            'w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm',
            'bg-aegis-menu-bg border border-aegis-menu-border',
            'text-aegis-text outline-none transition-colors duration-200 cursor-pointer',
            open && 'border-aegis-primary/40',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className="min-w-0 flex-1 text-left">
            {value ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{displayShort}</span>
                {displayProvider && (
                  <span className="text-[10px] text-aegis-text-muted font-mono shrink-0">
                    {displayProvider}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-aegis-text-muted">
                {placeholder ?? 'Select a model…'}
              </span>
            )}
          </div>
          <ChevronDown
            size={13}
            className={clsx('text-aegis-text-muted shrink-0 ml-2 transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
      )}

      {/* ── Dropdown ── */}
      {open && (
        <div
          className={clsx(
            'absolute z-50 mt-1 rounded-xl overflow-hidden',
            'bg-aegis-menu-bg border border-aegis-menu-border',
            variant === 'pill' ? 'left-0 min-w-[200px] max-w-[280px]' : 'left-0 right-0 min-w-full',
          )}
          style={{ boxShadow: 'var(--aegis-menu-shadow)' }}
        >
          <div className="overflow-y-auto max-h-[252px] py-1">
            {providers.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-aegis-text-muted text-center">
                {t(
                  'config.noModelsConfiguredHint',
                  'No models configured. Add providers in Config Manager.'
                )}
              </div>
            ) : providers.map((provider, pi) => (
              <div key={provider}>
                {/* Provider label — only when multiple providers */}
                {providers.length > 1 && (
                  <div className={clsx(
                    'px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-aegis-text-dim',
                    pi > 0 && 'mt-1 border-t border-[rgb(var(--aegis-overlay)/0.07)] pt-2',
                  )}>
                    {providerLabel(provider)}
                  </div>
                )}
                {grouped[provider].map((m) => {
                  const isActive = value === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { onChange(m.id); setOpen(false); }}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-start transition-colors',
                        isActive
                          ? 'text-aegis-primary bg-[rgb(var(--aegis-primary)/0.08)]'
                          : 'text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-mono truncate block">
                          {m.alias || formatModelName(m.id)}
                        </span>
                        {m.alias && (
                          <span className="text-[9px] text-aegis-text-dim font-mono truncate block">
                            {formatModelName(m.id)}
                          </span>
                        )}
                      </div>
                      {isActive && <Check size={11} className="text-aegis-primary shrink-0 ms-2" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

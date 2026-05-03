// ═══════════════════════════════════════════════════════════
// Config Manager — AdvancedTab
// Phase 4: Tools, elevated, web, loop-detection, messages/TTS,
//          raw JSON editor, env vars, commands
// Design: aegis-* Tailwind classes only (no hardcoded colors)
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import type { OpenClawConfig } from './types';
import {
  ExpandableCard,
  ToggleSwitch,
  MaskedInput,
} from './components';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AdvancedTabProps {
  config: OpenClawConfig;
  onChange: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON error extractor — tries to surface line number
// ─────────────────────────────────────────────────────────────────────────────

function extractJsonError(str: string): { message: string; line?: number } | null {
  try {
    JSON.parse(str);
    return null;
  } catch (e: any) {
    const msg: string = e.message ?? 'Invalid JSON';
    // Firefox: "JSON.parse: unexpected character at line X column Y"
    const ffMatch = msg.match(/line (\d+)/);
    if (ffMatch) return { message: msg, line: parseInt(ffMatch[1], 10) };
    // Chrome/V8: "Unexpected token 'x', ...\"text\" is not valid JSON at position N"
    const posMatch = msg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const line = str.slice(0, pos).split('\n').length;
      return { message: msg, line };
    }
    return { message: msg };
  }
}

function fmtJsonError(info: { message: string; line?: number }): string {
  return info.line ? `Line ${info.line}: ${info.message}` : info.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared input class
// ─────────────────────────────────────────────────────────────────────────────

const INPUT =
  'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2 ' +
  'text-aegis-text text-sm outline-none focus:border-aegis-primary transition-colors duration-200';

// ─────────────────────────────────────────────────────────────────────────────
// AdvancedTab
// ─────────────────────────────────────────────────────────────────────────────

export function AdvancedTab({ config, onChange }: AdvancedTabProps) {
  const { t } = useTranslation();

  const commands = config.commands ?? {};
  const envVars  = config.env?.vars ?? {};

  // ── Raw JSON state ──
  const [jsonStr,     setJsonStr]     = useState(() => JSON.stringify(config, null, 2));
  const [jsonError,   setJsonError]   = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState(false);
  const [isEdited,    setIsEdited]    = useState(false);

  // Sync textarea from config when user hasn't manually edited it
  useEffect(() => {
    if (!isEdited) {
      setJsonStr(JSON.stringify(config, null, 2));
      setJsonError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── Env-var add form ──
  const [newVarKey,   setNewVarKey]   = useState('');
  const [newVarValue, setNewVarValue] = useState('');

  const patchCommands = (patch: Record<string, any>) =>
    onChange(prev => ({ ...prev, commands: { ...prev.commands, ...patch } }));

  // ─────────────────────────────────────────────────────────
  // Env-var operations
  // ─────────────────────────────────────────────────────────

  const addEnvVar = () => {
    const key = newVarKey.trim();
    if (!key) return;
    onChange(prev => ({
      ...prev,
      env: { ...prev.env, vars: { ...(prev.env?.vars ?? {}), [key]: newVarValue } },
    }));
    setNewVarKey('');
    setNewVarValue('');
  };

  const removeEnvVar = (key: string) => {
    onChange(prev => {
      const vars = { ...(prev.env?.vars ?? {}) };
      delete vars[key];
      return { ...prev, env: { ...prev.env, vars } };
    });
  };

  const updateEnvVar = (key: string, val: string) => {
    onChange(prev => ({
      ...prev,
      env: { ...prev.env, vars: { ...(prev.env?.vars ?? {}), [key]: val } },
    }));
  };

  // ─────────────────────────────────────────────────────────
  // Raw JSON handlers
  // ─────────────────────────────────────────────────────────

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonStr(e.target.value);
    setIsEdited(true);
    setJsonError(null);
    setJsonSuccess(false);
  };

  const handleFormat = () => {
    const info = extractJsonError(jsonStr);
    if (info) {
      setJsonError(fmtJsonError(info));
      return;
    }
    setJsonStr(JSON.stringify(JSON.parse(jsonStr), null, 2));
    setJsonError(null);
  };

  const handleApply = () => {
    const info = extractJsonError(jsonStr);
    if (info) {
      setJsonError(fmtJsonError(info));
      setJsonSuccess(false);
      return;
    }
    try {
      const parsed = JSON.parse(jsonStr) as OpenClawConfig;
      setIsEdited(false);
      onChange(() => parsed);
      setJsonError(null);
      setJsonSuccess(true);
      setTimeout(() => setJsonSuccess(false), 2500);
    } catch (e: any) {
      setJsonError(e.message ?? 'Failed to apply');
    }
  };

  const lineCount = jsonStr.split('\n').length;

  // ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* ── A) Raw JSON Editor ─────────────────────────────── */}
      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="px-5 py-3.5 border-b border-aegis-border flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
              📋 {t('config.rawJson')}
            </h3>
            <p className="text-[10px] text-aegis-text-muted mt-0.5">
              {t('config.rawJsonHint')}
            </p>
          </div>
          <span
            className={clsx(
              'text-[10px] text-aegis-text-muted bg-aegis-surface',
              'border border-aegis-border rounded-full px-2.5 py-0.5 flex-shrink-0',
            )}
          >
            {t('config.lineCount', { count: lineCount })}
          </span>
        </div>
        <div className="p-4 space-y-3">

          {/* Textarea */}
          <textarea
            value={jsonStr}
            onChange={handleJsonChange}
            spellCheck={false}
            className={clsx(
              'w-full min-h-[500px] bg-aegis-surface rounded-xl p-4',
              'text-aegis-text text-sm font-mono resize-y',
              'outline-none transition-colors duration-200 border',
              jsonError
                ? 'border-red-500/60 focus:border-red-500/80'
                : 'border-aegis-border focus:border-aegis-primary',
            )}
          />

          {/* Error */}
          {jsonError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-400/8 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span className="break-all">{jsonError}</span>
            </div>
          )}

          {/* Success */}
          {jsonSuccess && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-aegis-success/8 border border-aegis-success/20 text-aegis-success text-xs">
              <Check size={13} />
              <span>{t('config.jsonApplied')}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleFormat}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                'border border-aegis-border text-aegis-text-secondary',
                'hover:bg-white/[0.03] hover:border-aegis-border-hover',
                'transition-all duration-200',
              )}
            >
              ✨ {t('config.format')}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold',
                'bg-aegis-primary text-aegis-btn-primary-text',
                'hover:brightness-110 transition-all duration-200',
              )}
            >
              <Check size={12} /> {t('config.apply')}
            </button>
          </div>
        </div>
      </div>

      {/* ── B) Environment Variables (collapsed) ───────────── */}
      <ExpandableCard
        title={`🔑 ${t('config.envVars')}`}
        defaultExpanded={false}
      >
        <div className="space-y-2">

          {/* Existing vars */}
          {Object.entries(envVars).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              {/* Key (read-only) */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={key}
                  readOnly
                  className={clsx(INPUT, 'font-mono text-xs cursor-default opacity-70')}
                />
              </div>
              {/* Value (masked) */}
              <div className="flex-1 min-w-0">
                <MaskedInput
                  value={value}
                  onChange={v => updateEnvVar(key, v)}
                />
              </div>
              {/* Remove */}
              <button
                type="button"
                onClick={() => removeEnvVar(key)}
                className={clsx(
                  'p-1.5 rounded-lg flex-shrink-0',
                  'text-aegis-text-muted hover:text-red-400',
                  'hover:bg-red-400/8 transition-all duration-200',
                )}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Add new variable */}
          <div
            className={clsx(
              'flex items-center gap-2 pt-2',
              Object.keys(envVars).length > 0 && 'border-t border-aegis-border',
            )}
          >
            <input
              type="text"
              value={newVarKey}
              onChange={e => setNewVarKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEnvVar()}
              placeholder={t('config.variableKey')}
              className={clsx(INPUT, 'flex-1 font-mono text-xs')}
            />
            <div className="flex-1 min-w-0">
              <MaskedInput
                value={newVarValue}
                onChange={setNewVarValue}
                placeholder={t('config.variableValue')}
              />
            </div>
            <button
              type="button"
              onClick={addEnvVar}
              disabled={!newVarKey.trim()}
              className={clsx(
                'flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0',
                'bg-aegis-primary text-aegis-btn-primary-text',
                'hover:brightness-110 transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Plus size={12} /> {t('config.addVariable')}
            </button>
          </div>

          {Object.keys(envVars).length === 0 && (
            <p className="text-xs text-aegis-text-muted italic py-1 text-center">
              No environment variables configured
            </p>
          )}
        </div>
      </ExpandableCard>

      {/* ── C) Commands (collapsed) ───────────────────────── */}
      <ExpandableCard
        title={`⚙️ ${t('config.commands')}`}
        defaultExpanded={false}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">
              {t('config.nativeCommands')}
            </span>
            <ToggleSwitch
              value={Boolean(commands.native)}
              onChange={v => patchCommands({ native: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">
              {t('config.nativeSkills')}
            </span>
            <ToggleSwitch
              value={Boolean(commands.nativeSkills)}
              onChange={v => patchCommands({ nativeSkills: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">
              {t('config.restartCommand')}
            </span>
            <ToggleSwitch
              value={commands.restart ?? false}
              onChange={v => patchCommands({ restart: v })}
            />
          </div>
        </div>
      </ExpandableCard>

    </div>
  );
}

export default AdvancedTab;

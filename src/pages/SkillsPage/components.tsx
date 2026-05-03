// ═══════════════════════════════════════════════════════════
// Skills Page — Sub-components
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import { X, Loader2, Copy, ExternalLink, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface MySkill {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  version: string;
  enabled: boolean;
  /** Raw source string from the gateway (e.g. "openclaw-bundled", "openclaw-managed", "openclaw-extra") */
  source: string;
  /**
   * Actual directory name under ~/.openclaw/skills/ (basename of `baseDir` from gateway).
   * May differ from `slug` (the skillKey) when the skill's declared key doesn't match the
   * directory it was installed into — e.g. slug="self-improvement" but dirName="self-improving-agent".
   * Used for the delete IPC call which resolves by directory, not by skillKey.
   */
  dirName?: string;
}

/** Map raw gateway source to a display group */
export function getSkillGroup(source: string): 'builtin' | 'installed' | 'extra' {
  if (source === 'openclaw-bundled') return 'builtin';
  if (source === 'openclaw-extra') return 'extra';
  return 'installed';
}

/** A skill in the "installed" group (openclaw-managed) can be deleted */
export function isSkillDeletable(source: string): boolean {
  return source === 'openclaw-managed';
}

export interface HubSkill {
  slug: string;
  name: string;
  emoji: string;
  summary: string;
  owner: string;
  ownerAvatar: string;
  stars: number;
  downloads: number;
  installs: number;
  version: string;
  badge?: 'official' | 'featured';
  category: string;
  /** Direct URL to the skill's page on its source hub (used as externalUrl in the detail panel). */
  homepage?: string;
}

export interface SkillDetail extends HubSkill {
  readme: string;
  requirements: { env: string[]; bin: string[] };
  versions: Array<{ version: string; date: string; changelog: string; latest: boolean }>;
}

// ═══════════════════════════════════════════════════════════
// Categories
// ═══════════════════════════════════════════════════════════

// Category IDs mirror SkillsHub's server-side values so client filtering works
// without any remapping. guessCategory() uses these same IDs as a ClawHub fallback.
export const CATEGORIES = [
  { id: 'all',                        label: 'All',           emoji: '' },
  { id: 'developer-tools',            label: 'Dev Tools',     emoji: '💻' },
  { id: 'productivity',               label: 'Productivity',  emoji: '📊' },
  { id: 'ai-intelligence',            label: 'AI',            emoji: '🤖' },
  { id: 'content-creation',           label: 'Content',       emoji: '✍️' },
  { id: 'data-analysis',              label: 'Data',          emoji: '📈' },
  { id: 'communication-collaboration',label: 'Communication', emoji: '💬' },
  { id: 'security-compliance',        label: 'Security',      emoji: '🔒' },
];

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function SourceBadge({ source }: { source: string }) {
  const group = getSkillGroup(source);
  const style =
    group === 'installed'
      ? 'bg-aegis-primary/[0.08] border-aegis-primary/15 text-aegis-primary'
      : group === 'extra'
        ? 'bg-aegis-accent/[0.08] border-aegis-accent/15 text-aegis-accent'
        : 'bg-[rgb(var(--aegis-overlay)/0.04)] border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim';
  const label =
    group === 'installed' ? 'Installed' : group === 'extra' ? 'Extra' : 'Built-In';
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border', style)}>
      {label}
    </span>
  );
}

/** Color bar palette — matches CronMonitor style */
const SKILL_COLORS = [
  'rgb(var(--aegis-data-1))',
  'rgb(var(--aegis-data-2))',
  'rgb(var(--aegis-data-3))',
  'rgb(var(--aegis-data-4))',
  'rgb(var(--aegis-data-5))',
  'rgb(var(--aegis-data-6))',
  'rgb(var(--aegis-data-7))',
  'rgb(var(--aegis-data-8))',
  'rgb(var(--aegis-data-9))',
  'rgb(var(--aegis-data-10))',
];

function HubBadge({ badge }: { badge?: 'official' | 'featured' }) {
  const { t } = useTranslation();
  if (!badge) return null;
  if (badge === 'official') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold
        bg-aegis-primary/[0.08] border border-aegis-primary/15 text-aegis-primary">
        ✓ Official
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold
      bg-aegis-accent/[0.08] border border-aegis-accent/15 text-aegis-accent">
      {t('skillsExtra.featured')}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// MySkillRow — Installed skill (clean list item)
// ═══════════════════════════════════════════════════════════

export function MySkillRow({ skill, onToggle, index = 0, onDelete }: {
  skill: MySkill;
  onToggle: () => void;
  index?: number;
  onDelete?: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const color = SKILL_COLORS[index % SKILL_COLORS.length];

  return (
    <div
      className={clsx(
        'flex items-stretch gap-0 mb-1.5 rounded-[14px] overflow-hidden cursor-default transition-all border group',
        skill.enabled
          ? 'border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] hover:bg-[rgb(var(--aegis-overlay)/0.03)]'
          : 'border-[rgb(var(--aegis-overlay)/0.04)] bg-[rgb(var(--aegis-overlay)/0.01)] opacity-35',
      )}
    >
      {/* Color bar — same as CronMonitor */}
      <div
        className="w-[4px] shrink-0 rounded-s-[14px]"
        style={{ background: skill.enabled ? color : 'rgb(var(--aegis-overlay) / 0.06)' }}
      />

      {/* Info — emoji + name on line 1, description + badge on line 2 */}
      <div className="flex-1 min-w-0 py-3 ps-3.5 pe-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px]">{skill.emoji}</span>
          <span className={clsx(
            'text-[13px] font-bold truncate',
            !skill.enabled && 'text-aegis-text-muted',
          )}>
            {skill.name}
          </span>
        </div>
        <div className="text-[10px] text-aegis-text-muted flex items-center gap-2 flex-wrap">
          <span className="truncate max-w-[260px]">{skill.description}</span>
          <SourceBadge source={skill.source} />
        </div>
      </div>

      {/* Delete action (left of Version + Toggle, so their positions remain stable) */}
      <div className="w-[36px] shrink-0 flex items-center justify-center">
        {isSkillDeletable(skill.source) && (
          <button
            onClick={() => onDelete?.(skill.slug)}
            title={t('skills.deleteSkill')}
            className="w-7 h-7 rounded-lg flex items-center justify-center border
              border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim
              hover:text-aegis-danger hover:border-aegis-danger/30 hover:bg-aegis-danger/[0.04]
              transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Version — same position as "Time Left" in CronMonitor */}
      <div className="w-[80px] shrink-0 flex flex-col items-end justify-center pe-3 py-2">
        <span className="text-[8px] text-aegis-text-dim font-medium mb-0.5">{t('skillsExtra.version', 'Version')}</span>
        <span className="text-sm font-bold font-mono" style={{
          color: skill.enabled ? color : 'rgb(var(--aegis-overlay) / 0.1)',
        }}>
          {skill.version ? `v${skill.version}` : '—'}
        </span>
      </div>

      {/* Actions — toggle only (position preserved) */}
      <div className="flex items-center gap-1.5 pe-3 shrink-0">
        <button
          onClick={onToggle}
          className={clsx(
            'w-8 h-[18px] rounded-full relative border transition-all shrink-0',
            skill.enabled
              ? 'bg-aegis-primary/25 border-aegis-primary/40'
              : 'bg-[rgb(var(--aegis-overlay)/0.05)] border-[rgb(var(--aegis-overlay)/0.1)]',
          )}
        >
          <div className={clsx(
            'absolute top-[2px] w-3 h-3 rounded-full transition-all',
            skill.enabled ? 'start-[16px] bg-aegis-primary' : 'start-[2px] bg-[rgb(var(--aegis-overlay)/0.2)]',
          )} style={skill.enabled ? { boxShadow: '0 0 6px rgb(var(--aegis-primary) / 0.5)' } : undefined} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HubSkillRow — Marketplace result row
// ═══════════════════════════════════════════════════════════

export function HubSkillRow({ skill, onClick }: { skill: HubSkill; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3.5 px-4 py-3 rounded-[10px] cursor-pointer
        hover:bg-[rgb(var(--aegis-overlay)/0.025)] transition-colors
        border-b border-[rgb(var(--aegis-overlay)/0.02)] last:border-0"
    >
      {/* Emoji */}
      <div className="w-9 h-9 rounded-[9px] flex items-center justify-center text-[20px]
        bg-[rgb(var(--aegis-overlay)/0.025)] shrink-0">
        {skill.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="text-[13px] font-semibold">{skill.name}</span>
          <HubBadge badge={skill.badge} />
          {skill.ownerAvatar && (
            <span className="flex items-center gap-1 text-[10.5px] text-aegis-text-dim">
              <img src={skill.ownerAvatar} alt="" className="w-[13px] h-[13px] rounded-full" loading="lazy" />
              {skill.owner}
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-aegis-text-muted truncate">{skill.summary}</div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3.5 shrink-0 text-[11px] text-aegis-text-dim">
        <span className="flex items-center gap-1 min-w-[56px]">
          <Download size={11} /> {formatNum(skill.downloads)}
        </span>
        <span className="text-[10px] font-mono">{skill.version ? `v${skill.version}` : '—'}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CategoryChips — Filter pills
// ═══════════════════════════════════════════════════════════

export function CategoryChips({ active, onSelect, accentColor }: {
  active: string;
  onSelect: (id: string) => void;
  accentColor?: 'primary' | 'red';
}) {
  const isRed = accentColor === 'red';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={clsx(
            'px-3 py-1.5 rounded-2xl text-[11px] font-medium border transition-all whitespace-nowrap',
            active === cat.id
              ? isRed
                ? 'border-red-500/25 text-red-400 bg-red-500/[0.06]'
                : 'border-aegis-primary/25 text-aegis-primary bg-aegis-primary/[0.06]'
              : 'border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted bg-transparent hover:border-[rgb(var(--aegis-overlay)/0.1)] hover:text-aegis-text-secondary',
          )}
        >
          {cat.emoji && <span className="me-1">{cat.emoji}</span>}
          {cat.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SkillDetailPanel — Slide-in detail panel
// ═══════════════════════════════════════════════════════════

export type InstallState = 'idle' | 'installing' | 'done' | 'error';

export function SkillDetailPanel({ open, skill, loading, onClose, onInstall, installState,
  accentColor, installLabel, installingLabel, doneLabel, doneHint, errorLabel,
  externalUrl, externalLabel, installCmd, errorText, secondaryActionLabel, onSecondaryAction,
}: {
  open: boolean;
  skill: SkillDetail | null;
  loading: boolean;
  onClose: () => void;
  onInstall?: (slug: string) => void;
  installState?: InstallState;
  accentColor?: 'primary' | 'red';
  installLabel?: string;
  installingLabel?: string;
  doneLabel?: string;
  /** Small hint text shown below the done button, e.g. "active next conversation". */
  doneHint?: string;
  errorLabel?: string;
  externalUrl?: string;
  externalLabel?: string;
  /** Override the CLI command shown in the code block (defaults to "clawhub install {slug}"). */
  installCmd?: string;
  errorText?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  const { t } = useTranslation();
  const isRed = accentColor === 'red';
  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel: left-cast shadow only when open; when closed the box still abuts the viewport and the shadow would bleed in. */}
      <div
        className={clsx(
          'fixed top-0 bottom-0 z-[501] w-[480px] max-w-full',
          'bg-aegis-bg border-s border-[rgb(var(--aegis-overlay)/0.06)]',
          open && 'shadow-[-12px_0_40px_rgba(0,0,0,0.3)]',
          'overflow-y-auto',
          'transition-[inset-inline-end] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'end-0' : '-end-[480px] pointer-events-none',
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-aegis-text-dim" />
          </div>
        ) : skill ? (
          <>
            {/* Close bar */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3
              bg-aegis-bg border-b border-[rgb(var(--aegis-overlay)/0.06)]">
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg border border-[rgb(var(--aegis-overlay)/0.08)]
                  bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted
                  hover:text-aegis-danger hover:bg-aegis-danger/[0.06] transition-colors
                  flex items-center justify-center"
              >
                <X size={14} />
              </button>
              <span className="font-semibold text-[14px] flex-1 truncate">{skill.name}</span>
            </div>

            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start gap-3.5">
                <div className="w-[52px] h-[52px] rounded-[13px] flex items-center justify-center text-[34px]
                  bg-[rgb(var(--aegis-overlay)/0.025)] shrink-0">
                  {skill.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[18px] font-bold tracking-tight flex items-center gap-2 flex-wrap mb-1">
                    {skill.name}
                    <HubBadge badge={skill.badge} />
                  </div>
                  {skill.ownerAvatar && (
                    <div className="flex items-center gap-1.5 text-[11.5px] text-aegis-text-muted mb-2">
                      <img src={skill.ownerAvatar} alt="" className="w-4 h-4 rounded-full" />
                      {skill.owner}
                    </div>
                  )}
                  <p className="text-[12.5px] text-aegis-text-secondary leading-relaxed">{skill.summary}</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mx-6 grid grid-cols-3 gap-px rounded-[10px] overflow-hidden border border-[rgb(var(--aegis-overlay)/0.06)]">
              {[
                { value: formatNum(skill.downloads), label: t('skillsExtra.downloads', 'Downloads') },
                { value: String(skill.stars), label: t('skillsExtra.stars', 'Stars') },
                { value: formatNum(skill.installs), label: t('skillsExtra.installs') },
              ].map(s => (
                <div key={s.label} className="p-2.5 text-center bg-[rgb(var(--aegis-overlay)/0.015)]">
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-[9.5px] text-aegis-text-dim uppercase tracking-wider mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Install command */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[9px]
                bg-[var(--aegis-code-bg,rgb(var(--aegis-overlay)/0.03))]
                border border-[rgb(var(--aegis-overlay)/0.06)]
                font-mono text-[11.5px] text-aegis-primary">
                <code className="flex-1 truncate">{installCmd ?? `openclaw skills install ${skill.slug}`}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(installCmd ?? `openclaw skills install ${skill.slug}`)}
                  className="text-aegis-text-dim hover:text-aegis-primary transition-colors shrink-0"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-4 flex flex-col gap-2">
              {/* Primary: Install / status */}
              <button
                onClick={() => (installState === 'error' || installState === 'idle') ? onInstall?.(skill.slug) : undefined}
                disabled={installState !== 'idle' && installState !== 'error'}
                className={clsx(
                  'w-full py-2.5 rounded-[9px] text-[12px] font-semibold transition-all',
                  'flex items-center justify-center gap-1.5',
                  installState === 'done'
                    ? 'bg-aegis-success/10 border border-aegis-success/30 text-aegis-success cursor-default'
                    : installState === 'error'
                      ? 'bg-aegis-danger/[0.07] border border-aegis-danger/20 text-aegis-danger hover:bg-aegis-danger/10 cursor-pointer'
                      : installState === 'installing'
                        ? isRed
                          ? 'bg-red-500/[0.07] border border-red-500/20 text-red-400 cursor-wait opacity-70'
                          : 'bg-aegis-primary/[0.07] border border-aegis-primary/20 text-aegis-primary cursor-wait opacity-70'
                        : isRed
                          ? 'bg-red-500/[0.08] border border-red-500/20 text-red-400 hover:bg-red-500/[0.14] cursor-pointer'
                          : 'bg-aegis-primary/[0.08] border border-aegis-primary/20 text-aegis-primary hover:bg-aegis-primary/[0.14] cursor-pointer',
                )}
              >
                {installState === 'installing' ? (
                  <><Loader2 size={13} className="animate-spin" /> {installingLabel ?? t('skillsExtra.installing', 'Installing…')}</>
                ) : installState === 'done' ? (
                  <>{doneLabel ?? t('skillsExtra.installed', '✓ Installed')}</>
                ) : installState === 'error' ? (
                  <><Download size={13} /> {errorLabel ?? t('skillsExtra.retryInstall', 'Retry Install')}</>
                ) : (
                  <><Download size={13} /> {installLabel ?? t('skillsExtra.install', 'Install')}</>
                )}
              </button>

              {/* After install: show hint that skill activates automatically on next message */}
              {installState === 'done' && doneHint && (
                <p className="text-center text-[11px] text-aegis-text-dim py-0.5">
                  {doneHint}
                </p>
              )}

              {installState === 'error' && errorText && (
                <div className="px-3 py-2.5 rounded-[9px] border border-aegis-danger/20 bg-aegis-danger/[0.04] text-[11.5px] leading-relaxed text-aegis-text-secondary">
                  {errorText}
                </div>
              )}

              {installState === 'error' && secondaryActionLabel && onSecondaryAction && (
                <button
                  onClick={onSecondaryAction}
                  className="w-full py-2 rounded-[9px] text-[11.5px] font-medium
                    bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]
                    text-aegis-text-secondary hover:border-[rgb(var(--aegis-overlay)/0.1)] transition-colors
                    flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={12} /> {secondaryActionLabel}
                </button>
              )}

              {/* Secondary: View on source */}
              <button
                onClick={() => window.open(externalUrl ?? `https://clawhub.ai/skills/${skill.slug}`, '_blank')}
                className="w-full py-2 rounded-[9px] text-[11.5px] font-medium
                  bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]
                  text-aegis-text-secondary hover:border-[rgb(var(--aegis-overlay)/0.1)] transition-colors
                  flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={12} /> {externalLabel ?? t('skillsExtra.viewOnClawHub', 'View on ClawHub')}
              </button>
            </div>

            <div className="h-px mx-6 bg-[rgb(var(--aegis-overlay)/0.06)]" />

            {/* Requirements */}
            {(skill.requirements.env.length > 0 || skill.requirements.bin.length > 0) && (
              <div className="px-6 py-4">
                <h3 className="text-[12px] font-semibold text-aegis-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {t('skillsExtra.requirements')}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.requirements.env.map(e => (
                    <span key={e} className="px-2 py-1 rounded-md text-[10.5px] font-mono
                      bg-aegis-primary/[0.06] border border-aegis-primary/10 text-aegis-primary">
                      🔑 {e}
                    </span>
                  ))}
                  {skill.requirements.bin.map(b => (
                    <span key={b} className="px-2 py-1 rounded-md text-[10.5px] font-mono
                      bg-aegis-primary/[0.06] border border-aegis-primary/10 text-aegis-primary">
                      ⚙️ {b}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Readme */}
            {skill.readme && (
              <div className="px-6 pb-4">
                <h3 className="text-[12px] font-semibold text-aegis-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  📖 Readme
                </h3>
                <div
                  className="prose-sm max-h-[280px] overflow-y-auto p-4 rounded-[10px]
                    bg-[var(--aegis-code-bg,rgb(var(--aegis-overlay)/0.03))]
                    border border-[rgb(var(--aegis-overlay)/0.06)]
                    text-[12.5px] leading-relaxed text-aegis-text-secondary"
                  dangerouslySetInnerHTML={{ __html: skill.readme }}
                />
              </div>
            )}

            {/* Versions */}
            {skill.versions.length > 0 && (
              <div className="px-6 pb-8">
                <h3 className="text-[12px] font-semibold text-aegis-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  📋 Versions
                </h3>
                <ul className="space-y-0">
                  {skill.versions.map(v => (
                    <li key={v.version} className="flex items-center gap-2 py-2
                      border-b border-[rgb(var(--aegis-overlay)/0.04)] last:border-0 text-[11.5px]">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono
                        bg-aegis-primary/[0.06] text-aegis-primary">
                        v{v.version}
                      </span>
                      {v.latest && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold
                          bg-aegis-success text-aegis-btn-primary-text">
                          latest
                        </span>
                      )}
                      <span className="text-aegis-text-secondary flex-1 truncate">{v.changelog}</span>
                      <span className="text-[10px] text-aegis-text-dim shrink-0">{v.date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

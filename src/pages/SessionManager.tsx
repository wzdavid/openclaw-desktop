// ═══════════════════════════════════════════════════════════
// Session Manager — Live session monitoring & overview
// Header + filter bar + 2-column session cards grid
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, RefreshCw, Loader2, Zap, Clock, Bot, Activity } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useGatewayDataStore, refreshGroup } from '@/stores/gatewayDataStore';
import { formatTokens } from '@/utils/format';
import { getSessionDisplayLabel } from '@/utils/sessionLabel';
import type { SessionInfo } from '@/stores/gatewayDataStore';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/** Relative time — e.g. "2m ago", "1h ago", "just now" */
function formatTimeAgo(ts: string | undefined | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'just now';
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return '—';
  }
}

/** Token usage percentage (0–100), capped */
function tokenPercent(context?: number, max?: number): number {
  if (!context || !max || max === 0) return 0;
  return Math.min(100, Math.round((context / max) * 100));
}

/** Colour of the token bar based on fill level */
function tokenBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500/70';
  if (pct >= 70) return 'bg-amber-500/70';
  return 'bg-aegis-primary/60';
}

/** Format tokens — wraps central formatTokens with null handling */
const fmtTokens = (n?: number): string => n == null ? '—' : formatTokens(n);

// ═══════════════════════════════════════════════════════════
// Filter types
// ═══════════════════════════════════════════════════════════

type FilterType = 'all' | 'running' | 'idle' | 'subagent';

const FILTERS: { id: FilterType; labelKey: string; fallback: string }[] = [
  { id: 'all',      labelKey: 'sessions.filterAll',      fallback: 'All'        },
  { id: 'running',  labelKey: 'sessions.filterRunning',  fallback: 'Running'    },
  { id: 'idle',     labelKey: 'sessions.filterIdle',     fallback: 'Idle'       },
  { id: 'subagent', labelKey: 'sessions.filterSubagent', fallback: 'Sub-agents' },
];

// ═══════════════════════════════════════════════════════════
// SessionCard
// ═══════════════════════════════════════════════════════════

interface SessionCardProps {
  session: SessionInfo;
}

function SessionCard({ session }: SessionCardProps) {
  const { t } = useTranslation();
  const isRunning = session.running === true;
  const isSubAgent = session.key.includes(':subagent:');
  const pct = tokenPercent(session.contextTokens, session.maxTokens);

  const displayName = getSessionDisplayLabel(session, {
    mainSessionLabel: t('dashboard.mainSession', 'Main Session'),
    genericSessionLabel: t('dashboard.session', 'Session'),
  });
  const isAgentKey  = session.key.startsWith('agent:');

  return (
    <div
      className={clsx(
        'flex flex-col gap-3 p-4 rounded-2xl border transition-all',
        'bg-[rgb(var(--aegis-overlay)/0.02)] hover:bg-[rgb(var(--aegis-overlay)/0.035)]',
        isRunning
          ? 'border-aegis-primary/20 hover:border-aegis-primary/30'
          : 'border-[rgb(var(--aegis-overlay)/0.07)] hover:border-[rgb(var(--aegis-overlay)/0.12)]',
      )}
    >
      {/* ── Row 1: name + status badge ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Icon */}
          <div
            className={clsx(
              'shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center border',
              isSubAgent
                ? 'bg-aegis-accent/10 border-aegis-accent/20'
                : 'bg-aegis-primary/10 border-aegis-primary/20',
            )}
          >
            {isSubAgent ? (
              <Zap size={14} className="text-aegis-accent" />
            ) : (
              <Bot size={14} className="text-aegis-primary" />
            )}
          </div>

          {/* Name */}
          <div className="min-w-0">
            <div className="text-[13px] font-bold truncate leading-tight">
              {displayName}
            </div>
            {/* Show formatted key underneath when label exists OR when key is agent-style */}
            {isAgentKey && (
              <div className="text-[9px] font-mono text-aegis-text-dim truncate leading-tight mt-0.5">
                {session.key.length > 40 ? session.key.substring(0, 40) + '…' : session.key}
              </div>
            )}
          </div>
        </div>

        {/* Status pill */}
        <div
          className={clsx(
            'shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.5px] border',
            isRunning
              ? 'bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400'
              : 'bg-[rgb(var(--aegis-overlay)/0.03)] border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim',
          )}
        >
          <span
            className={clsx(
              'w-[6px] h-[6px] rounded-full',
              isRunning ? 'bg-emerald-400' : 'bg-[rgb(var(--aegis-overlay)/0.25)]',
            )}
            style={isRunning ? { animation: 'mc-dot-ping 2s ease-in-out infinite' } : undefined}
          />
          {isRunning ? 'Running' : 'Idle'}
        </div>
      </div>

      {/* ── Row 2: model badge + compactions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {session.model && (
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-aegis-primary/[0.06] border border-aegis-primary/10 text-aegis-primary/70">
            {session.model}
          </span>
        )}

        {session.kind && (
          <span className="text-[9px] px-2 py-0.5 rounded-md bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-dim">
            {session.kind}
          </span>
        )}

        {(session.compactions ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] text-aegis-warning/70 bg-aegis-warning/[0.06] border border-aegis-warning/10 px-2 py-0.5 rounded-md">
            <Zap size={9} />
            {session.compactions}
          </span>
        )}
      </div>

      {/* ── Row 3: token usage bar ── */}
      {session.maxTokens ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] text-aegis-text-dim">
            <span className="flex items-center gap-1">
              <Activity size={9} />
              Context
            </span>
            <span className="font-mono">
              {fmtTokens(session.contextTokens)} / {fmtTokens(session.maxTokens)}
              <span className="ms-1 opacity-60">({pct}%)</span>
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-[rgb(var(--aegis-overlay)/0.06)] overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', tokenBarColor(pct))}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : session.contextTokens ? (
        <div className="text-[9px] text-aegis-text-dim flex items-center gap-1">
          <Activity size={9} />
          <span className="font-mono">{fmtTokens(session.contextTokens)} tokens used</span>
        </div>
      ) : null}

      {/* ── Row 4: last active ── */}
      <div className="flex items-center gap-1 text-[9px] text-aegis-text-dim">
        <Clock size={9} className="shrink-0" />
        <span>{formatTimeAgo(session.lastActive)}</span>
        {session.totalTokens != null && (
          <>
            <span className="mx-1 opacity-30">·</span>
            <span className="font-mono">{fmtTokens(session.totalTokens)} total</span>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SessionManagerPage
// ═══════════════════════════════════════════════════════════

export function SessionManagerPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');

  // ── Store ──
  const sessions = useGatewayDataStore((s) => s.sessions);
  const loading   = useGatewayDataStore((s) => s.loading.sessions);

  // ── Filtered list ──
  const filtered = useMemo<SessionInfo[]>(() => {
    switch (filter) {
      case 'running':
        return sessions.filter((s) => s.running === true);
      case 'idle':
        return sessions.filter((s) => s.running !== true);
      case 'subagent':
        return sessions.filter((s) => s.key.includes(':subagent:'));
      default:
        return sessions;
    }
  }, [sessions, filter]);

  // ── Counts for filter badges ──
  const counts = useMemo(() => ({
    all:      sessions.length,
    running:  sessions.filter((s) => s.running === true).length,
    idle:     sessions.filter((s) => s.running !== true).length,
    subagent: sessions.filter((s) => s.key.includes(':subagent:')).length,
  }), [sessions]);

  // ═══ RENDER ═══
  return (
    <PageTransition className="flex flex-col flex-1 min-h-0 p-6 gap-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-aegis-primary/10 border border-aegis-primary/20 shrink-0">
            <Users size={18} className="text-aegis-primary" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">
              {t('sessions.title', 'Sessions')}
            </h1>
            <p className="text-[11px] text-aegis-text-muted">
              {t('sessions.subtitle', 'Active and idle agent sessions')}
            </p>
          </div>
          {/* Total count badge */}
          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary uppercase tracking-[0.5px]">
            {counts.all}
          </span>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => refreshGroup('sessions')}
          disabled={loading}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-semibold transition-colors',
            'border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-muted hover:text-aegis-text-secondary',
            'bg-[rgb(var(--aegis-overlay)/0.02)] hover:bg-[rgb(var(--aegis-overlay)/0.04)]',
            loading && 'opacity-50 pointer-events-none',
          )}
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          {t('sessions.refresh', 'Refresh')}
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => {
          const count = counts[f.id];
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all',
                active
                  ? 'bg-aegis-primary/10 border-aegis-primary/25 text-aegis-primary'
                  : 'bg-[rgb(var(--aegis-overlay)/0.02)] border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text-secondary hover:border-[rgb(var(--aegis-overlay)/0.10)]',
              )}
            >
              {t(f.labelKey, f.fallback)}
              <span
                className={clsx(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center',
                  active
                    ? 'bg-aegis-primary/15 text-aegis-primary'
                    : 'bg-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-dim',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {loading && sessions.length === 0 ? (
        /* Initial loading state */
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-aegis-text-dim">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-[12px]">{t('sessions.loading', 'Loading sessions…')}</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)]">
              <Users size={24} className="text-aegis-text-dim" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-aegis-text-muted">
                {t('sessions.empty', 'No sessions found')}
              </p>
              <p className="text-[11px] text-aegis-text-dim mt-0.5">
                {filter !== 'all'
                  ? t('sessions.emptyFilter', 'Try switching to a different filter')
                  : t('sessions.emptyHint', 'Sessions will appear here when agents are active')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Sessions grid — 2 columns */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 auto-rows-max overflow-y-auto pb-2">
          {filtered.map((session) => (
            <SessionCard key={session.key} session={session} />
          ))}
        </div>
      )}
    </PageTransition>
  );
}

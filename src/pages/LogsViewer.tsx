// ═══════════════════════════════════════════════════════════
// LogsViewer — Live Gateway Session Logs
// Header: session selector + refresh + auto-refresh toggle
// Body: scrollable monospace log entries with level badges
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, RefreshCw, Loader2, ChevronDown, Pause, Play } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useGatewayDataStore } from '@/stores/gatewayDataStore';
import { gateway } from '@/services/gateway';
import clsx from 'clsx';

// ── Types ─────────────────────────────────────────────────

interface LogEntry {
  ts?: string;
  timestamp?: string;
  level?: string;
  msg?: string;
  message?: string;
  [k: string]: unknown;
}

// ── Constants ─────────────────────────────────────────────

const DEFAULT_SESSION = 'agent:main:main';
const AUTO_REFRESH_INTERVAL = 5000; // ms

// ── Helpers ───────────────────────────────────────────────

/** Format a session key into a human-readable label */
function formatSessionKey(key: string): string {
  if (!key) return key;
  if (key === 'agent:main:main') return 'Main';
  const parts = key.split(':');
  const last = parts[parts.length - 1];
  // Truncate UUID-like suffixes
  if (last.length === 36 && last.includes('-')) {
    const parent = parts[parts.length - 2] || last;
    return parent.charAt(0).toUpperCase() + parent.slice(1);
  }
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Parse a timestamp string into HH:MM:SS.mmm */
function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '??:??:??.???';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return ts;
  }
}

/** Normalise a raw log entry from any gateway response shape */
function normaliseEntry(raw: unknown, idx: number): LogEntry & { _id: number } {
  if (typeof raw === 'string') {
    return { _id: idx, msg: raw };
  }
  if (typeof raw === 'object' && raw !== null) {
    return { _id: idx, ...(raw as LogEntry) };
  }
  return { _id: idx, msg: String(raw) };
}

// ── Sub-components ────────────────────────────────────────

/** Level badge: info / warn / error → colour */
function LevelBadge({ level }: { level?: string }) {
  const l = (level || 'info').toLowerCase();
  const cls = clsx(
    'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider select-none shrink-0',
    {
      'bg-red-500/20 text-red-400':    l === 'error' || l === 'fatal' || l === 'err',
      'bg-yellow-500/20 text-yellow-400': l === 'warn' || l === 'warning',
      'bg-blue-500/15 text-blue-400':  l === 'debug' || l === 'trace' || l === 'verbose',
      'bg-white/8 text-white/40':      l === 'info' || (l !== 'error' && l !== 'fatal' && l !== 'err' && l !== 'warn' && l !== 'warning' && l !== 'debug' && l !== 'trace' && l !== 'verbose'),
    }
  );
  return <span className={cls}>{l.slice(0, 4)}</span>;
}

/** Single log row */
function LogRow({ entry }: { entry: LogEntry & { _id: number } }) {
  const ts  = entry.ts || entry.timestamp;
  const msg = entry.msg || entry.message || JSON.stringify(entry);

  return (
    <div className="flex items-start gap-2 py-0.5 px-3 hover:bg-white/4 rounded transition-colors">
      {/* Timestamp */}
      <span className="font-mono text-[11px] text-white/30 shrink-0 pt-0.5 tabular-nums">
        {formatTimestamp(ts)}
      </span>
      {/* Level */}
      <LevelBadge level={entry.level} />
      {/* Message */}
      <span className="font-mono text-[12px] text-white/80 break-all whitespace-pre-wrap leading-relaxed">
        {msg}
      </span>
    </div>
  );
}

// ── Session Dropdown ──────────────────────────────────────

interface SessionDropdownProps {
  sessions: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}

function SessionDropdown({ sessions, selected, onSelect }: SessionDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = sessions.find(s => s.key === selected)?.label ?? formatSessionKey(selected);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
          'bg-white/8 hover:bg-white/12 border border-white/10 text-white/80',
        )}
      >
        <span className="max-w-[180px] truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={clsx('text-white/40 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={clsx(
          'absolute top-full mt-1.5 z-50 min-w-[220px] max-h-72 overflow-y-auto',
          'rounded-xl border border-white/10 bg-[#1a1a2e]/95 backdrop-blur-xl shadow-2xl',
        )}>
          {sessions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-white/40 italic">{t('logs.noSessionsFound', 'No sessions found')}</div>
          ) : (
            sessions.map(s => (
              <button
                key={s.key}
                onClick={() => { onSelect(s.key); setOpen(false); }}
                className={clsx(
                  'w-full flex flex-col items-start px-4 py-2.5 text-sm transition-colors',
                  s.key === selected
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/6 hover:text-white',
                )}
              >
                <span className="font-medium truncate max-w-full">{s.label}</span>
                <span className="text-[11px] text-white/30 font-mono truncate max-w-full">{s.key}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export function LogsViewerPage() {
  const { t } = useTranslation();

  // ── State ──────────────────────────────────────────────
  const [selectedKey, setSelectedKey]   = useState<string>(DEFAULT_SESSION);
  const [logs, setLogs]                 = useState<(LogEntry & { _id: number })[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [lastFetch, setLastFetch]       = useState<number | null>(null);

  const scrollRef      = useRef<HTMLDivElement>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLogsLen    = useRef<number>(0);

  // ── Store data ─────────────────────────────────────────
  const storeSessions = useGatewayDataStore(s => s.sessions);

  const sessionOptions = storeSessions.map(s => ({
    key: s.key || '',
    label: formatSessionKey(s.key || '') || s.label || s.key || '',
  }));

  // Ensure DEFAULT_SESSION always appears even if not in store
  if (selectedKey === DEFAULT_SESSION && !sessionOptions.find(s => s.key === DEFAULT_SESSION)) {
    sessionOptions.unshift({ key: DEFAULT_SESSION, label: 'Main' });
  }

  // ── Fetch ──────────────────────────────────────────────
  const fetchLogs = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const result: unknown = await gateway.getSessionLogs(key, 200);

      // Normalise response — gateway may return array or object with .logs / .entries
      let raw: unknown[] = [];
      if (Array.isArray(result)) {
        raw = result;
      } else if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        if (Array.isArray(r.logs))    raw = r.logs;
        else if (Array.isArray(r.entries)) raw = r.entries;
        else if (Array.isArray(r.data))    raw = r.data;
      }

      const entries = raw.map((e, i) => normaliseEntry(e, i));
      setLogs(entries);
      setLastFetch(Date.now());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial fetch + session change ────────────────────
  useEffect(() => {
    void fetchLogs(selectedKey);
  }, [selectedKey, fetchLogs]);

  // ── Auto-refresh ──────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(() => void fetchLogs(selectedKey), AUTO_REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, selectedKey, fetchLogs]);

  // ── Scroll to bottom on new logs ──────────────────────
  useEffect(() => {
    if (logs.length !== prevLogsLen.current) {
      prevLogsLen.current = logs.length;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [logs]);

  // ── Handlers ──────────────────────────────────────────
  const handleSessionChange = (key: string) => {
    setSelectedKey(key);
    setLogs([]);
    setError(null);
  };

  const handleRefresh = () => {
    void fetchLogs(selectedKey);
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <PageTransition className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8 shrink-0 flex-wrap">
        {/* Title */}
        <div className="flex items-center gap-2 mr-1">
          <ScrollText size={18} className="text-white/50" />
          <h1 className="text-base font-semibold text-white/90 tracking-tight">
            {t('logsViewer.title', 'Logs')}
          </h1>
        </div>

        {/* Session selector */}
        <SessionDropdown
          sessions={sessionOptions}
          selected={selectedKey}
          onSelect={handleSessionChange}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Last fetch time */}
        {lastFetch && (
          <span className="text-[11px] text-white/25 tabular-nums hidden sm:block">
            {t('logsViewer.fetched', 'Fetched')} {new Date(lastFetch).toLocaleTimeString()}
          </span>
        )}

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(a => !a)}
          title={autoRefresh ? t('logsViewer.pauseAutoRefresh', 'Pause auto-refresh') : t('logsViewer.startAutoRefresh', 'Enable auto-refresh (5s)')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
            autoRefresh
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-white/6 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70',
          )}
        >
          {autoRefresh
            ? <><Pause size={13} /><span className="hidden sm:inline">{t('logsViewer.pause', 'Pause')}</span></>
            : <><Play  size={13} /><span className="hidden sm:inline">{t('logsViewer.live', 'Live')}</span></>
          }
        </button>

        {/* Manual refresh */}
        <button
          onClick={handleRefresh}
          disabled={loading}
          title={t('logsViewer.refresh', 'Refresh')}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/6 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70 transition-all disabled:opacity-40"
        >
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <RefreshCw size={14} />
          }
        </button>
      </div>

      {/* ── Body ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-2 min-h-0"
      >
        {/* Loading skeleton */}
        {loading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">{t('logsViewer.loading', 'Loading logs…')}</span>
          </div>
        )}

        {/* Error / no data */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <ScrollText size={28} className="text-white/20" />
            <p className="text-sm text-white/50 font-medium">
              {t('logsViewer.noLogs', 'No logs available')}
            </p>
            <p className="text-xs text-white/25 max-w-sm">
              {t('logsViewer.rpcNote', 'The RPC endpoint sessions.usage.logs may not be supported by your gateway version, or the session has no logs yet.')}
            </p>
            <p className="text-xs font-mono text-red-400/60 bg-red-500/5 rounded px-3 py-1.5 max-w-sm break-all">
              {error}
            </p>
          </div>
        )}

        {/* Empty — no error, just empty array */}
        {!loading && !error && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <ScrollText size={28} className="text-white/20" />
            <p className="text-sm text-white/40">
              {t('logsViewer.empty', 'No log entries for this session.')}
            </p>
            <p className="text-xs text-white/25 max-w-sm">
              {t('logsViewer.emptyNote', 'The sessions.usage.logs RPC may not be supported by your gateway version, or the session has no recorded logs.')}
            </p>
          </div>
        )}

        {/* Log entries */}
        {logs.length > 0 && (
          <div className="space-y-0.5">
            {logs.map(entry => (
              <LogRow key={entry._id} entry={entry} />
            ))}
            {/* Loading spinner at bottom during auto-refresh */}
            {loading && (
              <div className="flex items-center gap-2 px-3 py-1 text-white/20">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[11px] font-mono">{t('logsViewer.refreshing', 'Refreshing…')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 border-t border-white/6 text-[11px] text-white/25 font-mono">
        <span>{logs.length} {t('logsViewer.entries', 'entries')}</span>
        {autoRefresh && (
          <>
            <span className="w-px h-3 bg-white/10" />
            <span className="text-emerald-400/60">{t('logsViewer.autoRefreshActive', 'auto-refresh 5s')}</span>
          </>
        )}
        <span className="flex-1" />
        <span className="truncate max-w-[260px] text-white/15">{selectedKey}</span>
      </div>
    </PageTransition>
  );
}

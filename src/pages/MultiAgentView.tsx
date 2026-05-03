// ═══════════════════════════════════════════════════════════
// Multi-Agent View — Live sub-agent monitor
// Left: agent list (running + recent) | Right: selected agent detail
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, RefreshCw, Loader2, Zap, Clock, ChevronRight, MessageSquare } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useGatewayDataStore } from '@/stores/gatewayDataStore';
import { formatTokens } from '@/utils/format';
import { getSessionDisplayLabel } from '@/utils/sessionLabel';
import { gateway } from '@/services/gateway';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface HistoryMessage {
  role: 'user' | 'assistant' | 'system' | string;
  content: string | any;
  ts?: string;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const SUBAGENT_RE = /^agent:([^:]+):subagent:(.+)$/;

/** Format a session key:
 *  agent:core:subagent:abc123def → "Core • abc123"
 */
function formatAgentKey(key: string): string {
  const m = key.match(SUBAGENT_RE);
  if (!m) return key.length > 32 ? key.substring(0, 32) + '…' : key;
  const agentId = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const uuid = m[2].replace(/-/g, '').substring(0, 6);
  return `${agentId} • ${uuid}`;
}

/** Format seconds as human-readable duration: 1m 30s, 2h 5m, etc. */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format tokens — wraps central formatTokens with null handling */
const fmtTokens = (n?: number): string => n == null ? '—' : formatTokens(n);

/** Extract plain text from a message content (handles string or array) */
function extractText(content: string | any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (c?.type === 'text') return c.text || '';
        if (c?.type === 'tool_use') return `[Tool: ${c.name || 'unknown'}]`;
        if (c?.type === 'tool_result') return `[Result: ${String(c.content || '').substring(0, 60)}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object' && content !== null) {
    return JSON.stringify(content, null, 2);
  }
  return String(content || '');
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

function AgentCard({
  session,
  isRunning,
  isSelected,
  startTime,
  label,
  onClick,
}: {
  session: any;
  isRunning: boolean;
  isSelected: boolean;
  startTime?: number;
  label?: string;
  onClick: () => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isRunning || !startTime) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [isRunning, startTime]);

  void tick; // suppress lint — used to trigger re-render for uptime

  const uptime =
    isRunning && startTime
      ? formatDuration(Math.floor((Date.now() - startTime) / 1000))
      : null;

  const displayName = label || getSessionDisplayLabel(session, {
    mainSessionLabel: 'Main Session',
    genericSessionLabel: 'Session',
  });

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-start transition-all border',
        isSelected
          ? 'bg-aegis-accent/[0.06] border-aegis-accent/20 text-aegis-text'
          : 'bg-[rgb(var(--aegis-overlay)/0.02)] border-[rgb(var(--aegis-overlay)/0.05)] text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.04)] hover:border-[rgb(var(--aegis-overlay)/0.08)]',
      )}
    >
      {/* Status dot */}
      <span
        className={clsx(
          'w-2 h-2 rounded-full shrink-0',
          isRunning ? 'bg-emerald-400' : 'bg-[rgb(var(--aegis-overlay)/0.2)]',
        )}
        style={
          isRunning
            ? { boxShadow: '0 0 6px rgb(52 211 153 / 0.6)', animation: 'pulse 2s ease-in-out infinite' }
            : undefined
        }
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold truncate">{displayName}</div>
        {uptime && (
          <div className="text-[10px] text-aegis-text-dim font-mono mt-0.5 flex items-center gap-1">
            <Clock size={9} />
            {uptime}
          </div>
        )}
      </div>

      <ChevronRight
        size={12}
        className={clsx(
          'shrink-0 transition-opacity',
          isSelected ? 'opacity-50' : 'opacity-0 group-hover:opacity-30',
        )}
      />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export function MultiAgentViewPage() {
  const { t } = useTranslation();

  // ── Store ──
  const sessions = useGatewayDataStore((s) => s.sessions);
  const runningSubAgents = useGatewayDataStore((s) => s.runningSubAgents);

  // ── Derived: all sub-agent sessions ──
  const subAgentSessions = sessions.filter((s) => SUBAGENT_RE.test(s.key));

  // Running session keys for quick lookup
  const runningKeys = new Set(runningSubAgents.map((r) => r.sessionKey).filter(Boolean) as string[]);

  // Running sessions (in order)
  const runningSessions = subAgentSessions.filter((s) => runningKeys.has(s.key));

  // Recent completed (not running), latest first
  const recentSessions = subAgentSessions
    .filter((s) => !runningKeys.has(s.key))
    .sort((a, b) => {
      const ta = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const tb = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 20);

  // ── Selected agent state ──
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const fetchIdRef = useRef(0);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-select first running agent when list changes
  useEffect(() => {
    if (!selectedKey && runningSessions.length > 0) {
      setSelectedKey(runningSessions[0].key);
    }
  }, [runningSessions.length]); // eslint-disable-line

  // Fetch history for selected session
  const fetchHistory = useCallback(async (key: string, silent = false) => {
    const fetchId = ++fetchIdRef.current;
    if (!silent) setLoadingHistory(true);
    try {
      const res = await gateway.getHistory(key, 50);
      if (fetchId !== fetchIdRef.current) return; // stale
      const msgs: HistoryMessage[] = Array.isArray(res?.messages)
        ? res.messages
        : Array.isArray(res)
        ? res
        : [];
      setHistory(msgs);
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      if (!silent) setHistory([]);
    } finally {
      if (fetchId === fetchIdRef.current) setLoadingHistory(false);
    }
  }, []);

  // Load history when selected key changes
  useEffect(() => {
    if (!selectedKey) {
      setHistory([]);
      return;
    }
    fetchHistory(selectedKey, false);
  }, [selectedKey, fetchHistory]);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  // Auto-refresh every 5s when selected agent is running
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    if (!selectedKey || !runningKeys.has(selectedKey)) return;

    autoRefreshRef.current = setInterval(() => {
      fetchHistory(selectedKey, true);
    }, 5000);

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [selectedKey, runningKeys.size, fetchHistory]); // eslint-disable-line

  // ── Selected session info ──
  const selectedSession = sessions.find((s) => s.key === selectedKey) || null;
  const selectedRunning = runningSubAgents.find((r) => r.sessionKey === selectedKey) || null;
  const isSelectedRunning = selectedKey ? runningKeys.has(selectedKey) : false;

  // ── Uptime ticker for info bar ──
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isSelectedRunning) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [isSelectedRunning]);

  // ── Empty state: no sub-agent sessions at all ──
  const isEmpty = subAgentSessions.length === 0;

  // ── Token % ──
  const tokenPct =
    selectedSession?.contextTokens && selectedSession?.maxTokens && selectedSession.maxTokens > 0
      ? Math.min(100, Math.round((selectedSession.contextTokens / selectedSession.maxTokens) * 100))
      : null;

  // ─────────────────────────────────────────────────────────
  return (
    <PageTransition className="flex flex-col flex-1 min-h-0">
      {/* ══ HEADER ══ */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.004)]">
        <Bot size={16} className="text-aegis-accent shrink-0" />
        <span className="text-base font-extrabold">{t('multiAgent.title', 'Multi-Agent')}</span>

        {/* Active count badge */}
        {runningSessions.length > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md
            bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 uppercase tracking-[0.5px]">
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              style={{ animation: 'pulse 2s ease-in-out infinite' }}
            />
            {runningSessions.length} {t('multiAgent.active', 'Active')}
          </span>
        )}

        <div className="flex-1" />

        {/* Refresh button */}
        <button
          onClick={() => selectedKey && fetchHistory(selectedKey, false)}
          disabled={!selectedKey || loadingHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[rgb(var(--aegis-overlay)/0.06)]
            text-[11px] font-semibold text-aegis-text-muted hover:text-aegis-text-secondary transition-colors disabled:opacity-30"
        >
          <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      {/* ══ EMPTY STATE ══ */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center
            bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)]">
            <Bot size={28} className="text-aegis-text-dim" />
          </div>
          <div>
            <p className="text-sm font-semibold text-aegis-text-secondary">
              {t('multiAgent.empty', 'No sub-agent sessions found')}
            </p>
            <p className="text-[11px] text-aegis-text-dim mt-1 max-w-xs">
              {t('multiAgent.emptyHint', 'Sub-agents will appear here when they are spawned by the main agent.')}
            </p>
          </div>
        </div>
      ) : (
        /* ══ SPLIT LAYOUT ══ */
        <div className="flex-1 flex overflow-hidden">

          {/* ── LEFT PANEL: Agent List (250px) ── */}
          <div className="w-[250px] shrink-0 border-e border-[rgb(var(--aegis-overlay)/0.06)] flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">

              {/* Running section */}
              {runningSessions.length > 0 && (
                <>
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] font-extrabold uppercase tracking-[1.5px] text-aegis-text-dim">
                      {t('multiAgent.running', 'Running')}
                    </span>
                  </div>
                  {runningSessions.map((s) => {
                    const runInfo = runningSubAgents.find((r) => r.sessionKey === s.key);
                    return (
                      <AgentCard
                        key={s.key}
                        session={s}
                        isRunning
                        isSelected={selectedKey === s.key}
                        startTime={runInfo?.startTime}
                        label={runInfo?.label || s.label}
                        onClick={() => setSelectedKey(s.key)}
                      />
                    );
                  })}
                </>
              )}

              {/* Recent section */}
              {recentSessions.length > 0 && (
                <>
                  <div className={clsx('px-2 pb-1', runningSessions.length > 0 ? 'pt-4' : 'pt-2')}>
                    <span className="text-[9px] font-extrabold uppercase tracking-[1.5px] text-aegis-text-dim">
                      {t('multiAgent.recent', 'Recent')}
                    </span>
                  </div>
                  {recentSessions.map((s) => (
                    <AgentCard
                      key={s.key}
                      session={s}
                      isRunning={false}
                      isSelected={selectedKey === s.key}
                      label={s.label}
                      onClick={() => setSelectedKey(s.key)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Detail ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {!selectedKey ? (
              /* Empty detail state */
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                <MessageSquare size={32} className="text-aegis-text-dim opacity-40" />
                <p className="text-[12px] text-aegis-text-dim">
                  {t('multiAgent.selectAgent', 'Select an agent to view its output')}
                </p>
              </div>
            ) : (
              <>
                {/* ── Info bar ── */}
                <div className="shrink-0 flex items-center gap-3 flex-wrap px-5 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.004)]">
                  {/* Agent name */}
                  <div className="flex items-center gap-2">
                    <div
                      className={clsx(
                        'w-2 h-2 rounded-full',
                        isSelectedRunning ? 'bg-emerald-400' : 'bg-[rgb(var(--aegis-overlay)/0.2)]',
                      )}
                      style={
                        isSelectedRunning
                          ? { boxShadow: '0 0 6px rgb(52 211 153 / 0.6)', animation: 'pulse 2s ease-in-out infinite' }
                          : undefined
                      }
                    />
                    <span className="text-[13px] font-bold">
                      {selectedRunning?.label || getSessionDisplayLabel(selectedSession ?? { key: selectedKey ?? '' }, {
                        mainSessionLabel: 'Main Session',
                        genericSessionLabel: 'Session',
                      })}
                    </span>
                    <span
                      className={clsx(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-[0.5px] border',
                        isSelectedRunning
                          ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400'
                          : 'bg-[rgb(var(--aegis-overlay)/0.04)] border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim',
                      )}
                    >
                      {isSelectedRunning
                        ? t('multiAgent.statusRunning', 'Running')
                        : t('multiAgent.statusDone', 'Done')}
                    </span>
                  </div>

                  <div className="h-4 w-px bg-[rgb(var(--aegis-overlay)/0.08)] hidden sm:block" />

                  {/* Model badge */}
                  {selectedSession?.model && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-aegis-text-muted
                      px-2 py-1 rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]">
                      <Zap size={10} className="text-aegis-accent" />
                      {selectedSession.model.split('/').pop() || selectedSession.model}
                    </div>
                  )}

                  {/* Tokens */}
                  {selectedSession?.contextTokens != null && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-aegis-text-muted
                      px-2 py-1 rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]">
                      <span className="text-aegis-text-secondary font-semibold">
                        {fmtTokens(selectedSession.contextTokens)}
                      </span>
                      {selectedSession.maxTokens != null && (
                        <span className="text-aegis-text-dim">/ {fmtTokens(selectedSession.maxTokens)}</span>
                      )}
                      {tokenPct != null && (
                        <span
                          className={clsx(
                            'text-[9px] font-bold',
                            tokenPct >= 90
                              ? 'text-red-400'
                              : tokenPct >= 70
                              ? 'text-amber-400'
                              : 'text-aegis-text-dim',
                          )}
                        >
                          {tokenPct}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Compactions */}
                  {selectedSession?.compactions != null && selectedSession.compactions > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-aegis-text-dim
                      px-2 py-1 rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]">
                      <RefreshCw size={9} />
                      {selectedSession.compactions}×
                    </div>
                  )}

                  {/* Duration */}
                  {isSelectedRunning && selectedRunning?.startTime && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-aegis-text-muted
                      px-2 py-1 rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]">
                      <Clock size={9} />
                      {formatDuration(Math.floor((Date.now() - selectedRunning.startTime) / 1000))}
                    </div>
                  )}

                  {/* Auto-refresh indicator */}
                  {isSelectedRunning && (
                    <div className="ms-auto flex items-center gap-1.5 text-[9px] text-aegis-text-dim">
                      <Loader2 size={10} className="animate-spin" />
                      {t('multiAgent.liveRefresh', 'Live')}
                    </div>
                  )}
                </div>

                {/* ── Message history ── */}
                <div className="flex-1 overflow-y-auto">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-aegis-text-dim text-sm">
                      <Loader2 size={16} className="animate-spin" />
                      {t('common.loading', 'Loading…')}
                    </div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                      <MessageSquare size={24} className="text-aegis-text-dim opacity-30" />
                      <p className="text-[11px] text-aegis-text-dim">
                        {t('multiAgent.noHistory', 'No messages yet')}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-1">
                      {history.map((msg, i) => (
                        <MessageRow key={i} message={msg} index={i} />
                      ))}
                      <div ref={historyEndRef} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════
// MessageRow — single message in the history panel
// ═══════════════════════════════════════════════════════════

function MessageRow({ message, index }: { message: HistoryMessage; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const text = extractText(message.content);
  const isLong = text.length > 400;
  const displayText = isLong && !expanded ? text.substring(0, 400) + '…' : text;

  const roleStyles = {
    user: 'text-aegis-text-muted',
    assistant: 'text-aegis-text',
    system: 'text-aegis-text-dim',
    tool: 'text-aegis-text-dim',
  };

  const roleBadgeStyles = {
    user: 'bg-[rgb(var(--aegis-overlay)/0.04)] border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-dim',
    assistant: 'bg-aegis-accent/[0.06] border-aegis-accent/15 text-aegis-accent',
    system: 'bg-[rgb(var(--aegis-overlay)/0.02)] border-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim',
    tool: 'bg-aegis-primary/[0.04] border-aegis-primary/10 text-aegis-primary/60',
  };

  const role = message.role as keyof typeof roleStyles;
  const textClass = roleStyles[role] ?? 'text-aegis-text-muted';
  const badgeClass = roleBadgeStyles[role] ?? roleBadgeStyles.system;

  return (
    <div
      className={clsx(
        'group flex gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-[rgb(var(--aegis-overlay)/0.02)]',
        index % 2 === 0 ? '' : '',
      )}
    >
      {/* Role badge */}
      <div
        className={clsx(
          'shrink-0 mt-[2px] text-[8px] font-extrabold uppercase tracking-[1px] px-1.5 py-0.5 rounded border h-fit',
          badgeClass,
        )}
        style={{ minWidth: '48px', textAlign: 'center' }}
      >
        {message.role}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <pre
          className={clsx(
            'whitespace-pre-wrap break-words text-[12px] leading-relaxed font-mono',
            textClass,
          )}
        >
          {displayText}
        </pre>
        {isLong && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-[10px] text-aegis-accent/60 hover:text-aegis-accent transition-colors"
          >
            {expanded ? 'Show less' : `Show ${text.length - 400} more chars`}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Mission Control — 3-Column Command Center
// Top: Command bar | Col 1: Gantt job rows | Col 2: 24h clock | Col 3: Detail + Activity
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, RotateCcw, Loader2, Check, X, Plus, Search } from 'lucide-react';
import { gateway } from '@/services/gateway';
import { useChatStore } from '@/stores/chatStore';
import { useGatewayDataStore, refreshGroup } from '@/stores/gatewayDataStore';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { dataColor, themeHex, themeAlpha } from '@/utils/theme-colors';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface CronJob {
  id: string;
  name: string;
  schedule: any;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
  sessionTarget: string;
  payload: any;
  // Gateway 2026.2.25+: stagger and exact timing flags
  stagger?: string;   // e.g. "2m", "5m" — delays run by random duration up to this value
  exact?: boolean;    // if true, disables auto-spread for top-of-hour jobs
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    lastDurationMs?: number;
    // Gateway 2026.2.22+: split run vs delivery status
    lastRunStatus?: string;
    lastDeliveryStatus?: string;
  };
}

interface RunEntry {
  ts: string;
  status: string;
  summary?: string;
  error?: string;
  durationMs?: number;
  jobId?: string;
  jobName?: string;
  // Gateway 2026.2.22+: split delivery status
  deliveryStatus?: string;
}

// ═══════════════════════════════════════════════════════════
// Constants & Helpers
// ═══════════════════════════════════════════════════════════

/** Theme-aware job color palette — called at render time */
const getJobColor = (idx: number): string => dataColor(idx);

const getJobIcon = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('heart') || n.includes('beat')) return '💓';
  if (n.includes('morning') || n.includes('brief')) return '⚡';
  if (n.includes('health') || n.includes('system')) return '🔍';
  if (n.includes('sync') || n.includes('memory') || n.includes('db')) return '🔄';
  if (n.includes('research')) return '📡';
  if (n.includes('github') || n.includes('stats')) return '📊';
  if (n.includes('price') || n.includes('monitor')) return '💰';
  if (n.includes('digest') || n.includes('weekly')) return '📝';
  if (n.includes('check') || n.includes('nudge')) return '🧠';
  if (n.includes('maintain') || n.includes('clean')) return '🛠️';
  if (n.includes('hilal') || n.includes('هلال')) return '⚽';
  return '⏰';
};

const getNextRun = (job: CronJob) => job.state?.nextRunAtMs || job.nextRun;
const getLastRun = (job: CronJob) => job.state?.lastRunAtMs || job.lastRun;
const getStatus = (job: CronJob): 'active' | 'error' | 'paused' => {
  if (!job.enabled) return 'paused';
  // Check both legacy lastStatus and new split fields (Gateway 2026.2.22+)
  const runStatus = job.state?.lastRunStatus || job.state?.lastStatus;
  if (runStatus === 'error') return 'error';
  return 'active';
};

/** Get delivery status for display (Gateway 2026.2.22+) */
const getDeliveryStatus = (job: CronJob): 'delivered' | 'failed' | 'unknown' | null => {
  const ds = job.state?.lastDeliveryStatus;
  if (!ds || ds === 'not-delivered') return null; // Not available or isolated job (no delivery target)
  if (ds === 'delivered' || ds === 'ok') return 'delivered';
  if (ds === 'failed' || ds === 'error') return 'failed';
  return 'unknown';
};

// ── Templates ──

// Fix #8: colorIdx instead of dataColor() at module load (CSS vars may not be ready)
// Templates use i18n keys — resolved at render time via getCronTemplates()
function getCronTemplates(t: (key: string) => string) {
  return [
    {
      id: 'morning-briefing', icon: '⚡', colorIdx: 2,
      name: t('cronTemplates.morningName'),
      desc: t('cronTemplates.morningDesc'),
      job: { name: 'Morning Briefing', schedule: { kind: 'cron', expr: '0 6 * * *', tz: 'UTC' }, payload: { kind: 'agentTurn', message: 'Good morning! Prepare a brief morning briefing: 1) Check the weather for my location, 2) Search for top news headlines today, 3) Check memory files for any upcoming tasks, reminders, or deadlines. Keep it concise and useful.' }, sessionTarget: 'isolated', enabled: true },
    },
    {
      id: 'weekly-digest', icon: '📝', colorIdx: 1,
      name: t('cronTemplates.weeklyName'),
      desc: t('cronTemplates.weeklyDesc'),
      job: { name: 'Weekly Digest', schedule: { kind: 'cron', expr: '0 20 * * 5', tz: 'UTC' }, payload: { kind: 'agentTurn', message: 'Weekly review time. 1) Read through this week\'s memory files, 2) Summarize key events and decisions, 3) Update MEMORY.md with important info, 4) Clean up outdated entries.' }, sessionTarget: 'isolated', enabled: true },
    },
    {
      id: 'check-in', icon: '🧠', colorIdx: 3,
      name: t('cronTemplates.checkInName'),
      desc: t('cronTemplates.checkInDesc'),
      job: { name: 'Check-In', schedule: { kind: 'every', everyMs: 28800000 }, payload: { kind: 'agentTurn', message: 'Time for a check-in. Review recent memory files and sessions for context. If there are pending tasks or anything worth following up on, reach out. If nothing needs attention, skip silently.' }, sessionTarget: 'isolated', enabled: true },
    },
    {
      id: 'system-health', icon: '🔍', colorIdx: 5,
      name: t('cronTemplates.healthName'),
      desc: t('cronTemplates.healthDesc'),
      job: { name: 'System Health Check', schedule: { kind: 'every', everyMs: 21600000 }, payload: { kind: 'agentTurn', message: 'Run a system health check: 1) Check disk space, 2) Check memory usage, 3) Check uptime, 4) Look for unusual processes. Report only if something needs attention.' }, sessionTarget: 'isolated', enabled: true },
    },
  ];
}

// ── Formatting ──

function formatSchedule(schedule: any): string {
  if (!schedule) return '—';
  if (schedule.kind === 'every') {
    const mins = Math.round((schedule.everyMs || 0) / 60000);
    if (mins < 60) return `Every ${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `Every ${h}h ${m}m` : `Every ${h}h`;
  }
  if (schedule.kind === 'at') return new Date(schedule.at).toLocaleString();
  if (schedule.kind === 'cron') {
    const parts = (schedule.expr || '').split(' ');
    if (parts.length >= 5) {
      const [min, hour, dom, mon] = parts;
      if (dom !== '*' && mon === '*' && hour !== '*') return `Monthly ${dom}${ordSuffix(dom)} ${fmtTime(hour, min)}`;
      if (dom !== '*' && mon !== '*') return `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mon]||mon} ${dom} ${fmtTime(hour,min)}`;
      if (hour.includes('*/')) return `Every ${hour.replace('*/','')}h`;
      if (hour !== '*' && dom === '*') return `Daily ${fmtTime(hour, min)}`;
    }
    return schedule.expr;
  }
  return '—';
}

function ordSuffix(n: string) { const v = +n; return [1,21,31].includes(v)?'st':[2,22].includes(v)?'nd':[3,23].includes(v)?'rd':'th'; }
function fmtTime(h: string, m: string) { const hr=+h, mm=m.padStart(2,'0'); return hr===0?`12:${mm}AM`:hr<12?`${hr}:${mm}AM`:hr===12?`12:${mm}PM`:`${hr-12}:${mm}PM`; }

function formatTimeAgo(ts: string | number | null | undefined): string {
  if (ts == null) return '—';
  try {
    const d = new Date(typeof ts === 'string' ? ts : ts);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if (diff < 0) {
      const a = Math.abs(diff);
      if (a < 60000) return 'now';
      if (a < 3600000) return `in ${Math.floor(a / 60000)}m`;
      if (a < 86400000) { const h = Math.floor(a / 3600000), m = Math.floor((a % 3600000) / 60000); return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`; }
      return `in ${Math.floor(a / 86400000)}d`;
    }
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch { return '—'; }
}

function formatCountdown(ts: string | number | null | undefined): string {
  if (ts == null) return '—';
  try {
    const d = new Date(typeof ts === 'string' ? ts : ts);
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return 'now';
    if (diff < 3600000) return `${Math.ceil(diff / 60000)}m`;
    if (diff < 86400000) { const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
    return `${Math.floor(diff / 86400000)}d`;
  } catch { return '—'; }
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Cycle progress: how far through current interval (0–100) */
function cycleProgress(job: CronJob): number {
  const next = job.state?.nextRunAtMs || (job.nextRun ? new Date(job.nextRun).getTime() : 0);
  const last = job.state?.lastRunAtMs || (job.lastRun ? new Date(job.lastRun).getTime() : 0);
  if (!next || !last || next <= last) return 0;
  const total = next - last;
  const elapsed = Date.now() - last;
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

/** Hour angle (0–360) for placing a cron job on the 24h clock */
function scheduleAngle(schedule: any): number | null {
  if (!schedule) return null;
  if (schedule.kind === 'cron') {
    const parts = (schedule.expr || '').split(' ');
    if (parts.length >= 2) {
      const hour = +parts[1];
      if (!isNaN(hour)) return (hour / 24) * 360;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// ClockFace — 24h circular schedule visualization
// ═══════════════════════════════════════════════════════════

function ClockFace({ jobs, colorMap, selectedId, onSelect }: {
  jobs: CronJob[];
  colorMap: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const primaryHex = themeHex('primary');
  const [nowAngle, setNowAngle] = useState(0);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getHours() + now.getMinutes() / 60;
      setNowAngle((hours / 24) * 360);
      setTimeStr(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, []);

  const cx = 200, cy = 200, outerR = 170;

  // 24h major ticks (every 3h) + labels
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21].map(h => {
    const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
    return {
      h,
      x1: cx + Math.cos(a) * (outerR - 6), y1: cy + Math.sin(a) * (outerR - 6),
      x2: cx + Math.cos(a) * (outerR + 4), y2: cy + Math.sin(a) * (outerR + 4),
      lx: cx + Math.cos(a) * (outerR + 16), ly: cy + Math.sin(a) * (outerR + 16),
    };
  });

  // Job dots on the clock
  const jobDots = jobs.filter(j => j.enabled).map(job => {
    const angle = scheduleAngle(job.schedule);
    if (angle === null) return null;
    const rad = (angle - 90) * (Math.PI / 180);
    const r = outerR - 30;
    const color = colorMap[job.id] || dataColor(9);
    const isError = job.state?.lastStatus === 'error';
    const isSelected = selectedId === job.id;
    return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r, color, job, isError, isSelected };
  }).filter(Boolean) as { x: number; y: number; color: string; job: CronJob; isError: boolean; isSelected: boolean }[];

  // NOW hand endpoint
  const handRad = (nowAngle - 90) * (Math.PI / 180);
  const handX = cx + Math.cos(handRad) * (outerR - 50);
  const handY = cy + Math.sin(handRad) * (outerR - 50);
  // Time label near the hand tip
  const tlR = outerR - 60;
  const tlx = cx + Math.cos(handRad) * tlR;
  const tly = cy + Math.sin(handRad) * tlR;

  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" style={{ maxWidth: 420, maxHeight: 420 }}>
      <defs>
        <radialGradient id="mc-cg">
          <stop offset="0%" stopColor={primaryHex} stopOpacity={0.08} />
          <stop offset="100%" stopColor={primaryHex} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Background rings */}
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgb(var(--aegis-overlay) / 0.08)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={outerR - 40} fill="none" stroke="rgb(var(--aegis-overlay) / 0.05)" strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={outerR - 80} fill="none" stroke="rgb(var(--aegis-overlay) / 0.05)" strokeWidth={0.5} />

      {/* Center glow */}
      <circle cx={cx} cy={cy} r={60} fill="url(#mc-cg)">
        <animate attributeName="r" values="60;65;60" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* Heartbeat: continuous dashed ring at inner orbit */}
      {jobs.some(j => j.enabled && (j.name || '').toLowerCase().includes('heart')) && (
        <circle cx={cx} cy={cy} r={outerR - 80} fill="none"
          stroke={primaryHex} strokeWidth={3} strokeOpacity={0.08} strokeDasharray="4 12" />
      )}

      {/* Hour ticks + labels */}
      {ticks.map(t => (
        <g key={t.h}>
          <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgb(var(--aegis-overlay) / 0.12)" strokeWidth={1} />
          <text x={t.lx} y={t.ly} textAnchor="middle" dominantBaseline="central"
            fontSize={9} fill="rgb(var(--aegis-overlay) / 0.25)" fontFamily="monospace" fontWeight={600}>
            {t.h}
          </text>
        </g>
      ))}

      {/* Job dots */}
      {jobDots.map((dot, i) => (
        <g key={dot.job.id} className="cursor-pointer" onClick={() => onSelect(dot.job.id)}>
          {/* Glow ring */}
          <circle cx={dot.x} cy={dot.y} r={12} fill={dot.color} opacity={dot.isSelected ? 0.12 : 0.05}>
            {!dot.isError && (
              <animate attributeName="opacity"
                values={dot.isSelected ? '0.12;0.06;0.12' : '0.05;0.02;0.05'}
                dur="3s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
            )}
          </circle>
          {/* Main dot */}
          <circle cx={dot.x} cy={dot.y} r={dot.isSelected ? 7 : 6}
            fill={dot.color} opacity={dot.isError ? 0.6 : 0.8}
            stroke={dot.isSelected ? 'white' : 'none'} strokeWidth={dot.isSelected ? 1.5 : 0} strokeOpacity={0.3}>
            {dot.isError && (
              <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Label */}
          <text x={dot.x} y={dot.y - 12} textAnchor="middle" fontSize={7}
            fill={`${dot.color}99`} fontFamily="-apple-system, sans-serif" fontWeight={600}>
            {(dot.job.name || '').length > 12 ? (dot.job.name || '').substring(0, 11) + '…' : dot.job.name}
          </text>
        </g>
      ))}

      {/* NOW hand */}
      <line x1={cx} y1={cy} x2={handX} y2={handY}
        stroke={primaryHex} strokeWidth={2} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${themeAlpha('primary', 0.5)})` }} />
      <circle cx={cx} cy={cy} r={5} fill={primaryHex}
        style={{ filter: `drop-shadow(0 0 6px ${themeAlpha('primary', 0.5)})` }} />
      {/* Pulse ring */}
      <circle cx={cx} cy={cy} r={10} fill="none" stroke={primaryHex} strokeWidth={1} opacity={0.2}>
        <animate attributeName="r" values="10;16;10" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0;0.2" dur="3s" repeatCount="indefinite" />
      </circle>

      {/* Time label near hand tip */}
      <text x={tlx} y={tly} textAnchor="middle" dominantBaseline="central"
        fontSize={8} fill={primaryHex} fontFamily="monospace" fontWeight={800} letterSpacing={1}
        transform={`rotate(${-nowAngle} ${tlx} ${tly})`}>
        {timeStr}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export function CronMonitorPage() {
  const { t } = useTranslation();
  const { connected } = useChatStore();
  // lang removed — templates now use i18n keys directly

  // ── State (jobs from central store) ──
  const storeJobs = useGatewayDataStore((s) => s.cronJobs) as CronJob[];
  const jobs = storeJobs;
  const loading = useGatewayDataStore((s) => s.loading.cron);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, 'ok' | 'error'>>({});
  const [templateResult, setTemplateResult] = useState<Record<string, 'ok' | 'error'>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunEntry[]>([]);
  const [selectedJobRuns, setSelectedJobRuns] = useState<RunEntry[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Fix #1: Stable ref for jobs — avoids useCallback rebuilding every 30s
  const jobsRef = useRef<CronJob[]>([]);
  jobsRef.current = jobs;

  // Fix #3: Stale request guard for selected job fetches
  const selectedFetchId = useRef(0);

  // Fix #6: Tick for live countdown/timeAgo updates (every 15s)
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => (t + 1) % 10000), 15000);
    return () => clearInterval(iv);
  }, []);

  // Fix #11: Cache theme hex values (re-computed on mount only)
  const tc = useMemo(() => ({
    primary: themeHex('primary'),
    accent: themeHex('accent'),
    danger: themeHex('danger'),
    warning: themeHex('warning'),
    success: themeHex('success'),
    dangerA70: themeAlpha('danger', 0.7),
    dangerA40: themeAlpha('danger', 0.4),
    dangerA25: themeAlpha('danger', 0.25),
    primaryA50: themeAlpha('primary', 0.5),
  }), []); // eslint-disable-line

  // ── Derived ──
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    jobs.forEach((j, i) => { m[j.id] = getJobColor(i); });
    return m;
  }, [jobs]);

  const activeCount = useMemo(() => jobs.filter(j => j.enabled && j.state?.lastStatus !== 'error').length, [jobs]);
  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId) || null, [jobs, selectedJobId]);

  // Sorted: errors → active (by next run) → paused | filtered by search
  const sortedJobs = useMemo(() => {
    let filtered = jobs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = jobs.filter(j => (j.name || j.id).toLowerCase().includes(q));
    }
    return [...filtered].sort((a, b) => {
      const sa = getStatus(a), sb = getStatus(b);
      if (sa === 'error' && sb !== 'error') return -1;
      if (sb === 'error' && sa !== 'error') return 1;
      if (sa === 'paused' && sb !== 'paused') return 1;
      if (sb === 'paused' && sa !== 'paused') return -1;
      const an = new Date(getNextRun(a) || '9999').getTime();
      const bn = new Date(getNextRun(b) || '9999').getTime();
      return an - bn;
    });
  }, [jobs, searchQuery]);

  // Jobs come from central store (polled every 30s automatically)

  // ── Runs cache — only reload on manual Refresh or first mount ──
  const runsCache = useRef<Record<string, RunEntry[]>>({});
  const runsCacheLoaded = useRef(false);

  // ── Load all recent runs — batched (3 at a time) to avoid gateway overload ──
  // Fix #1: uses jobsRef instead of jobs dependency → no rebuild every 30s
  const loadAllRuns = useCallback(async () => {
    const currentJobs = jobsRef.current;
    if (!connected || currentJobs.length === 0) return;
    setLoadingRuns(true);
    try {
      const all: RunEntry[] = [];
      const jobList = currentJobs.slice(0, 12);
      const BATCH_SIZE = 3;

      for (let i = 0; i < jobList.length; i += BATCH_SIZE) {
        const batch = jobList.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (job) => {
          try {
            const result = await gateway.call('cron.runs', { jobId: job.id });
            const entries = (result?.entries || []).slice(-5).map((e: any) => ({
              ...e, jobId: job.id, jobName: job.name || job.id,
            }));
            runsCache.current[job.id] = entries;
            all.push(...entries);
          } catch { /* silent */ }
        }));
      }

      all.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
      setRecentRuns(all.slice(0, 30));
      runsCacheLoaded.current = true;
    } catch { /* silent */ }
    finally { setLoadingRuns(false); }
  }, [connected]);

  // ── Load runs for a single job and merge into cache ──
  // Fix #1: uses jobsRef → stable callback, no rebuild on poll
  const loadSingleJobRuns = useCallback(async (jobId: string) => {
    if (!connected) return;
    try {
      const job = jobsRef.current.find(j => j.id === jobId);
      const result = await gateway.call('cron.runs', { jobId });
      const entries = (result?.entries || []).slice(-5).map((e: any) => ({
        ...e, jobId, jobName: job?.name || jobId,
      }));
      runsCache.current[jobId] = entries;

      // Rebuild recent runs from cache
      const all: RunEntry[] = [];
      Object.values(runsCache.current).forEach(arr => all.push(...arr));
      all.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
      setRecentRuns(all.slice(0, 30));
    } catch { /* silent */ }
  }, [connected]);

  // Load once on first mount only
  useEffect(() => {
    if (jobs.length > 0 && !runsCacheLoaded.current) loadAllRuns();
  }, [jobs.length]); // eslint-disable-line

  // ── Load selected job runs (cache-first, then fetch) ──
  // Fix #3: stale request guard — rapid clicks don't cause race conditions
  useEffect(() => {
    if (!selectedJobId || !connected) { setSelectedJobRuns([]); return; }

    const fetchId = ++selectedFetchId.current;

    // Show cached data immediately (if available)
    const cached = runsCache.current[selectedJobId];
    if (cached?.length) {
      setSelectedJobRuns([...cached].slice(-14).reverse());
    }

    // Then fetch fresh data in background
    (async () => {
      try {
        const result = await gateway.call('cron.runs', { jobId: selectedJobId });
        if (fetchId !== selectedFetchId.current) return; // stale — discard
        const job = jobsRef.current.find(j => j.id === selectedJobId);
        const entries = (result?.entries || []).slice(-14).reverse().map((e: any) => ({
          ...e, jobId: selectedJobId, jobName: job?.name || selectedJobId,
        }));
        setSelectedJobRuns(entries);
      } catch {
        if (fetchId !== selectedFetchId.current) return; // stale
        if (!cached?.length) setSelectedJobRuns([]);
      }
    })();
  }, [selectedJobId, connected]);

  // ── Actions ──
  const toggleJob = async (jobId: string, enabled: boolean) => {
    setActionLoading(jobId);
    try { await gateway.call('cron.update', { jobId, patch: { enabled } }); await refreshGroup('cron'); }
    catch { /* silent */ } finally { setActionLoading(null); }
  };

  const runJob = async (jobId: string) => {
    setActionLoading(`run-${jobId}`);
    setRunResult(p => { const n = { ...p }; delete n[jobId]; return n; });
    try {
      await gateway.call('cron.run', { id: jobId }); await refreshGroup('cron');
      setRunResult(p => ({ ...p, [jobId]: 'ok' }));
      // Only refresh this single job's runs (not all 12)
      setTimeout(() => loadSingleJobRuns(jobId), 2000);
    } catch { setRunResult(p => ({ ...p, [jobId]: 'error' })); }
    finally {
      setActionLoading(null);
      setTimeout(() => setRunResult(p => { const n = { ...p }; delete n[jobId]; return n; }), 2500);
    }
  };

  const cronTemplates = useMemo(() => getCronTemplates(t), [t]);

  const addTemplate = async (tpl: ReturnType<typeof getCronTemplates>[0]) => {
    setActionLoading(`tpl-${tpl.id}`);
    try {
      await gateway.call('cron.add', { job: tpl.job }); await refreshGroup('cron');
      setTemplateResult(p => ({ ...p, [tpl.id]: 'ok' }));
    } catch { setTemplateResult(p => ({ ...p, [tpl.id]: 'error' })); }
    finally {
      setActionLoading(null);
      setTimeout(() => setTemplateResult(p => { const n = { ...p }; delete n[tpl.id]; return n; }), 2500);
    }
  };

  // Auto-select first job — Fix #10: deps = [jobs.length] not [jobs]
  useEffect(() => { if (jobs.length > 0 && !selectedJobId) setSelectedJobId(jobs[0].id); }, [jobs.length]); // eslint-disable-line

  // ═══ RENDER ═══
  // Activity log shows selected job's runs when a job is selected, otherwise all recent runs
  const activityRuns = selectedJobId ? selectedJobRuns : recentRuns;
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 'calc(100vh - 80px)' }}>

      {/* ═══ COMMAND BAR ═══ */}
      <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.004)]">
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold">🚀 {t('cron.title', 'Mission Control')}</span>
          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md
            bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary uppercase tracking-[1px]">
            {t('cron.jobsCount', { count: jobs.length })}
          </span>
        </div>
        <div className="flex-1" />
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-aegis-text-muted pointer-events-none" />
          <input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('cron.searchPlaceholder', 'Search jobs...')}
            className="w-[200px] ps-8 pe-3 py-1.5 rounded-[10px] text-xs
              bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text placeholder:text-aegis-text-muted
              outline-none focus:border-aegis-accent/30 focus:bg-aegis-accent/[0.03] transition-all"
          />
        </div>
        <button onClick={() => { refreshGroup('cron'); loadAllRuns(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[rgb(var(--aegis-overlay)/0.06)]
            text-[11px] font-semibold text-aegis-text-muted hover:text-aegis-text-secondary transition-colors">
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} /> {t('common.refresh', 'Refresh')}
        </button>
        <button onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px]
            bg-aegis-accent/10 border border-aegis-accent/25 text-aegis-accent
            text-[11px] font-semibold hover:bg-aegis-accent/15 transition-colors">
          <Plus size={12} /> {t('cron.newJob', 'New Job')}
        </button>
      </div>

      {/* ═══ 3-COLUMN MAIN ═══ */}
      {/* Fix #9: responsive via CSS class instead of inline style */}
      <div className="flex-1 grid overflow-hidden mc-grid-main">

        {/* ═══ COL 1: Gantt-style Job List ═══ */}
        <div className="border-e border-[rgb(var(--aegis-overlay)/0.06)] flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)]
            bg-aegis-bg-frosted backdrop-blur-sm sticky top-0 z-10">
            <h3 className="text-xs font-bold uppercase tracking-[1.5px] text-aegis-text-muted">
              {t('cron.scheduledJobs', 'Scheduled Jobs')}
            </h3>
            <span className="text-[10px] font-bold text-aegis-primary bg-aegis-primary/10 px-2 py-0.5 rounded-md">
              {activeCount} active
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-aegis-text-dim" />
              </div>
            ) : sortedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-[28px] mb-3">⏰</div>
                <p className="text-xs font-semibold text-aegis-text-dim">{t('cron.noJobs')}</p>
                <p className="text-[10px] text-aegis-text-dim mt-1">{t('cron.noJobsHint')}</p>
              </div>
            ) : (
              sortedJobs.map((job, idx) => {
                const color = colorMap[job.id] || dataColor(9);
                const status = getStatus(job);
                const isError = status === 'error';
                const isPaused = status === 'paused';
                const isSelected = selectedJobId === job.id;
                // Fix #5: removed dead `progress` variable (cycleProgress result was never used)

                return (
                  // Fix #4: layout animation only — no initial/animate that re-fires on poll
                  <motion.div key={job.id}
                    layout transition={{ layout: { duration: 0.15 } }}
                    onClick={() => setSelectedJobId(job.id)}
                    className={clsx(
                      'flex items-stretch gap-0 mb-1.5 rounded-[14px] overflow-hidden cursor-pointer transition-all border',
                      isSelected ? 'border-aegis-accent/20 bg-aegis-accent/[0.03]' : 'border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] hover:bg-[rgb(var(--aegis-overlay)/0.03)]',
                      isError && 'border-aegis-danger/15',
                      isPaused && 'opacity-35',
                    )}>
                    {/* Color bar */}
                    <div className="w-[4px] shrink-0 rounded-s-[14px]" style={{
                      background: isPaused ? 'rgb(var(--aegis-overlay) / 0.06)' : color,
                      ...(isError ? { animation: 'mc-err-pulse 1.5s ease-in-out infinite' } : {}),
                    }} />

                    {/* Info */}
                    <div className="flex-1 min-w-0 py-3 ps-3.5 pe-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px]">{getJobIcon(job.name || '')}</span>
                        <span className={clsx('text-[13px] font-bold truncate',
                          isError && 'text-aegis-danger/80',
                          isSelected && !isError && 'text-aegis-accent',
                          isPaused && 'text-aegis-text-muted',
                        )}>
                          {job.name || job.id.substring(0, 8)}
                        </span>
                      </div>
                      <div className="text-[10px] text-aegis-text-muted flex items-center gap-2 flex-wrap">
                        {formatSchedule(job.schedule)}
                        {isError && (
                          <span className="text-[9px] font-bold text-aegis-danger/50 bg-aegis-danger/[0.08] px-1.5 py-0.5 rounded">
                            ✗ {job.state?.lastError?.substring(0, 20) || 'error'}
                          </span>
                        )}
                        {status === 'active' && (
                          <span className="text-[9px] font-bold text-aegis-primary/50 bg-aegis-primary/[0.08] px-1.5 py-0.5 rounded">
                            ✓ {formatTimeAgo(getLastRun(job))}
                          </span>
                        )}
                        {isPaused && <span className="text-aegis-warning/50">{t('cronDetail.paused').toLowerCase()}</span>}
                        {(job.exact || job.schedule?.exact) && (
                          <span className="text-[9px] font-bold text-aegis-warning/50 bg-aegis-warning/[0.08] px-1.5 py-0.5 rounded shrink-0">
                            ⚡ {t('cron.exactTiming')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time Left */}
                    <div className="w-[100px] shrink-0 flex flex-col items-end justify-center pe-3 py-2">
                      <span className="text-[8px] text-aegis-text-dim font-medium mb-0.5">{t('cron.timeLeft', 'Time Left')}</span>
                      <span className="text-sm font-bold font-mono" style={{
                        color: isError ? tc.danger : isPaused ? 'rgb(var(--aegis-overlay) / 0.1)' : color,
                      }}>
                        {isError ? '⚠' : isPaused ? '—' : formatCountdown(getNextRun(job))}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pe-3 shrink-0">
                      {/* Toggle */}
                      <button onClick={(e) => { e.stopPropagation(); toggleJob(job.id, !job.enabled); }}
                        disabled={actionLoading === job.id}
                        className={clsx(
                          'w-8 h-[18px] rounded-full relative border transition-all shrink-0',
                          job.enabled ? 'bg-aegis-primary/25 border-aegis-primary/40' : 'bg-[rgb(var(--aegis-overlay)/0.05)] border-[rgb(var(--aegis-overlay)/0.1)]',
                        )}>
                        <div className={clsx(
                          'absolute top-[2px] w-3 h-3 rounded-full transition-all',
                          job.enabled ? 'start-[16px] bg-aegis-primary' : 'start-[2px] bg-[rgb(var(--aegis-overlay)/0.2)]',
                        )} style={job.enabled ? { boxShadow: `0 0 6px ${tc.primaryA50}` } : undefined} />
                      </button>
                      {/* Run */}
                      <button onClick={(e) => { e.stopPropagation(); runJob(job.id); }}
                        disabled={!!actionLoading || !!runResult[job.id]}
                        className={clsx(
                          'w-7 h-7 rounded-lg flex items-center justify-center border transition-all text-[11px] shrink-0',
                          runResult[job.id] === 'ok' ? 'bg-aegis-primary/10 border-aegis-primary/30 text-aegis-primary'
                          : runResult[job.id] === 'error' ? 'bg-aegis-danger/10 border-aegis-danger/30 text-aegis-danger'
                          : isError ? 'border-aegis-danger/20 text-aegis-danger/50 hover:text-aegis-danger hover:border-aegis-danger/40'
                          : 'border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim hover:text-aegis-accent hover:border-aegis-accent/30 hover:bg-aegis-accent/[0.04]',
                        )}>
                        {actionLoading === `run-${job.id}` ? <Loader2 size={11} className="animate-spin" />
                          : runResult[job.id] === 'ok' ? <Check size={11} />
                          : runResult[job.id] === 'error' ? <X size={11} />
                          : isError ? <RotateCcw size={11} />
                          : <Play size={11} fill="currentColor" />}
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ COL 2: 24h Clock Face ═══ */}
        <div className="border-e border-[rgb(var(--aegis-overlay)/0.06)] flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
            <h3 className="text-xs font-bold uppercase tracking-[1.5px] text-aegis-text-muted">
              {t('cron.schedule24h', '24h Schedule')}
            </h3>
            <span className="text-[10px] font-bold text-aegis-accent bg-aegis-accent/10 px-2 py-0.5 rounded-md">
              {t('common.live', 'Live')}
            </span>
          </div>
          {/* Clock pushed up slightly — more top padding, less bottom */}
          <div className="flex-1 flex items-start justify-center pt-4 pb-0 px-4">
            <ClockFace jobs={jobs} colorMap={colorMap} selectedId={selectedJobId} onSelect={setSelectedJobId} />
          </div>
          {/* Legend */}
          <div className="shrink-0 px-4 pb-3 flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
            {jobs.filter(j => j.enabled && scheduleAngle(j.schedule) !== null).map(job => (
              <div key={job.id}
                className={clsx('flex items-center gap-1.5 text-[9px] cursor-pointer transition-colors',
                  selectedJobId === job.id ? 'text-aegis-text-secondary' : 'text-aegis-text-dim hover:text-aegis-text-muted')}
                onClick={() => setSelectedJobId(job.id)}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap[job.id] }} />
                {(job.name || job.id).substring(0, 12)}
              </div>
            ))}
          </div>
        </div>

        {/* ═══ COL 3: Detail + Activity Log ═══ */}
        <div className="flex flex-col overflow-hidden">

          {/* Selected Job Detail */}
          <AnimatePresence mode="wait">
            {selectedJob ? (
              <motion.div key={selectedJob.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="shrink-0 p-5 border-b border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.005)]">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-[14px] flex items-center justify-center text-xl border shrink-0"
                    style={{ background: `${colorMap[selectedJob.id]}10`, borderColor: `${colorMap[selectedJob.id]}25` }}>
                    {getJobIcon(selectedJob.name || '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-extrabold truncate">{selectedJob.name || selectedJob.id}</div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-[11px] text-aegis-text-muted">{formatSchedule(selectedJob.schedule)}</span>
                      {/* Stagger badge — Gateway 2026.2.25+ */}
                      {(selectedJob.stagger || selectedJob.schedule?.stagger) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded
                          bg-aegis-accent/10 border border-aegis-accent/20 text-aegis-accent/70 shrink-0">
                          ⏱️ {t('cron.stagger')}: {selectedJob.stagger || selectedJob.schedule?.stagger}
                        </span>
                      )}
                      {/* Exact badge — Gateway 2026.2.25+ */}
                      {(selectedJob.exact || selectedJob.schedule?.exact) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded
                          bg-aegis-warning/10 border border-aegis-warning/20 text-aegis-warning/70 shrink-0">
                          ⚡ {t('cron.exactTiming')}
                        </span>
                      )}
                      {/* Auto-spread note — only for top-of-hour cron jobs without --exact */}
                      {selectedJob.schedule?.kind === 'cron' &&
                        /^0 /.test(selectedJob.schedule?.expr || '') &&
                        !selectedJob.exact && !selectedJob.schedule?.exact && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded cursor-help
                            bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)]
                            text-aegis-text-dim shrink-0"
                          title={t('cron.autoSpreadTitle')}
                        >
                          🔄 {t('cron.autoSpread')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Status badge */}
                <div className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.5px] border mb-3',
                  getStatus(selectedJob) === 'active' ? 'bg-aegis-primary/[0.08] border-aegis-primary/15 text-aegis-primary'
                  : getStatus(selectedJob) === 'error' ? 'bg-aegis-danger/[0.08] border-aegis-danger/15 text-aegis-danger'
                  : 'bg-[rgb(var(--aegis-overlay)/0.03)] border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted',
                )}>
                  <span className="w-[6px] h-[6px] rounded-full" style={{
                    background: getStatus(selectedJob) === 'active' ? tc.primary : getStatus(selectedJob) === 'error' ? tc.danger : 'rgb(var(--aegis-overlay) / 0.2)',
                  }} />
                  {getStatus(selectedJob) === 'active' ? t('cronDetail.active') : getStatus(selectedJob) === 'error' ? t('cronDetail.error') : t('cronDetail.paused')}
                  {selectedJob.sessionTarget === 'isolated' && ` · ${t('cronDetail.isolated')}`}
                </div>
                {/* Delivery status badge (Gateway 2026.2.22+) */}
                {getDeliveryStatus(selectedJob) && (
                  <div className={clsx(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.5px] border mb-3',
                    getDeliveryStatus(selectedJob) === 'delivered' ? 'bg-aegis-success/[0.08] border-aegis-success/15 text-aegis-success ms-2'
                    : getDeliveryStatus(selectedJob) === 'failed' ? 'bg-aegis-danger/[0.08] border-aegis-danger/15 text-aegis-danger ms-2'
                    : 'bg-[rgb(var(--aegis-overlay)/0.03)] border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted ms-2',
                  )}>
                    <span className="w-[6px] h-[6px] rounded-full" style={{
                      background: getDeliveryStatus(selectedJob) === 'delivered' ? tc.success : getDeliveryStatus(selectedJob) === 'failed' ? tc.danger : 'rgb(var(--aegis-overlay) / 0.2)',
                    }} />
                    {getDeliveryStatus(selectedJob) === 'delivered' ? t('cron.delivered') : getDeliveryStatus(selectedJob) === 'failed' ? t('cron.deliveryFailed') : t('cron.deliveryUnknown')}
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { v: selectedJobRuns.length || '—', l: t('cron.totalRuns', 'Total Runs'), c: tc.primary },
                    { v: formatCountdown(getNextRun(selectedJob)), l: t('cron.timeLeft', 'Time Left'), c: tc.accent },
                    { v: formatDuration(selectedJob.state?.lastDurationMs), l: t('cron.lastDur', 'Last Dur.'), c: tc.warning },
                    { v: selectedJobRuns.length > 0 ? `${Math.round(selectedJobRuns.filter(r => r.status === 'ok').length / selectedJobRuns.length * 100)}%` : '—', l: t('cron.successRate', 'Success Rate'), c: tc.success },
                  ].map(s => (
                    <div key={s.l} className="p-2.5 rounded-[10px] bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.04)]">
                      <div className="text-lg font-extrabold leading-none" style={{ color: s.c }}>{s.v}</div>
                      <div className="text-[7px] uppercase tracking-[1.5px] text-aegis-text-dim font-bold mt-1">{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Sparkline: last 14 runs */}
                {selectedJobRuns.length > 0 && (
                  <>
                    <div className="text-[9px] uppercase tracking-[1px] text-aegis-text-dim font-bold mb-1.5">
                      {t('cron.lastNRuns', 'Last {{n}} Runs').replace('{{n}}', String(selectedJobRuns.length))}
                    </div>
                    <div className="flex items-end gap-[3px] h-8 mb-3">
                      {selectedJobRuns.map((run, i) => {
                        const isOk = run.status === 'ok';
                        const maxDur = Math.max(...selectedJobRuns.map(r => r.durationMs || 1000));
                        const h = Math.max(4, ((run.durationMs || 500) / maxDur) * 100);
                        return (
                          <div key={i} className="flex-1 rounded-sm transition-all hover:opacity-80" style={{
                            height: `${h}%`,
                            background: isOk ? (colorMap[selectedJob.id] || tc.primary) : tc.danger,
                            animation: `mc-bar-grow 0.4s ease-out ${i * 0.03}s backwards`,
                          }} title={`${formatDuration(run.durationMs)} ${isOk ? '✓' : '✗'}`} />
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button onClick={() => runJob(selectedJob.id)}
                    disabled={!!actionLoading}
                    className="flex-1 py-2 rounded-[10px] text-center text-[11px] font-bold
                      bg-aegis-primary/[0.08] border border-aegis-primary/20 text-aegis-primary
                      hover:bg-aegis-primary/15 transition-colors disabled:opacity-40">
                    {actionLoading === `run-${selectedJob.id}`
                      ? <Loader2 size={12} className="animate-spin mx-auto" />
                      : runResult[selectedJob.id] === 'ok' ? t('cronDetail.done') : t('cronDetail.runNow')}
                  </button>
                  <button onClick={() => toggleJob(selectedJob.id, !selectedJob.enabled)}
                    disabled={!!actionLoading}
                    className="flex-1 py-2 rounded-[10px] text-center text-[11px] font-bold
                      bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted
                      hover:text-aegis-text-secondary transition-colors disabled:opacity-40">
                    {selectedJob.enabled ? t('cronDetail.pause') : t('cronDetail.enable')}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="shrink-0 p-5 border-b border-[rgb(var(--aegis-overlay)/0.06)] text-center">
                <div className="text-2xl mb-2">👈</div>
                <div className="text-[11px] text-aegis-text-dim">{t('cron.selectJob', 'Select a job')}</div>
              </div>
            )}
          </AnimatePresence>

          {/* Activity Log — collapsed (5 items) with Show More → scrollable */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)]
              bg-aegis-bg-frosted backdrop-blur-sm">
              <h4 className="text-[11px] font-bold uppercase tracking-[1.5px] text-aegis-text-muted">
                {selectedJob
                  ? `${selectedJob.name || selectedJob.id} — ${t('cronDetail.activityLog')}`
                  : t('cronDetail.activityLog')}
              </h4>
              {activityRuns.length > 0 && (
                <span className="text-[9px] font-mono text-aegis-text-dim bg-[rgb(var(--aegis-overlay)/0.04)] px-1.5 py-0.5 rounded">
                  {activityRuns.length}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-aegis-primary uppercase tracking-[1px]">
                <div className="w-[5px] h-[5px] rounded-full bg-aegis-primary"
                  style={{ animation: 'mc-dot-ping 2s ease-in-out infinite' }} />
                LIVE
              </div>
            </div>
            <div className={clsx('px-2 py-1', showAllLogs ? 'flex-1 overflow-y-auto' : 'overflow-hidden')}>
              {loadingRuns ? (
                <div className="flex items-center gap-2 py-4 px-3 text-[10px] text-aegis-text-dim">
                  <Loader2 size={12} className="animate-spin" /> Loading...
                </div>
              ) : activityRuns.length === 0 ? (
                <div className="text-[10px] text-aegis-text-dim py-4 px-3">{t('cron.noRunsYet', 'No runs yet')}</div>
              ) : (
                <>
                  {/* Fix #4: no motion animation on log items (they re-rendered every poll) */}
                  {/* Fix #12: more unique key with index */}
                  {(showAllLogs ? activityRuns : activityRuns.slice(0, 5)).map((run, i) => {
                    const color = colorMap[run.jobId || ''] || dataColor(9);
                    const isOk = run.status === 'ok';
                    return (
                      <div key={`${run.jobId}-${run.ts}-${run.durationMs}-${i}`}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-0.5
                          hover:bg-[rgb(var(--aegis-overlay)/0.02)] transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: isOk ? color : tc.danger }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold truncate"
                            style={!isOk ? { color: tc.dangerA70 } : undefined}>
                            {run.jobName || t('cron.job', 'Job')}
                          </div>
                          <div className="text-[9px] text-aegis-text-dim truncate"
                            style={!isOk ? { color: tc.dangerA25 } : undefined}>
                            {run.summary || run.error || (isOk ? t('cron.completed', 'Completed') : t('cron.failed', 'Failed'))}
                          </div>
                        </div>
                        <div className="text-[8px] font-mono text-aegis-text-dim px-1.5 py-0.5 rounded
                          bg-[rgb(var(--aegis-overlay)/0.02)] shrink-0"
                          style={!isOk ? { color: tc.dangerA40 } : undefined}>
                          {formatDuration(run.durationMs)}
                        </div>
                        <div className="text-[9px] text-aegis-text-dim font-mono shrink-0 w-9 text-end">
                          {run.ts ? formatTimeAgo(run.ts).replace(' ago', '') : '—'}
                        </div>
                      </div>
                    );
                  })}
                  {/* Show More / Show Less toggle */}
                  {activityRuns.length > 5 && (
                    <button onClick={() => setShowAllLogs(!showAllLogs)}
                      className="w-full py-2 mt-1 rounded-lg text-[10px] font-semibold
                        text-aegis-accent/50 hover:text-aegis-accent hover:bg-aegis-accent/[0.04] transition-colors">
                      {showAllLogs ? t('cronDetail.showLess') : t('cronDetail.showMore', { n: activityRuns.length - 5 })}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Templates Modal ═══ */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowTemplates(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-[560px] p-6 rounded-2xl border border-[rgb(var(--aegis-overlay)/0.1)] shadow-2xl"
              style={{ background: 'var(--aegis-bg-frosted)', backdropFilter: 'blur(40px)' }}>
              <h3 className="text-base font-extrabold mb-1">{t('cron.templatesTitle', 'Quick Templates')}</h3>
              <p className="text-[11px] text-aegis-text-dim mb-5">{t('cron.templatesSubtitle', 'Add a pre-configured job with one click')}</p>
              <div className="grid grid-cols-2 gap-3">
                {cronTemplates.map(tpl => {
                  const isAdded = templateResult[tpl.id] === 'ok';
                  const isFailed = templateResult[tpl.id] === 'error';
                  const isLoading = actionLoading === `tpl-${tpl.id}`;
                  return (
                    <div key={tpl.id} className="p-4 rounded-xl bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.06)]
                      hover:border-[rgb(var(--aegis-overlay)/0.12)] transition-all">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base border shrink-0"
                          style={{ background: `${dataColor(tpl.colorIdx)}10`, borderColor: `${dataColor(tpl.colorIdx)}25` }}>
                          {tpl.icon}
                        </div>
                        <div className="text-sm font-bold">{tpl.name}</div>
                      </div>
                      <div className="text-[10px] text-aegis-text-muted leading-relaxed mb-3">{tpl.desc}</div>
                      <button onClick={() => addTemplate(tpl)} disabled={isLoading || isAdded}
                        className={clsx(
                          'w-full py-2 rounded-lg text-[11px] font-semibold border transition-all',
                          isAdded ? 'bg-aegis-primary/10 border-aegis-primary/30 text-aegis-primary'
                          : isFailed ? 'bg-aegis-danger/10 border-aegis-danger/30 text-aegis-danger'
                          : 'bg-[rgb(var(--aegis-overlay)/0.03)] border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-muted hover:text-aegis-accent hover:border-aegis-accent/30',
                        )}>
                        {isLoading ? '...' : isAdded ? t('cronDetail.added') : isFailed ? t('cronDetail.addError') : t('cronDetail.add')}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setShowTemplates(false)}
                className="mt-4 w-full py-2 rounded-xl text-[11px] text-aegis-text-muted hover:text-aegis-text-secondary transition-colors">
                {t('common.close', 'Close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fix #7: keyframes moved to index.css — no more <style> recreation per render */}
    </div>
  );
}

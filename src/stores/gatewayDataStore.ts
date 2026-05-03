import { create } from 'zustand';

// ═══════════════════════════════════════════════════════════
// Gateway Data Store — Central data layer for all pages
//
// DESIGN:
//   All pages READ from this store — nobody calls gateway directly.
//   Smart polling fetches at 3 speeds:
//     Fast  (10s)  → sessions.list         (who's running now?)
//     Mid   (30s)  → agents.list + cron    (rarely change)
//     Slow  (120s) → usage.cost + sessions.usage (heavy, slow-changing)
//
//   Gateway events (session.started, etc.) update the store
//   in real-time without polling.
// ═══════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────

export interface SessionInfo {
  key: string;
  label?: string;
  model?: string;
  running?: boolean;
  totalTokens?: number;
  contextTokens?: number;
  maxTokens?: number;
  compactions?: number;
  lastActive?: string;
  kind?: string;
  [k: string]: any;
}

export interface AgentInfo {
  id: string;
  name?: string;
  model?: string;
  workspace?: string;
  [k: string]: any;
}

export interface DailyEntry {
  date: string;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  requests: number;
  [k: string]: any;
}

export interface CostSummary {
  days: number;
  daily: DailyEntry[];
  totals: {
    totalCost: number;
    inputCost: number;
    outputCost: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    requests: number;
    [k: string]: any;
  };
  updatedAt?: number;
}

export interface SessionsUsage {
  sessions?: any[];
  totals?: any;
  aggregates?: {
    byAgent?: any[];
    byModel?: any[];
    [k: string]: any;
  };
  [k: string]: any;
}

export interface CronJob {
  id: string;
  name?: string;
  schedule?: any;
  enabled?: boolean;
  lastRun?: string;
  state?: any;
  // Gateway 2026.2.22+: split run vs delivery status
  lastRunStatus?: string;
  lastDeliveryStatus?: string;
  [k: string]: any;
}

// ── Running Sub-Agent Tracking ───────────────────────────
// Detected from sessions polling (every 10s).
// Gateway WebSocket does NOT send stream:"tool" events,
// so we scan sessions.list for key "agent:<id>:subagent:<uuid>" + running=true.

export interface RunningSubAgent {
  agentId: string;
  startTime: number;
  label?: string;
  sessionKey?: string;
}

// ── Store State ──────────────────────────────────────────

interface GatewayDataState {
  // Data
  sessions: SessionInfo[];
  agents: AgentInfo[];
  costSummary: CostSummary | null;
  sessionsUsage: SessionsUsage | null;
  cronJobs: CronJob[];
  runningSubAgents: RunningSubAgent[];

  // Timestamps (ms) — when each group was last fetched
  lastFetch: {
    sessions: number;
    agents: number;
    cost: number;
    usage: number;
    cron: number;
  };

  // Loading states per group
  loading: {
    sessions: boolean;
    agents: boolean;
    cost: boolean;
    usage: boolean;
    cron: boolean;
  };

  // Error states per group
  errors: {
    sessions: string | null;
    agents: string | null;
    cost: string | null;
    usage: string | null;
    cron: string | null;
  };

  // Polling active flag
  polling: boolean;

  // ── Actions ──

  // Setters (called by polling engine or event handler)
  setSessions: (sessions: SessionInfo[]) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setCostSummary: (data: CostSummary) => void;
  setSessionsUsage: (data: SessionsUsage) => void;
  setCronJobs: (jobs: CronJob[]) => void;

  setLoading: (group: keyof GatewayDataState['loading'], val: boolean) => void;
  setError: (group: keyof GatewayDataState['errors'], err: string | null) => void;

  // Sub-agent tracking (synced from sessions polling)
  setRunningSubAgents: (list: RunningSubAgent[]) => void;

  // Mark polling active/inactive
  setPolling: (active: boolean) => void;

  // ── Derived helpers (convenience) ──
  getMainSession: () => SessionInfo | undefined;
}

// ── Store ────────────────────────────────────────────────

export const useGatewayDataStore = create<GatewayDataState>((set, get) => ({
  // Data
  sessions: [],
  agents: [],
  costSummary: null,
  sessionsUsage: null,
  cronJobs: [],
  runningSubAgents: [],

  // Timestamps
  lastFetch: { sessions: 0, agents: 0, cost: 0, usage: 0, cron: 0 },

  // Loading
  loading: { sessions: false, agents: false, cost: false, usage: false, cron: false },

  // Errors
  errors: { sessions: null, agents: null, cost: null, usage: null, cron: null },

  polling: false,

  // ── Setters ──

  setSessions: (sessions) =>
    set({
      sessions,
      lastFetch: { ...get().lastFetch, sessions: Date.now() },
      loading: { ...get().loading, sessions: false },
      errors: { ...get().errors, sessions: null },
    }),

  setAgents: (agents) =>
    set({
      agents,
      lastFetch: { ...get().lastFetch, agents: Date.now() },
      loading: { ...get().loading, agents: false },
      errors: { ...get().errors, agents: null },
    }),

  setCostSummary: (data) =>
    set({
      costSummary: data,
      lastFetch: { ...get().lastFetch, cost: Date.now() },
      loading: { ...get().loading, cost: false },
      errors: { ...get().errors, cost: null },
    }),

  setSessionsUsage: (data) =>
    set({
      sessionsUsage: data,
      lastFetch: { ...get().lastFetch, usage: Date.now() },
      loading: { ...get().loading, usage: false },
      errors: { ...get().errors, usage: null },
    }),

  setCronJobs: (jobs) =>
    set({
      cronJobs: jobs,
      lastFetch: { ...get().lastFetch, cron: Date.now() },
      loading: { ...get().loading, cron: false },
      errors: { ...get().errors, cron: null },
    }),

  setLoading: (group, val) =>
    set({ loading: { ...get().loading, [group]: val } }),

  setError: (group, err) =>
    set({ errors: { ...get().errors, [group]: err } }),

  // ── Sub-agent tracking ──

  setRunningSubAgents: (list) => set({ runningSubAgents: list }),

  setPolling: (active) => set({ polling: active }),

  // ── Derived ──

  getMainSession: () =>
    get().sessions.find((s) => s.key === 'agent:main:main'),
}));


// ═══════════════════════════════════════════════════════════
// Polling Engine — starts/stops with gateway connection
// ═══════════════════════════════════════════════════════════

// Polling intervals (ms)
const FAST_INTERVAL  = 10_000;   // 10s — sessions
const MID_INTERVAL   = 30_000;   // 30s — agents + cron
const SLOW_INTERVAL  = 120_000;  // 120s — cost + usage

let fastTimer:  ReturnType<typeof setInterval> | null = null;
let midTimer:   ReturnType<typeof setInterval> | null = null;
let slowTimer:  ReturnType<typeof setInterval> | null = null;

// Reference to gateway connection (set by startPolling)
// Uses request() directly to avoid circular imports with gateway facade
let gw: { request: (method: string, params: any) => Promise<any> } | null = null;

// ── Fetch functions ──────────────────────────────────────

async function fetchSessions() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('sessions', true);
  try {
    const res = await gw.request('sessions.list', {});
    const list = Array.isArray(res?.sessions) ? res.sessions : [];
    store.setSessions(list);
  } catch (e: any) {
    store.setError('sessions', e?.message || String(e));
    store.setLoading('sessions', false);
  }
}

async function fetchAgents() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('agents', true);
  try {
    const res = await gw.request('agents.list', {});
    const list = Array.isArray(res?.agents) ? res.agents
               : Array.isArray(res) ? res : [];
    store.setAgents(list);
  } catch (e: any) {
    store.setError('agents', e?.message || String(e));
    store.setLoading('agents', false);
  }
}

async function fetchCost() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('cost', true);
  try {
    const res = await gw.request('usage.cost', { days: 30 });
    if (res) store.setCostSummary(res);
  } catch (e: any) {
    store.setError('cost', e?.message || String(e));
    store.setLoading('cost', false);
  }
}

async function fetchUsage() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('usage', true);
  try {
    const res = await gw.request('sessions.usage', { limit: 100 });
    if (res) store.setSessionsUsage(res);
  } catch (e: any) {
    store.setError('usage', e?.message || String(e));
    store.setLoading('usage', false);
  }
}

async function fetchCron() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('cron', true);
  try {
    const res = await gw.request('cron.list', { includeDisabled: true });
    const list = Array.isArray(res?.jobs) ? res.jobs
               : Array.isArray(res) ? res : [];
    store.setCronJobs(list);
  } catch (e: any) {
    store.setError('cron', e?.message || String(e));
    store.setLoading('cron', false);
  }
}

// ── Grouped fetchers (called by timers) ─────────────────

async function tickFast() {
  await fetchSessions();
  // Detect running sub-agents from sessions data
  syncRunningSubAgents();
}

async function tickMid() {
  await Promise.allSettled([fetchAgents(), fetchCron()]);
}

async function tickSlow() {
  await Promise.allSettled([fetchCost(), fetchUsage()]);
}

// ── Public API ──────────────────────────────────────────

/**
 * Start smart polling. Call once when gateway connects.
 * @param gateway  The GatewayService instance
 */
export function startPolling(gateway: { request: (method: string, params: any) => Promise<any> }) {
  // Prevent double-start
  if (gw && useGatewayDataStore.getState().polling) return;

  gw = gateway;
  useGatewayDataStore.getState().setPolling(true);
  console.log('[DataStore] ▶ Polling started (fast=10s, mid=30s, slow=120s)');

  // Immediate initial fetch — all groups
  tickFast();
  tickMid();
  tickSlow();

  // Set up intervals
  fastTimer = setInterval(tickFast, FAST_INTERVAL);
  midTimer  = setInterval(tickMid,  MID_INTERVAL);
  slowTimer = setInterval(tickSlow, SLOW_INTERVAL);
}

/**
 * Stop polling. Call when gateway disconnects.
 */
export function stopPolling() {
  if (fastTimer)  { clearInterval(fastTimer);  fastTimer  = null; }
  if (midTimer)   { clearInterval(midTimer);   midTimer   = null; }
  if (slowTimer)  { clearInterval(slowTimer);  slowTimer  = null; }
  gw = null;
  useGatewayDataStore.getState().setPolling(false);
  console.log('[DataStore] ⏹ Polling stopped');
}

/**
 * Force refresh all data now (e.g. user clicks Refresh button).
 */
export async function refreshAll() {
  if (!gw) return;
  console.log('[DataStore] 🔄 Manual refresh — all groups');
  await Promise.allSettled([tickFast(), tickMid(), tickSlow()]);
}

/**
 * Force refresh a specific group.
 */
export async function refreshGroup(group: 'sessions' | 'agents' | 'cost' | 'usage' | 'cron') {
  if (!gw) return;
  switch (group) {
    case 'sessions': return fetchSessions();
    case 'agents':   return fetchAgents();
    case 'cost':     return fetchCost();
    case 'usage':    return fetchUsage();
    case 'cron':     return fetchCron();
  }
}

/**
 * Fetch full-year cost data (for FullAnalytics).
 * NOT part of regular polling — only called on-demand.
 */
export async function fetchFullCost(days = 365): Promise<CostSummary | null> {
  if (!gw) return null;
  try {
    return await gw.request('usage.cost', { days });
  } catch {
    return null;
  }
}

/**
 * Fetch heavy usage data on-demand (for FullAnalytics).
 */
export async function fetchFullUsage(limit = 2000): Promise<SessionsUsage | null> {
  if (!gw) return null;
  try {
    return await gw.request('sessions.usage', { limit });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Sub-Agent Detection — polling-based
// Gateway WebSocket does NOT emit stream:"tool" events,
// so we detect running sub-agents from sessions.list data.
// ═══════════════════════════════════════════════════════════

const SUB_AGENT_RE = /^agent:([^:]+):subagent:/;

/**
 * Sync runningSubAgents from sessions data.
 * Called every 10s in tickFast() after fetchSessions().
 * Sessions with key "agent:<id>:subagent:<uuid>" that appear in sessions.list
 * are running — completed sub-agent sessions are removed from the list automatically.
 * Note: sessions.list does NOT return a "running" field, so presence = active.
 */
function syncRunningSubAgents() {
  const store = useGatewayDataStore.getState();
  const sessions = store.sessions;
  const prev = store.runningSubAgents;

  // Any sub-agent session in sessions.list is active (completed ones get removed)
  const running: RunningSubAgent[] = [];
  for (const s of sessions) {
    const match = s.key?.match(SUB_AGENT_RE);
    if (!match) continue;

    const agentId = match[1];
    // Preserve startTime for already-tracked entries
    const existing = prev.find((r) => r.sessionKey === s.key);
    running.push({
      agentId,
      startTime: existing?.startTime || Date.now(),
      label: s.label || s.displayName || '',
      sessionKey: s.key,
    });
  }

  // Only update store if list actually changed
  const prevKeys = new Set(prev.map((r) => r.sessionKey));
  const newKeys = new Set(running.map((r) => r.sessionKey));
  const changed =
    prev.length !== running.length ||
    running.some((r) => !prevKeys.has(r.sessionKey)) ||
    prev.some((r) => !newKeys.has(r.sessionKey));

  if (!changed) return;

  // Log transitions
  for (const r of running) {
    if (!prevKeys.has(r.sessionKey)) {
      console.log('[DataStore] 🚀 Sub-agent detected:', r.agentId, r.label);
    }
  }
  for (const old of prev) {
    if (!newKeys.has(old.sessionKey)) {
      console.log('[DataStore] ✅ Sub-agent done:', old.agentId);
    }
  }

  store.setRunningSubAgents(running);
}

// ═══════════════════════════════════════════════════════════
// Event Handler — real-time updates from Gateway events
// ═══════════════════════════════════════════════════════════

/**
 * Handle a non-chat gateway event and update the store.
 * Call this from gateway.ts handleEvent for non-chat events.
 */
export function handleGatewayEvent(event: string, payload: any) {
  const store = useGatewayDataStore.getState();

  switch (event) {
    // ── Session events ──
    case 'session.started':
    case 'session.running': {
      const key = payload?.sessionKey || payload?.key;
      if (!key) break;
      const existing = store.sessions.find((s) => s.key === key);
      if (existing) {
        store.setSessions(
          store.sessions.map((s) => s.key === key ? { ...s, running: true } : s)
        );
      } else {
        // New session — add it
        store.setSessions([...store.sessions, { key, running: true, ...payload }]);
      }
      console.log('[DataStore] 📡 Session started:', key);
      break;
    }

    case 'session.ended':
    case 'session.stopped':
    case 'session.idle': {
      const key = payload?.sessionKey || payload?.key;
      if (!key) break;
      store.setSessions(
        store.sessions.map((s) => s.key === key ? { ...s, running: false } : s)
      );
      console.log('[DataStore] 📡 Session ended:', key);
      break;
    }

    // ── Cron events ──
    case 'cron.run.started': {
      const jobId = payload?.jobId || payload?.id;
      if (!jobId) break;
      store.setCronJobs(
        store.cronJobs.map((j) => j.id === jobId ? { ...j, state: 'running' } : j)
      );
      console.log('[DataStore] 📡 Cron started:', jobId);
      break;
    }

    case 'cron.run.completed':
    case 'cron.run.finished': {
      const jobId = payload?.jobId || payload?.id;
      if (!jobId) break;
      store.setCronJobs(
        store.cronJobs.map((j) => j.id === jobId
          ? { ...j, state: 'idle', lastRun: new Date().toISOString() }
          : j)
      );
      console.log('[DataStore] 📡 Cron completed:', jobId);
      break;
    }

    // ── Agent events ──
    case 'agent.spawned':
    case 'agent.created': {
      // Trigger a full agents refresh to get accurate data
      fetchAgents();
      console.log('[DataStore] 📡 Agent event — refreshing agents');
      break;
    }

    // ── Heartbeat / health events ──
    case 'tick':
    case 'health':
      // Expected background events from gateway; keep console clean.
      break;

    // ── Catch-all logging ──
    default:
      console.log('[DataStore] 📡 Unhandled event:', event, JSON.stringify(payload).substring(0, 200));
      break;
  }
}

// ═══════════════════════════════════════════════════════════
// useAnalyticsData — Custom hook
// Handles all state, data fetching, caching, date filtering,
// and derived computations for the FullAnalytics page.
//
// UX Contract:
//   • Page defaults to "Last 30 Days" on first visit.
//   • Clicking a preset changes the view immediately but does NOT
//     persist the selection — it's volatile.
//   • Clicking "Apply" saves the current preset to localStorage,
//     so next visit starts with that preset.
//   • "All Time" fetches 365 days + 2000 sessions.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChatStore }  from '@/stores/chatStore';
import { fetchFullCost, fetchFullUsage } from '@/stores/gatewayDataStore';

import {
  type CostSummary,
  type SessionsUsageResponse,
  type CostTotals,
  type ByAgentEntry,
  type ByModelEntry,
  type DailyEntry,
  type PresetId,
} from './types';
import { getAgentColor } from './helpers';
import { cacheGet, cacheSet, CACHE_KEY_FULL_COST, CACHE_KEY_FULL_USAGE } from './cache';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
const PRESET_STORAGE_KEY       = 'aegis:analytics:savedPreset';   // v2 — old key auto-saved without Apply
const CUSTOM_DATES_STORAGE_KEY = 'aegis:analytics:customDates';
const OLD_PRESET_KEY           = 'aegis:analytics:preset';        // Legacy — will be cleaned up on load
const STALE_THRESHOLD_MS       = 15 * 60 * 1000; // 15 minutes

const EMPTY_TOTALS: CostTotals = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
  totalTokens: 0, totalCost: 0,
  inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0,
  missingCostEntries: 0,
};

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeModelWithProvider(modelRaw?: string, providerRaw?: string): string {
  const model = firstNonEmptyString(modelRaw);
  const provider = firstNonEmptyString(providerRaw);
  if (!model && !provider) return 'unknown';
  if (!model && provider) return `${provider}/unknown`;
  if (!model) return 'unknown';
  if (model.includes('/')) return model;
  return provider ? `${provider}/${model}` : model;
}

function resolveSessionModelName(session: any): string {
  const usage = session?.usage || {};
  const metadata = session?.metadata || {};
  return normalizeModelWithProvider(
    firstNonEmptyString(
      session?.model,
      session?.modelName,
      session?.modelId,
      session?.modelSlug,
      usage?.model,
      usage?.modelName,
      usage?.modelId,
      metadata?.model,
      metadata?.modelName,
    ),
    firstNonEmptyString(
      session?.provider,
      session?.modelProvider,
      usage?.provider,
      usage?.modelProvider,
      metadata?.provider,
      metadata?.modelProvider,
    ),
  );
}

function accumulateTotals(target: CostTotals, source: Partial<CostTotals>): void {
  target.input             += source.input             || 0;
  target.output            += source.output            || 0;
  target.cacheRead         += source.cacheRead         || 0;
  target.cacheWrite        += source.cacheWrite        || 0;
  target.totalTokens       += source.totalTokens       || 0;
  target.totalCost         += source.totalCost         || 0;
  target.inputCost         += source.inputCost         || 0;
  target.outputCost        += source.outputCost        || 0;
  target.cacheReadCost     += source.cacheReadCost     || 0;
  target.cacheWriteCost    += source.cacheWriteCost    || 0;
  target.missingCostEntries += source.missingCostEntries || 0;
}

/** Map a preset to the fetch parameters (days for cost, limit for sessions) */
function getFetchParams(preset: PresetId): { days: number; limit: number } {
  switch (preset) {
    case 'all':       return { days: 365, limit: 2000 };
    case '90d':       return { days: 90,  limit: 500  };
    case 'thisMonth': return { days: 31,  limit: 200  }; // Months can have 31 days
    default:          return { days: 30,  limit: 200  };
  }
}

// ═══════════════════════════════════════════════════════════
// Public interface
// ═══════════════════════════════════════════════════════════
export interface AnalyticsData {
  // Raw / server data
  costData:  CostSummary | null;
  usageData: SessionsUsageResponse | null;

  // UI state
  loading:      boolean;
  isRefetching: boolean;
  error:        string | null;

  // Date range
  activePreset: PresetId;
  savedPreset:  PresetId;
  startDate:    string;
  endDate:      string;

  // Filtered & derived
  daily:         DailyEntry[];
  totals:        CostTotals;
  sessions:      any[];
  byAgent:       ByAgentEntry[];
  byModel:       ByModelEntry[];
  periodInfo:    { start: string; end: string; days: number };
  totalApiCalls: number;

  // Chart data
  chartData: { date: string; cost: number; input: number; output: number }[];
  donutData: {
    name:       string;
    value:      number;
    color:      string;
    tokens:     number;
    actualCost: number;
  }[];

  // Handlers
  handlePresetSelect: (id: PresetId, start: string, end: string) => void;
  handleApply:        (customStart?: string, customEnd?: string) => void;
  refresh:            () => void;
}


// ═══════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════
export function useAnalyticsData(): AnalyticsData {
  const { connected } = useChatStore();

  // ── Core data state ──
  const [costData,     setCostData]     = useState<CostSummary | null>(null);
  const [usageData,    setUsageData]    = useState<SessionsUsageResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ── Saved preference — only changes via Apply ──
  const [savedPreset, setSavedPreset] = useState<PresetId>(
    () => (localStorage.getItem(PRESET_STORAGE_KEY) as PresetId) || '30d'
  );

  // ── Current view — volatile, resets to savedPreset on mount ──
  const [activePreset, setActivePreset] = useState<PresetId>(
    () => (localStorage.getItem(PRESET_STORAGE_KEY) as PresetId) || '30d'
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate,   setEndDate]   = useState<string>('');

  // ── Cache hydration — show stale data immediately on mount ──
  const hydrateFromCache = useCallback(() => {
    const cachedCost  = cacheGet<CostSummary>(CACHE_KEY_FULL_COST);
    const cachedUsage = cacheGet<SessionsUsageResponse>(CACHE_KEY_FULL_USAGE);
    if (cachedCost?.data)  setCostData(cachedCost.data);
    if (cachedUsage?.data) setUsageData(cachedUsage.data);
    if (cachedCost?.data || cachedUsage?.data) setLoading(false);
    return !!(cachedCost?.data || cachedUsage?.data);
  }, []);

  // ── Data fetching ──
  const fetchData = useCallback(
    async (days = 30, limit = 200, showLoading = true) => {
      if (!connected) return;
      try {
        setError(null);
        if (showLoading) setLoading(true);

        const [costResult, usageResult] = await Promise.allSettled([
          fetchFullCost(days),
          fetchFullUsage(limit),
        ]);

        if (costResult.status === 'fulfilled' && costResult.value) {
          setCostData(costResult.value as unknown as CostSummary);
          cacheSet(CACHE_KEY_FULL_COST, costResult.value);
        } else if (costResult.status === 'rejected') {
          console.error('[Analytics] Cost fetch failed:', costResult.reason);
        }

        if (usageResult.status === 'fulfilled' && usageResult.value) {
          setUsageData(usageResult.value as unknown as SessionsUsageResponse);
          cacheSet(CACHE_KEY_FULL_USAGE, usageResult.value);
        } else if (usageResult.status === 'rejected') {
          console.error('[Analytics] Usage fetch failed:', usageResult.reason);
        }

        if (costResult.status === 'rejected' && usageResult.status === 'rejected') {
          throw new Error('Failed to load all analytics data');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load analytics data');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [connected]
  );

  // ── Initial load ──
  useEffect(() => {
    // Clean up legacy key that auto-saved without Apply
    localStorage.removeItem(OLD_PRESET_KEY);

    const saved = (localStorage.getItem(PRESET_STORAGE_KEY) as PresetId) || '30d';
    const savedDatesRaw = localStorage.getItem(CUSTOM_DATES_STORAGE_KEY);
    const savedDates = savedDatesRaw ? JSON.parse(savedDatesRaw) : null;

    setSavedPreset(saved);
    setActivePreset(saved);

    if (saved === 'custom' && savedDates?.start && savedDates?.end) {
      setStartDate(savedDates.start);
      setEndDate(savedDates.end);
    }

    const hasCached = hydrateFromCache();
    const cachedCost = cacheGet<CostSummary>(CACHE_KEY_FULL_COST);
    // Fixed: cache returns { data, ts }, NOT { data, timestamp }
    const isStale = !cachedCost || (Date.now() - cachedCost.ts > STALE_THRESHOLD_MS);

    if (isStale || !hasCached) {
      const { days, limit } = getFetchParams(saved);
      fetchData(days, limit, !hasCached);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preset click: change view, fetch if needed, NO save ──
  const handlePresetSelect = useCallback(
    async (id: PresetId, start: string, end: string) => {
      setActivePreset(id);
      setStartDate(start);
      setEndDate(end);

      // Fetch more data if the new preset needs a wider scope
      const requiredDays = getFetchParams(id).days;
      const currentDays  = costData?.days || 0;

      if (requiredDays > currentDays) {
        setIsRefetching(true);
        const { limit } = getFetchParams(id);
        await fetchData(requiredDays, limit, false);
        setIsRefetching(false);
      }
    },
    [costData, fetchData]
  );

  // ── Apply: save current selection to localStorage ──
  const handleApply = useCallback(
    async (customStart?: string, customEnd?: string) => {
      if (customStart && customEnd) {
        // Custom date range: apply view + save
        setActivePreset('custom');
        setStartDate(customStart);
        setEndDate(customEnd);
        localStorage.setItem(PRESET_STORAGE_KEY, 'custom');
        localStorage.setItem(
          CUSTOM_DATES_STORAGE_KEY,
          JSON.stringify({ start: customStart, end: customEnd })
        );
        setSavedPreset('custom');

        // Fetch more data if needed for the custom range
        const dayDiff = Math.ceil(
          (new Date(customEnd).getTime() - new Date(customStart).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const currentDays = costData?.days || 0;
        if (dayDiff > currentDays) {
          setIsRefetching(true);
          await fetchData(365, 2000, false);
          setIsRefetching(false);
        }
      } else {
        // Preset save (no custom dates)
        localStorage.setItem(PRESET_STORAGE_KEY, activePreset);
        localStorage.removeItem(CUSTOM_DATES_STORAGE_KEY);
        setSavedPreset(activePreset);
      }
    },
    [activePreset, costData, fetchData]
  );

  // ═══════════════════════════════════════════════════════════
  // Derived & filtered data
  // ═══════════════════════════════════════════════════════════

  const isInRange = useCallback(
    (date: string) => {
      if (!startDate && !endDate) return true;
      if (startDate && date < startDate) return false;
      if (endDate   && date > endDate)   return false;
      return true;
    },
    [startDate, endDate]
  );

  const allDaily = useMemo<DailyEntry[]>(() => costData?.daily || [], [costData]);

  const daily = useMemo<DailyEntry[]>(() => {
    if (!startDate && !endDate) return allDaily;
    return allDaily.filter((d) => isInRange(d.date));
  }, [allDaily, isInRange, startDate, endDate]);

  const totals = useMemo<CostTotals>(() => {
    // "All Time": always use server totals — they reflect whatever scope was fetched,
    // and auto-update when the 365-day refetch completes.
    if (activePreset === 'all') {
      return usageData?.totals || costData?.totals || EMPTY_TOTALS;
    }
    // For all other presets, sum from filtered daily entries
    const sum: CostTotals = { ...EMPTY_TOTALS };
    for (const d of daily) accumulateTotals(sum, d);
    return sum;
  }, [usageData, costData, daily, activePreset]);

  const allSessions = usageData?.sessions || [];
  const aggregates  = usageData?.aggregates;

  const sessions = useMemo(() => {
    if (!startDate && !endDate) return allSessions;
    return allSessions.filter((s) => {
      const updated = s.updatedAt
        ? new Date(s.updatedAt).toISOString().slice(0, 10)
        : '';
      return isInRange(updated);
    });
  }, [allSessions, isInRange, startDate, endDate]);

  const byAgent = useMemo<ByAgentEntry[]>(() => {
    if (activePreset === 'all') return aggregates?.byAgent || [];
    const map = new Map<string, CostTotals>();
    for (const s of sessions) {
      const aid      = (s as any).agentId || 'unknown';
      const existing = map.get(aid) || { ...EMPTY_TOTALS };
      accumulateTotals(existing, (s as any).usage || {});
      map.set(aid, existing);
    }
    return Array.from(map.entries()).map(([agentId, t]) => ({ agentId, totals: t }));
  }, [aggregates, sessions, activePreset]);

  const byModel = useMemo<ByModelEntry[]>(() => {
    const map = new Map<string, { count: number; totals: CostTotals }>();
    for (const s of sessions) {
      const model = resolveSessionModelName(s);
      const existing = map.get(model) || { count: 0, totals: { ...EMPTY_TOTALS } };
      existing.count++;
      accumulateTotals(existing.totals, (s as any).usage || {});
      map.set(model, existing);
    }
    return Array.from(map.entries()).map(([model, data]) => ({
      model,
      count:  data.count,
      totals: data.totals,
    }));
  }, [sessions]);

  const periodInfo = useMemo(() => {
    if (startDate && endDate) {
      const days = Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
      return { start: startDate, end: endDate, days };
    }
    const start =
      usageData?.startDate ||
      (allDaily.length > 0 ? allDaily[allDaily.length - 1]?.date : '');
    const end =
      usageData?.endDate ||
      (allDaily.length > 0 ? allDaily[0]?.date : '');
    if (!start || !end) return { start: '—', end: '—', days: 0 };
    const days = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;
    return { start, end, days };
  }, [usageData, allDaily, startDate, endDate]);

  const totalApiCalls = useMemo(
    () => byModel.reduce((sum, m) => sum + m.count, 0),
    [byModel]
  );

  const donutData = useMemo(
    () =>
      byAgent
        .filter((a) => a.totals.totalCost > 0 || a.totals.totalTokens > 0)
        .sort((a, b) => b.totals.totalCost - a.totals.totalCost)
        .map((a) => ({
          name:       a.agentId === 'main' ? 'Main Agent' : a.agentId,
          value:      Math.max(a.totals.totalCost, 0.001),
          color:      getAgentColor(a.agentId),
          tokens:     a.totals.totalTokens,
          actualCost: a.totals.totalCost,
        })),
    [byAgent]
  );

  const chartData = useMemo(
    () =>
      [...daily]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date:   d.date.slice(5), // MM-DD
          cost:   d.totalCost,
          input:  d.inputCost,
          output: d.outputCost,
        })),
    [daily]
  );

  // ═══════════════════════════════════════════════════════════
  // Return
  // ═══════════════════════════════════════════════════════════
  return {
    costData,
    usageData,
    loading,
    isRefetching,
    error,
    activePreset,
    savedPreset,
    startDate,
    endDate,
    daily,
    totals,
    sessions,
    byAgent,
    byModel,
    periodInfo,
    totalApiCalls,
    chartData,
    donutData,
    handlePresetSelect,
    handleApply,
    refresh: async () => {
      const { days, limit } = getFetchParams(activePreset);
      await fetchData(days, limit, true);
    },
  };
}

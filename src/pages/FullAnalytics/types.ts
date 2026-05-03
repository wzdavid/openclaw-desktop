// ═══════════════════════════════════════════════════════════
// FullAnalytics — TypeScript interfaces
// Mirrors OpenClaw session-cost-usage.types
// ═══════════════════════════════════════════════════════════

export interface CostTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
}

export interface DailyEntry extends CostTotals {
  date: string;
}

export interface CostSummary {
  updatedAt: number;
  days: number;
  daily: DailyEntry[];
  totals: CostTotals;
}

export interface ByModelEntry {
  provider?: string;
  model?: string;
  count: number;
  totals: CostTotals;
}

export interface ByAgentEntry {
  agentId: string;
  totals: CostTotals;
}

export interface UsageAggregates {
  messages: {
    total: number;
    user: number;
    assistant: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
  };
  tools: {
    totalCalls: number;
    uniqueTools: number;
    tools: { name: string; count: number }[];
  };
  byModel: ByModelEntry[];
  byProvider: ByModelEntry[];
  byAgent: ByAgentEntry[];
}

export interface SessionsUsageResponse {
  updatedAt: number;
  startDate: string;
  endDate: string;
  sessions: any[];
  totals: CostTotals;
  aggregates: UsageAggregates;
}

/** Quick-select preset identifiers for the Date Range Picker */
export type PresetId =
  | 'today'
  | '7d'
  | 'thisMonth'
  | '30d'
  | '90d'
  | 'all'
  | 'custom';

export interface DateRangePickerProps {
  activePreset: PresetId;
  savedPreset: PresetId;
  startDate: string;
  endDate: string;
  onPresetSelect: (id: PresetId, start: string, end: string) => void;
  onApply: (customStart?: string, customEnd?: string) => void;
}

// ═══════════════════════════════════════════════════════════
// Format Utilities — Shared formatting helpers
// ═══════════════════════════════════════════════════════════

import i18n from '@/i18n';

/** Format token counts: 1500000 → "1.5M", 45000 → "45k" */
export function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Relative time: "now"/"الآن", "5m"/"5د", "3h"/"3س", "2d"/"2ي" */
export function timeAgo(ts?: string): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return i18n.t('format.now');
  if (diff < 3600000) return i18n.t('format.minutesShort', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return i18n.t('format.hoursShort', { n: Math.floor(diff / 3600000) });
  return i18n.t('format.daysShort', { n: Math.floor(diff / 86400000) });
}

/** Estimate cost per token count (blended 40% input / 60% output) */
const MODEL_RATES: Record<string, number> = {
  'opus': 45,
  'sonnet': 9,
  'haiku': 2.4,
  'gemini': 3,
  'flash': 0.2,
};

export function estimateCost(tokens: number, model?: string): number {
  const m = (model || '').toLowerCase();
  const rate = Object.entries(MODEL_RATES).find(([k]) => m.includes(k))?.[1] || 9;
  return (tokens / 1000000) * rate;
}

/** Format cron schedule object to human-readable string */
export function formatSchedule(schedule: any): string {
  if (!schedule) return '—';
  if (schedule.kind === 'cron') return schedule.expr || '—';
  if (schedule.kind === 'every') return `Every ${Math.round((schedule.everyMs || 0) / 60000)}min`;
  if (schedule.kind === 'at') return new Date(schedule.at).toLocaleString();
  return JSON.stringify(schedule);
}

/** Format uptime: "3h 12m"/"3س 12م" */
export function formatUptime(ms: number): string {
  if (ms < 60000) return i18n.t('format.lessThanMinute');
  if (ms < 3600000) return i18n.t('format.uptimeMinutes', { n: Math.floor(ms / 60000) });
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return m > 0 ? i18n.t('format.uptimeHoursMinutes', { h, m }) : i18n.t('format.uptimeHoursOnly', { h });
}

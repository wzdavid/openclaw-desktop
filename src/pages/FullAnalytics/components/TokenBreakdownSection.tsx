// ═══════════════════════════════════════════════════════════
// TokenBreakdownSection — Stacked cost bar + 2×2 detail cards
// Shows input / output / cache-read / cache-write breakdown
// ═══════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/shared/GlassCard';
import { type CostTotals } from '../types';
import { formatTokens, formatUsd } from '../helpers';
import { dataColor } from '@/utils/theme-colors';

interface TokenBreakdownSectionProps {
  totals: CostTotals;
}

export function TokenBreakdownSection({ totals }: TokenBreakdownSectionProps) {
  const { t } = useTranslation();
  const totalCost   = totals.totalCost   || 1;
  const totalTokens = totals.totalTokens || 1;

  const segments = [
    {
      label:  t('analytics.inputTokens',  'Input Tokens'),
      tokens: totals.input,
      cost:   totals.inputCost,
      color:  dataColor(1),
      icon:   '📥',
    },
    {
      label:  t('analytics.outputTokens', 'Output Tokens'),
      tokens: totals.output,
      cost:   totals.outputCost,
      color:  dataColor(0),
      icon:   '📤',
    },
    {
      label:  t('analytics.cacheRead',  'Cache Read'),
      tokens: totals.cacheRead,
      cost:   totals.cacheReadCost,
      color:  dataColor(5),
      icon:   '🔄',
    },
    {
      label:  t('analytics.cacheWrite', 'Cache Write'),
      tokens: totals.cacheWrite,
      cost:   totals.cacheWriteCost,
      color:  dataColor(2),
      icon:   '💾',
    },
  ].filter((s) => s.tokens > 0 || s.cost > 0);

  if (segments.length === 0) return null;

  return (
    <GlassCard delay={0.1}>
      <div className="flex items-center gap-2 mb-4">
        <Database size={14} className="text-aegis-success" />
        <span className="text-[10px] text-aegis-text-dim uppercase tracking-widest font-bold">
          {t('analytics.tokenBreakdown', 'Token Breakdown')}
        </span>
      </div>

      {/* Stacked bar by cost percentage */}
      <div className="w-full h-4 rounded-full bg-[rgb(var(--aegis-overlay)/0.04)] overflow-hidden flex mb-4">
        {segments
          .filter((s) => s.cost > 0)
          .map((seg) => (
            <motion.div
              key={seg.label}
              initial={{ width: 0 }}
              animate={{ width: `${(seg.cost / totalCost) * 100}%` }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="h-full first:rounded-s-full last:rounded-e-full"
              style={{ background: seg.color }}
            />
          ))}
      </div>

      {/* Grid: 2×2 detail cards */}
      <div className="grid grid-cols-2 gap-3">
        {segments.map((seg) => {
          const costPct  = totalCost   > 0 ? (seg.cost   / totalCost)   * 100 : 0;
          const tokenPct = totalTokens > 0 ? (seg.tokens / totalTokens) * 100 : 0;
          return (
            <div
              key={seg.label}
              className="rounded-xl border p-3"
              style={{ background: `${seg.color}06`, borderColor: `${seg.color}18` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{seg.icon}</span>
                <span className="text-[11px] font-bold" style={{ color: seg.color }}>{seg.label}</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-aegis-text-muted">{t('analytics.tokens', 'Tokens')}</span>
                  <span className="font-mono font-bold text-aegis-text-secondary">{formatTokens(seg.tokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-aegis-text-muted">{t('analytics.cost', 'Cost')}</span>
                  <span className="font-mono font-bold" style={{ color: seg.color }}>{formatUsd(seg.cost)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-aegis-text-dim">{t('analytics.ofTotal', '% of total')}</span>
                  <span className="text-aegis-text-muted font-mono">
                    {costPct.toFixed(1)}% cost · {tokenPct.toFixed(1)}% tokens
                  </span>
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="w-full h-1 rounded-full bg-[rgb(var(--aegis-overlay)/0.04)] mt-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${costPct}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full"
                  style={{ background: seg.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total summary row */}
      <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)] text-[11px]">
        <span className="text-aegis-text-muted font-bold">{t('analytics.total', 'Total')}</span>
        <span className="font-mono font-bold text-aegis-text-secondary">{formatTokens(totals.totalTokens)}</span>
        <span className="text-aegis-text-dim">→</span>
        <span className="font-mono font-black text-aegis-text">{formatUsd(totals.totalCost)}</span>
      </div>

      {/* Cache savings callout */}
      {totals.cacheRead > 0 && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-aegis-success/[0.04] border border-aegis-success/10 text-[11px] text-aegis-success/70">
          <Database size={13} className="shrink-0" />
          {t('analytics.cacheSavings', 'Cache read')}{' '}
          <strong className="font-mono mx-1">{formatTokens(totals.cacheRead)}</strong>
          {t('analytics.cacheAtReduced', 'tokens at reduced rate — significant savings!')}
        </div>
      )}
    </GlassCard>
  );
}

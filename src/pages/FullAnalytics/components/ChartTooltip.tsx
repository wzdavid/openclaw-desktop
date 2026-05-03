// ═══════════════════════════════════════════════════════════
// ChartTooltip — Shared Recharts tooltip for cost/token charts
// ═══════════════════════════════════════════════════════════

import { formatTokens, formatUsd } from '../helpers';

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

export const ChartTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="border border-[rgb(var(--aegis-overlay)/0.1)] rounded-xl px-3 py-2 text-[11px]"
      style={{
        background: 'var(--aegis-bg-frosted)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgb(var(--aegis-overlay) / 0.15)',
      }}
    >
      <div className="text-aegis-text-muted mb-1 font-mono">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-aegis-text-muted">{p.name}:</span>
          <span className="text-aegis-text font-mono font-bold">
            {p.name.toLowerCase().includes('token')
              ? formatTokens(p.value)
              : formatUsd(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

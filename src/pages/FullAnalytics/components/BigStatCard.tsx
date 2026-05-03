// ═══════════════════════════════════════════════════════════
// BigStatCard — Large KPI card used in the 5-column overview row
// ═══════════════════════════════════════════════════════════

import { type ComponentType } from 'react';
import { GlassCard } from '@/components/shared/GlassCard';
import { AnimCounter } from './AnimCounter';

interface BigStatCardProps {
  /** Lucide icon component (alternative to iconEmoji) */
  icon?: ComponentType<{ size: number; style: React.CSSProperties }>;
  /** Emoji icon (takes precedence over icon) */
  iconEmoji?: string;
  value: number | string;
  label: string;
  color: string;
  sub?: string;
  sub2?: string;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function BigStatCard({
  icon: Icon,
  iconEmoji,
  value,
  label,
  color,
  sub,
  sub2,
  delay = 0,
  prefix = '',
  suffix = '',
  decimals = 2,
}: BigStatCardProps) {
  return (
    <GlassCard delay={delay} hover>
      <div className="relative overflow-hidden text-center py-2">
        {/* Top accent line */}
        <div
          className="absolute top-0 inset-x-0 h-[2px] opacity-50"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />

        {/* Icon */}
        <div className="mb-2 flex justify-center">
          {iconEmoji ? (
            <span className="text-xl">{iconEmoji}</span>
          ) : Icon ? (
            <Icon size={18} style={{ color }} />
          ) : null}
        </div>

        <AnimCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} color={color} />
        <div className="text-[10px] text-aegis-text-dim uppercase tracking-wider mt-1">{label}</div>
        {sub  && <div className="text-[9px] text-aegis-text-dim mt-0.5 truncate px-1">{sub}</div>}
        {sub2 && <div className="text-[9px] text-aegis-text-dim mt-0.5 truncate px-1">{sub2}</div>}
      </div>
    </GlassCard>
  );
}

import { useMemo } from 'react';
import clsx from 'clsx';
import { themeHex } from '@/utils/theme-colors';

interface ProgressRingProps {
  /** 0–100 */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  /** Override auto-color (auto: >85 danger, >60 warning, else primary) */
  color?: string;
  /** Small label below the percentage text */
  label?: string;
  className?: string;
}

/** Threshold-based auto-coloring — reads theme at call time */
function getAutoColor(pct: number): string {
  if (pct > 85) return themeHex('danger');
  if (pct > 60) return themeHex('warning');
  return themeHex('primary');
}

/**
 * ProgressRing — circular SVG progress indicator.
 * Background track + animated foreground arc + centered text.
 */
export function ProgressRing({
  percentage,
  size = 64,
  strokeWidth = 4,
  color,
  label,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const resolvedColor = color ?? getAutoColor(clamped);

  const { radius, circumference, offset } = useMemo(() => {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const o = c - (clamped / 100) * c;
    return { radius: r, circumference: c, offset: o };
  }, [size, strokeWidth, clamped]);

  const center = size / 2;

  return (
    <div className={clsx('relative inline-flex flex-col items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--aegis-border)"
          strokeWidth={strokeWidth}
        />

        {/* Foreground arc glow (conceptual: rings have subtle glow) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          opacity={0.12}
          style={{
            transition: 'stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)',
            filter: `blur(3px)`,
          }}
        />

        {/* Foreground arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s',
          }}
        />
      </svg>

      {/* Centered text overlay */}
      <div
        className="absolute flex flex-col items-center justify-center pointer-events-none"
        style={{ width: size, height: size }}
      >
        <span
          className="font-bold text-aegis-text"
          style={{ fontSize: size * 0.22 }}
        >
          {Math.round(clamped)}%
        </span>
        {label && (
          <span
            className="text-aegis-text-dim leading-none mt-0.5"
            style={{ fontSize: Math.max(9, size * 0.15) }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

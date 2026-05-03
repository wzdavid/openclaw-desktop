import { useMemo } from 'react';
import clsx from 'clsx';

interface SparklineProps {
  data: number[];
  color?: string;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Sparkline — minimal SVG mini chart.
 * Renders a polyline with gradient fill and an endpoint dot.
 * No axes or labels — just the trend line.
 */
export function Sparkline({
  data,
  color = 'rgb(var(--aegis-primary))',
  className,
  width = 120,
  height = 32,
}: SparklineProps) {
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);

  const points = useMemo(() => {
    if (!data.length) return { line: '', fill: '', last: null as null | { x: number; y: number } };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padY = 4; // vertical padding for dot
    const usableH = height - padY * 2;

    const pts = data.map((v, i) => ({
      x: data.length === 1 ? width / 2 : (i / (data.length - 1)) * width,
      y: padY + usableH - ((v - min) / range) * usableH,
    }));

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Closed path for gradient fill (line + bottom edge)
    const fill = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;

    return { line, fill, last: pts[pts.length - 1] };
  }, [data, width, height]);

  if (!data.length) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={clsx('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gradient fill area */}
      <path d={points.fill} fill={`url(#${id})`} />

      {/* Trend line */}
      <path
        d={points.line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Endpoint dot — pulsing glow (conceptual design) */}
      {points.last && (
        <>
          {/* Glow halo behind dot */}
          <circle
            cx={points.last.x}
            cy={points.last.y}
            r={6}
            fill={color}
            opacity={0.15}
            className="spark-dot-pulse"
          />
          {/* Solid dot */}
          <circle
            cx={points.last.x}
            cy={points.last.y}
            r={2.5}
            fill={color}
          />
        </>
      )}
    </svg>
  );
}

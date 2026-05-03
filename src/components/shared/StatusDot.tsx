import clsx from 'clsx';

type DotStatus = 'active' | 'idle' | 'sleeping' | 'error' | 'paused';

interface StatusDotProps {
  status: DotStatus;
  size?: number;
  pulse?: boolean;
  glow?: boolean;
  /** Show radiating beacon ring (conceptual design) */
  beacon?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<DotStatus, string> = {
  active: 'bg-aegis-success',     // #3fb950
  idle: 'bg-aegis-warning',       // #E8B84E
  sleeping: 'bg-[#424242]',       // gray
  error: 'bg-aegis-danger',       // #F47067
  paused: 'bg-aegis-danger',      // #F47067
};

const GLOW_CLASSES: Record<string, string> = {
  active: 'status-glow-green',
  error: 'status-glow-red',
};

const PULSE_STATUSES: DotStatus[] = ['active'];

/**
 * StatusDot — colored indicator with glow + pulse + beacon animation.
 * Active dots glow and pulse like blinking lights (conceptual design).
 */
export function StatusDot({
  status,
  size = 8,
  pulse,
  glow = true,
  beacon = false,
  className,
}: StatusDotProps) {
  const shouldPulse = pulse ?? PULSE_STATUSES.includes(status);
  const shouldGlow = glow && (status === 'active' || status === 'error');
  const glowClass = shouldGlow ? GLOW_CLASSES[status] || '' : '';
  const shouldBeacon = beacon && status === 'active';

  return (
    <span
      className={clsx(
        'inline-block rounded-full shrink-0 relative',
        STATUS_COLORS[status],
        shouldPulse && 'animate-glow-green',
        glowClass,
        shouldBeacon && 'dot-beacon',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={status}
    />
  );
}

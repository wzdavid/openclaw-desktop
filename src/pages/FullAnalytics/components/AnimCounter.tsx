// ═══════════════════════════════════════════════════════════
// AnimCounter — Animated number display with fade-in
// ═══════════════════════════════════════════════════════════

import { motion } from 'framer-motion';

interface AnimCounterProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color: string;
}

export function AnimCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  color,
}: AnimCounterProps) {
  const display =
    typeof value === 'number'
      ? decimals > 0
        ? value.toFixed(decimals)
        : value.toLocaleString()
      : value;

  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="text-[28px] font-black font-mono tracking-tight leading-none"
      style={{ color }}
    >
      {prefix}{display}{suffix}
    </motion.span>
  );
}

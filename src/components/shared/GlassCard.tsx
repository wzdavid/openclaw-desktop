// ═══════════════════════════════════════════════════════════
// GlassCard — Transparent glass panel with hover lift
// + Shimmer edge light streak (conceptual design)
// ═══════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import clsx from 'clsx';
import React, { type ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  noPad?: boolean;
  /** Enable shimmer light streak on top edge (conceptual design) */
  shimmer?: boolean;
  onClick?: () => void;
}

export const GlassCard = React.memo(function GlassCard({
  children,
  className = '',
  hover = true,
  delay = 0,
  noPad = false,
  shimmer = true,
  onClick,
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } } : undefined}
      onClick={onClick}
      className={clsx(
        'relative overflow-hidden rounded-2xl',
        'border border-aegis-border',
        'bg-aegis-card',
        'backdrop-blur-xl',
        'hover:border-aegis-border-hover',
        'hover:bg-aegis-glass-hover',
        'transition-all duration-300',
        onClick && 'cursor-pointer',
        shimmer && 'card-shimmer-edge',
        className
      )}
    >
      {/* Top light edge — subtle glass reflection */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className={noPad ? undefined : 'p-5'}>
        {children}
      </div>
    </motion.div>
  );
});

// ═══════════════════════════════════════════════════════════
// PageTransition — CSS-only enter animation (no framer-motion)
// exit removed: AnimatePresence was removed from AppLayout
// ═══════════════════════════════════════════════════════════

import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  return (
    <div className={`animate-slide-up ${className}`}>
      {children}
    </div>
  );
}

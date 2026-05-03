// ═══════════════════════════════════════════════════════════
// QuickReplyBar — Render AI-suggested quick reply buttons
//
// Displayed above the message input when the last AI message
// contains [[button:...]] markers. Clicking sends the button
// text as a user message.
//
// Buttons auto-dismiss after one click or when a new message
// arrives. Visually similar to InlineButtonBar but positioned
// as a floating bar (like ClarifyCard was).
// ═══════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import type { ParsedButton } from '@/utils/buttonParser';

interface QuickReplyBarProps {
  buttons: ParsedButton[];
  onSend: (text: string) => void;
  onDismiss: () => void;
}

export function QuickReplyBar({ buttons, onSend, onDismiss }: QuickReplyBarProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = useCallback((btn: ParsedButton) => {
    if (clicked) return; // Prevent double-click
    setClicked(btn.value);
    onSend(btn.value);
  }, [clicked, onSend]);

  if (!buttons.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mx-4 mb-2"
      >
        <div className={clsx(
          'relative rounded-xl border px-4 py-3',
          'bg-[rgb(var(--aegis-bg-secondary))] border-[rgb(var(--aegis-overlay)/0.10)]',
          'shadow-lg shadow-black/10'
        )}>
          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className={clsx(
              'absolute top-2 end-2 p-1 rounded-lg transition-colors',
              'text-aegis-text-dim hover:text-aegis-text-secondary',
              'hover:bg-[rgb(var(--aegis-overlay)/0.08)]'
            )}
          >
            <X size={14} />
          </button>

          {/* Buttons row */}
          <div className="flex flex-wrap gap-2 pe-6">
            {buttons.map((btn, idx) => {
              const isClicked = clicked === btn.value;
              const isDisabled = clicked !== null;

              return (
                <motion.button
                  key={idx}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleClick(btn)}
                  disabled={isDisabled}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-[13px] font-medium border transition-all duration-200',
                    isClicked
                      ? 'bg-aegis-accent/20 border-aegis-accent/40 text-aegis-accent ring-2 ring-aegis-accent/20'
                      : isDisabled
                        ? 'opacity-35 cursor-not-allowed bg-[rgb(var(--aegis-overlay)/0.04)] border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-dim'
                        : clsx(
                          'bg-[rgb(var(--aegis-overlay)/0.05)] border-[rgb(var(--aegis-overlay)/0.12)]',
                          'text-aegis-text-secondary',
                          'hover:bg-aegis-accent/10 hover:border-aegis-accent/25 hover:text-aegis-accent',
                          'active:bg-aegis-accent/15'
                        )
                  )}
                >
                  {btn.text}
                  {isClicked && (
                    <span className="ms-1.5 text-[11px] opacity-60">✓</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

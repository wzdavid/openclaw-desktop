// ═══════════════════════════════════════════════════════════
// ToastContainer — In-app toast notification popups
// Replaces OS/Electron notifications for Windows reliability
// Position: bottom-end (bottom-right LTR / bottom-left RTL)
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore, type Toast, type NotificationType } from '@/stores/notificationStore';
import { themeHex, themeAlpha } from '@/utils/theme-colors';
import { timeAgo } from '@/utils/format';

// ── Icon + tint config per notification type ──────────────
const TYPE_CONFIG: Record<NotificationType, { Icon: React.ElementType; colorKey: 'primary' | 'success' | 'accent' }> = {
  message:       { Icon: MessageSquare, colorKey: 'primary' },
  task_complete: { Icon: CheckCircle2,  colorKey: 'success' },
  info:          { Icon: Info,          colorKey: 'accent'  },
};

// ── Detect current layout direction ───────────────────────
function isRTL(): boolean {
  return document.documentElement.dir === 'rtl';
}

// ── Single toast item ─────────────────────────────────────
function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useNotificationStore();
  const { t } = useTranslation();
  const rtl = isRTL();

  // Auto-expire: only count down while window is focused.
  // Pauses when minimized/background, resumes with fresh 5s on focus.
  const TOAST_DURATION = 5000;
  const [remainingMs, setRemainingMs] = useState(() =>
    document.hasFocus() ? Math.max(0, toast.expiresAt - Date.now()) : TOAST_DURATION
  );
  const startRef = useRef<number>(document.hasFocus() ? Date.now() : 0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const startCountdown = (ms: number) => {
      startRef.current = Date.now();
      timer = setTimeout(() => removeToast(toast.id), ms);
    };

    const onFocus = () => {
      // Window gained focus — start (or restart) the countdown
      startCountdown(remainingMs > 0 ? remainingMs : TOAST_DURATION);
    };

    const onBlur = () => {
      // Window lost focus — pause the countdown, save remaining time
      clearTimeout(timer);
      const elapsed = Date.now() - startRef.current;
      setRemainingMs((prev) => Math.max(0, prev - elapsed));
    };

    // Start immediately if window is already focused
    if (document.hasFocus()) {
      startCountdown(remainingMs);
    }

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [toast.id, removeToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = TYPE_CONFIG[toast.type] ?? TYPE_CONFIG.info;
  const { Icon, colorKey } = cfg;

  // Navigate to chat page on click (works outside React Router context too)
  const handleClick = () => {
    removeToast(toast.id);
    window.location.hash = '#/chat';
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeToast(toast.id);
  };

  return (
    <motion.div
      layout
      key={toast.id}
      // Slide in from the end side, fade out on exit
      initial={{ opacity: 0, x: rtl ? -60 : 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: rtl ? -60 : 60, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
      onClick={handleClick}
      role="alert"
      aria-live="polite"
      style={{
        // Glass card — dark frosted glass, theme-aware
        width: 320,
        background: 'var(--aegis-bg-frosted)',
        border: `1px solid ${themeAlpha('primary', 0.25)}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 ${themeAlpha('primary', 0.08)}`,
      }}
      className="
        relative flex items-start gap-3 rounded-xl p-4
        backdrop-blur-xl shadow-2xl cursor-pointer select-none
        hover:brightness-110 transition-[filter] duration-150
      "
    >
      {/* Icon */}
      <div
        className="mt-0.5 shrink-0 rounded-lg p-1.5"
        style={{ background: themeAlpha(colorKey, 0.12) }}
      >
        <Icon
          size={16}
          style={{ color: themeHex(colorKey) }}
        />
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-aegis-text leading-tight truncate">
          {toast.title}
        </div>
        {toast.body && (
          <div className="text-[11px] text-aegis-text-dim mt-0.5 line-clamp-2 leading-snug">
            {toast.body.length > 100 ? `${toast.body.slice(0, 100)}…` : toast.body}
          </div>
        )}
        <div className="text-[10px] text-aegis-text-dim/50 mt-1">
          {timeAgo(toast.timestamp)}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label={t('toast.dismiss', 'Dismiss')}
        className="
          shrink-0 p-1 rounded-lg
          text-aegis-text-dim hover:text-aegis-text
          hover:bg-[rgb(var(--aegis-overlay)/0.08)]
          transition-colors duration-100
        "
      >
        <X size={12} />
      </button>

      {/* Bottom progress bar — drains while window is focused, pauses on blur */}
      <ProgressBar colorKey={colorKey} durationMs={remainingMs} rtl={rtl} />
    </motion.div>
  );
}

// ── Progress bar — pauses when window loses focus ─────────
function ProgressBar({ colorKey, durationMs, rtl }: { colorKey: string; durationMs: number; rtl: boolean }) {
  const [paused, setPaused] = useState(!document.hasFocus());

  useEffect(() => {
    const onFocus = () => setPaused(false);
    const onBlur = () => setPaused(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <motion.div
      className="absolute bottom-0 start-0 h-[2px] rounded-b-xl"
      initial={{ scaleX: 1 }}
      animate={{ scaleX: paused ? undefined : 0 }}
      transition={paused ? undefined : {
        duration: Math.max(0, durationMs) / 1000,
        ease: 'linear',
      }}
      style={{
        background: themeAlpha(colorKey, 0.5),
        transformOrigin: rtl ? 'right' : 'left',
      }}
    />
  );
}

// ── Container — always rendered at the root ───────────────
export function ToastContainer() {
  const { toasts } = useNotificationStore();

  // Show at most 3 (store enforces it but guard here too)
  const visible = toasts.slice(-3);

  return (
    <div
      // bottom-4 + end-4 → logical properties, RTL-aware
      className="fixed bottom-4 end-4 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync">
        {visible.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

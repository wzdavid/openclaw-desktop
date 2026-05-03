import { create } from 'zustand';

// ═══════════════════════════════════════════════════════════
// Notification Store — Ephemeral in-app toast popups only
// No history panel, no read/unread tracking, no bell icon
// ═══════════════════════════════════════════════════════════

export type NotificationType = 'message' | 'task_complete' | 'info';

export interface Toast {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  /** Unix timestamp (ms) when this toast should auto-expire */
  expiresAt: number;
}

interface NotificationState {
  /** Ephemeral live toasts — max 3, FIFO, auto-expire after 5 s */
  toasts: Toast[];
  /** Push a new toast. Keeps at most 3 (oldest removed when full). */
  addToast: (type: NotificationType, title: string, body: string) => void;
  /** Remove a toast by id (called on dismiss or auto-expire). */
  removeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],

  addToast: (type, title, body) => set((state) => {
    const toast: Toast = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      body,
      timestamp: new Date().toISOString(),
      expiresAt: Date.now() + 5000,
    };
    // Keep max 3 toasts — drop the oldest if at capacity (FIFO)
    const current = state.toasts.length >= 3
      ? state.toasts.slice(-(3 - 1))
      : state.toasts;
    return { toasts: [...current, toast] };
  }),

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}));

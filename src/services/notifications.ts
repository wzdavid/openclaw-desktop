// ═══════════════════════════════════════════════════════════
// Notification Service — Sound + visual toast notifications
// No OS notifications, no Electron IPC, no Web Notification API
// ═══════════════════════════════════════════════════════════

import { useNotificationStore, type NotificationType } from '@/stores/notificationStore';

export interface NotifyOptions {
  type: NotificationType;
  title: string;
  body: string;
}

class NotificationService {
  private _enabled = true;
  private _soundEnabled = true;
  private _dndMode = false;
  private permissionRequested = false;

  private audioCtx: AudioContext | null = null;

  // ── Getters / setters ────────────────────────────────────
  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; }

  get soundEnabled(): boolean { return this._soundEnabled; }
  set soundEnabled(v: boolean) { this._soundEnabled = v; }

  get dndMode(): boolean { return this._dndMode; }
  set dndMode(v: boolean) { this._dndMode = v; }

  // Compat helpers (called from SettingsPage)
  setEnabled(v: boolean) { this._enabled = v; }
  setSoundEnabled(v: boolean) { this._soundEnabled = v; }
  setDndMode(v: boolean) { this._dndMode = v; }

  // ── Sound ────────────────────────────────────────────────

  /** Play a pleasant two-tone chime (C5 → E5) via Web Audio API. */
  playChime(): void {
    if (!this._soundEnabled || this._dndMode) return;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // C5 = 523.25 Hz, E5 = 659.25 Hz
      const notes = [523.25, 659.25];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.4);
      });
    } catch {
      // Silent fallback — AudioContext may be unavailable
    }
  }

  // ── Core notify ──────────────────────────────────────────

  /**
   * Play chime and show visual notification.
   * - Window focused → in-app toast (rendered in React)
   * - Window NOT focused (minimized/background) → Web Notification API
   *   (Chromium throttles React renders when page is hidden, so toasts won't appear.
   *    Web Notification API works from the renderer — same approach as v4.0 which worked reliably.)
   * Both gates respect `enabled` and `dndMode`.
   */
  notify(options: NotifyOptions): void {
    if (!this._enabled || this._dndMode) return;
    this.playChime();

    if (document.hasFocus()) {
      // Window visible — in-app toast works fine
      useNotificationStore.getState().addToast(options.type, options.title, options.body);
    } else {
      // Window minimized/background — try both methods for maximum reliability:
      // 1. Web Notification API (worked in v4 dev mode)
      // 2. Electron IPC fallback (works in production where file:// may block Web API)
      this.showOSNotification(options.title, options.body);
    }
  }

  /**
   * Show OS notification — tries Web API first, falls back to Electron IPC.
   * Belt-and-suspenders: dev mode uses Web API (http://localhost),
   * production may need IPC (file:// origin can block Web Notifications).
   */
  private showOSNotification(title: string, body: string): void {
    // Method 1: Electron IPC → Main Process Notification (no permission needed, instant)
    const hasIPC = !!(window as any).aegis?.notify;
    if (hasIPC) {
      try {
        (window as any).aegis.notify(title, body);
        console.log('[Notify] IPC — sent');
        return;
      } catch (err) {
        console.warn('[Notify] IPC failed:', err);
      }
    }

    // Method 2: Web Notification API fallback (dev mode where IPC may not exist)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, silent: true });
        console.log('[Notify] Web API — shown');
      } else {
        console.log('[Notify] Web API — permission:', 'Notification' in window ? Notification.permission : 'unavailable');
      }
    } catch (err) {
      console.warn('[Notify] Web API failed:', err);
    }
  }

  /** Request Web Notification permission (call once at app startup). */
  requestPermission(): void {
    if (this.permissionRequested) return;
    this.permissionRequested = true;
    try {
      if ('Notification' in window) {
        console.log('[Notify] Current permission:', Notification.permission);
        if (Notification.permission === 'default') {
          Notification.requestPermission().then((result) => {
            console.log('[Notify] Permission result:', result);
          });
        }
      }
    } catch {
      // Silent — may not be available
    }
  }

  // ── Conditional helpers ──────────────────────────────────

  /** Returns true if the app window currently has focus. */
  isWindowFocused(): boolean {
    return document.hasFocus();
  }

  /** Notify only when the window IS focused (user is inside the app but not on chat). */
  notifyIfVisible(options: NotifyOptions): void {
    if (this.isWindowFocused()) {
      this.notify(options);
    }
  }

  /** Notify only when the window is NOT focused (user has Alt+Tabbed away). */
  notifyIfBackground(options: NotifyOptions): void {
    if (!this.isWindowFocused()) {
      this.notify(options);
    }
  }
}

export const notifications = new NotificationService();

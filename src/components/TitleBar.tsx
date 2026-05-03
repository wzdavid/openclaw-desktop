import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { APP_VERSION } from '@/hooks/useAppVersion';
import { Power, RefreshCw, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

// ═══════════════════════════════════════════════════════════
// Title Bar — Glass Pills window controls + OpenClaw Desktop branding
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// showUpdateToast — Simple toast helper for update events
// ═══════════════════════════════════════════════════════════

// Simple toast helper — uses the ToastContainer's global store if available,
// otherwise falls back to a simple DOM notification
function showUpdateToast(title: string, message: string, variant: 'info' | 'success' | 'warning' = 'info') {
  // Try global toast API
  if (typeof window !== 'undefined' && (window as any).__aegisToast) {
    (window as any).__aegisToast({ title, message, variant });
    return;
  }
  // Fallback: Electron notification
  if (window.aegis?.notify) {
    window.aegis.notify(title, message);
  }
}

// ═══════════════════════════════════════════════════════════
// useAutoUpdate — Tracks electron-updater state
// ═══════════════════════════════════════════════════════════

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

function useAutoUpdate() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState(0);

  useEffect(() => {
    const api = window.aegis?.update;
    if (!api) return;

    const unsubs = [
      api.onAvailable((info) => {
        setUpdateVersion(info.version ?? null);
        setStatus('available');
        showUpdateToast(
          '🔄 Update Available',
          `Version ${info.version} is ready to download`,
          'info'
        );
      }),
      api.onUpToDate(() => setStatus('idle')),
      api.onProgress((p) => {
        setDownloadPercent(Math.round(p.percent ?? 0));
        setStatus('downloading');
      }),
      api.onDownloaded(() => {
        setStatus('ready');
        showUpdateToast(
          '✅ Update Ready',
          'Restart to apply the update',
          'success'
        );
      }),
      api.onError(() => {
        setStatus('error');
        showUpdateToast(
          '⚠️ Update Error',
          'Failed to check for updates',
          'warning'
        );
      }),
    ];

    return () => unsubs.forEach(fn => fn());
  }, []);

  const check = async () => {
    const api = window.aegis?.update;
    if (!api) return;
    setStatus('checking');
    try {
      await api.check();
    } catch {
      setStatus('error');
    }
  };

  const download = async () => {
    const api = window.aegis?.update;
    if (!api) return;
    try {
      await api.download();
    } catch {
      setStatus('error');
    }
  };

  const install = () => window.aegis?.update.install();

  return { status, updateVersion, downloadPercent, check, download, install };
}

// ── VersionBadge — Colored pill showing version + update state ────────────
function VersionBadge() {
  const { status, updateVersion, downloadPercent, check, download, install } = useAutoUpdate();

  // Dev mode — static green badge, no update checks
  if (APP_VERSION === 'dev') {
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono bg-aegis-success/15 text-aegis-success border border-aegis-success/30 transition-colors duration-300">
        Version dev
      </span>
    );
  }

  const handleClick = () => {
    if (status === 'idle' || status === 'error') check();
    else if (status === 'available') download();
    else if (status === 'ready') install();
  };

  const isClickable = ['idle', 'error', 'available', 'ready'].includes(status);
  const isYellow = ['available', 'downloading', 'ready'].includes(status);
  const isPulsing = status === 'checking' || status === 'downloading';

  let label: string;
  switch (status) {
    case 'checking':    label = `v${APP_VERSION}`; break;
    case 'available':   label = `Update v${updateVersion ?? ''}`; break;
    case 'downloading': label = `Downloading ${downloadPercent}%`; break;
    case 'ready':       label = 'Restart to update'; break;
    case 'error':       label = `v${APP_VERSION}`; break;
    default:            label = `v${APP_VERSION} ✓`; break;
  }

  return (
    <button
      onClick={isClickable ? handleClick : undefined}
      title={
        status === 'idle'      ? 'Click to check for updates' :
        status === 'available' ? `Update to v${updateVersion} — click to download` :
        status === 'ready'     ? 'Update downloaded — click to restart' :
        status === 'error'     ? 'Update check failed — click to retry' :
        undefined
      }
      className={clsx(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono transition-colors duration-300',
        isYellow
          ? 'bg-aegis-warning/15 text-aegis-warning border border-aegis-warning/30'
          : 'bg-aegis-success/15 text-aegis-success border border-aegis-success/30',
        isPulsing && 'animate-pulse',
        isClickable ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// GatewayControl — Start / Restart button + connection status dot
// ═══════════════════════════════════════════════════════════

function GatewayControl() {
  const { t } = useTranslation();
  const { connected, connecting, restarting, setRestarting } = useChatStore();
  const [confirming, setConfirming] = useState(false);

  const doRestart = useCallback(async () => {
    setConfirming(false);
    setRestarting(true);
    try {
      await window.aegis?.config?.restart?.();
    } catch (err) {
      console.error('[GatewayControl] restart failed:', err);
    } finally {
      // Always clear — IPC returns once gateway is ready; WebSocket reconnects on its own
      setRestarting(false);
    }
  }, [setRestarting]);

  const handleClick = useCallback(() => {
    if (restarting || connecting) return;
    if (connected) {
      // Require confirmation before restarting a running gateway
      setConfirming(true);
    } else {
      // Not connected — start immediately, no confirmation needed
      doRestart();
    }
  }, [restarting, connecting, connected, doRestart]);

  const isIdle = !connected && !connecting && !restarting;

  // ── Confirm row (shown when user clicked Restart while connected) ──
  if (confirming) {
    return (
      <div className="flex items-center gap-1 no-drag">
        <span className="text-[10px] text-aegis-text-muted mr-0.5">{t('gateway.confirmRestart')}</span>
        <button
          onClick={doRestart}
          className="px-2 py-0.5 rounded text-[10px] font-semibold
            bg-aegis-danger/[0.08] border border-aegis-danger/25 text-aegis-danger
            hover:bg-aegis-danger/[0.15] transition-colors"
        >
          {t('gateway.confirmYes')}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-0.5 rounded text-[10px]
            border border-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-dim
            hover:border-[rgb(var(--aegis-overlay)/0.2)] transition-colors"
        >
          {t('gateway.confirmNo')}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={restarting || connecting}
      title={
        restarting  ? t('gateway.restarting') :
        connected   ? t('gateway.restartTooltip') :
                      t('gateway.startTooltip')
      }
      className={clsx(
        'group flex items-center gap-[5px] px-1.5 py-0.5 rounded-md text-[11px] transition-all duration-150 no-drag',
        'border',
        restarting || connecting
          ? 'opacity-60 cursor-default border-transparent text-aegis-text-dim'
          : connected
            ? 'border-transparent text-aegis-success hover:border-aegis-success/20 hover:bg-aegis-success/[0.06] cursor-pointer'
            : isIdle
              ? 'border-aegis-primary/25 text-aegis-primary bg-aegis-primary/[0.05] hover:bg-aegis-primary/[0.1] cursor-pointer'
              : 'border-transparent text-aegis-warning cursor-default',
      )}
    >
      {/* Status dot */}
      <span className={clsx(
        'w-[5px] h-[5px] rounded-full shrink-0',
        restarting  ? 'bg-aegis-warning animate-pulse' :
        connected   ? 'bg-aegis-success connected-glow' :
        connecting  ? 'bg-aegis-warning animate-pulse' :
                      'bg-aegis-text-dim',
      )} />

      {restarting || connecting
        ? <Loader2 size={9} className="animate-spin shrink-0" />
        : connected
          ? <RefreshCw size={9} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          : isIdle
            ? <Power size={9} className="shrink-0" />
            : null}

      <span>
        {restarting
          ? t('gateway.restarting')
          : connected
            ? t('gateway.connectedLabel')
            : connecting
              ? t('gateway.connectingLabel')
              : t('gateway.disconnectedLabel')}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
export function TitleBar() {
  // Platform detection — preload exposes process.platform as window.aegis.platform.
  // Fall back to userAgent for browser-only dev mode.
  const platform = window.aegis?.platform ?? (navigator.userAgent.includes('Mac') ? 'darwin' : 'other');
  const isMac     = platform === 'darwin';
  const isWindows = platform === 'win32';

  // Native window controls per platform:
  //   macOS   — traffic-light buttons rendered by the OS in the top-left inset area
  //   Windows — native snap/control overlay rendered by Electron in the top-right area
  //   Linux   — frameless; window manager adds its own decorations outside the window
  // No custom ─ □ ✕ buttons needed in any case.
  return (
    <div
      dir="ltr"
      className={clsx(
        // drag-region makes the bar draggable on frameless (Win/Linux) windows.
        // On macOS the native title bar already handles dragging — the class is harmless.
        'drag-region h-[38px] flex items-center gap-4 chrome-bg border-b border-aegis-border select-none shrink-0 relative z-10',
        // macOS: leave ~76 px on the left for the traffic-light buttons (●●●)
        isMac     && 'pl-[76px] pr-4',
        // Windows: leave ~154 px on the right for the native minimize/maximize/close overlay
        isWindows && 'pl-4 pr-[154px]',
        // Linux / fallback: symmetric padding
        !isMac && !isWindows && 'px-4',
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold text-aegis-text-secondary tracking-[2px]">
          OpenClaw
        </span>
        <span className="text-[10px] text-aegis-text-dim tracking-[1px]">
          Desktop
        </span>
        <VersionBadge />
      </div>

      {/* Global status only; session controls moved into chat session area */}
      <div className="flex items-center gap-3 text-[11px] text-aegis-text-muted font-mono">
        <GatewayControl />
      </div>
    </div>
  );
}

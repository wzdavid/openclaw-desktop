// ═══════════════════════════════════════════════════════════
// SettingsPage — Full settings with Gateway, Theme, Model
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings, Bell, BellOff, Globe, Volume2, VolumeX,
  Wifi, WifiOff, CheckCircle, Loader2, Copy, Sun, Moon,
  MonitorDot, FileText, HardDrive, RefreshCw,
} from 'lucide-react';
import { APP_VERSION } from '@/hooks/useAppVersion';
import { GlassCard } from '@/components/shared/GlassCard';
import { PageTransition } from '@/components/shared/PageTransition';
import { StatusDot } from '@/components/shared/StatusDot';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { gateway } from '@/services/gateway';
import { notifications } from '@/services/notifications';
import { changeLanguage } from '@/i18n';
import clsx from 'clsx';

export function SettingsPageFull() {
  const { t } = useTranslation();
  const {
    theme, setTheme,
    language, setLanguage,
    notificationsEnabled, setNotificationsEnabled,
    soundEnabled, setSoundEnabled,
    dndMode, setDndMode,
    gatewayUrl, setGatewayUrl,
    gatewayToken, setGatewayToken,
    accentColor, setAccentColor,
  } = useSettingsStore();
  const { connected, connecting } = useChatStore();

  const [openclawVersion, setOpenclawVersion] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [editUrl, setEditUrl] = useState(gatewayUrl);
  const [editToken, setEditToken] = useState(gatewayToken);
  const [connectionDirty, setConnectionDirty] = useState(false);

  const [managedFilesRefreshing, setManagedFilesRefreshing] = useState(false);
  const [attachmentsStatus, setAttachmentsStatus] = useState<string>('');

  const [managedIndexInfo, setManagedIndexInfo] = useState<{
    indexedTotal: number;
    indexedBytes: number;
    loadedRows: number;
    bytesIsPartial: boolean;
    workspaceSample: string;
  } | null>(null);

  useEffect(() => {
    window.aegis?.app?.versions()
      .then((v) => setOpenclawVersion(v.openclaw ?? (v as any).runtime ?? null))
      .catch(() => {});
  }, []);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const refreshManagedIndexInfo = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!window.aegis?.managedFiles?.list) {
        setManagedIndexInfo(null);
        return { success: false, error: t('settings.managedFilesApiUnavailable') };
      }
      const result = await window.aegis.managedFiles.list({ limit: 500_000, offset: 0 });
      if (!result || !('success' in result) || !result.success) {
        setManagedIndexInfo(null);
        return { success: false, error: (result as { error?: string })?.error || t('settings.managedFilesListFailed') };
      }
      const rows = result.rows || [];
      const indexedTotal = typeof result.total === 'number' ? result.total : rows.length;
      let indexedBytes = 0;
      for (const r of rows) {
        indexedBytes += Number((r as { size?: number }).size || 0);
      }
      const bytesIsPartial = indexedTotal > rows.length;
      const workspaceSample = String((rows[0] as { workspaceRoot?: string })?.workspaceRoot || '');
      setManagedIndexInfo({
        indexedTotal,
        indexedBytes,
        loadedRows: rows.length,
        bytesIsPartial,
        workspaceSample,
      });
      return { success: true };
    } catch (error: any) {
      setManagedIndexInfo(null);
      return { success: false, error: error?.message || t('settings.managedFilesListFailed') };
    }
  };

  useEffect(() => {
    refreshManagedIndexInfo().then((r) => {
      if (!r.success && r.error) setAttachmentsStatus(r.error);
    });
    // Mount-only: avoid re-fetch loops when language/t changes (stats are language-agnostic).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLanguageChange = (lang: 'ar' | 'en' | 'zh') => {
    setLanguage(lang);
    changeLanguage(lang);
  };

  const handleNotificationsToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    notifications.setEnabled(enabled);
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    notifications.setSoundEnabled(enabled);
  };

  const handleDndToggle = (dnd: boolean) => {
    setDndMode(dnd);
    notifications.setDndMode(dnd);
  };

  const notifyInfo = (title: string, body: string) => {
    notifications.notify({ type: 'info', title, body });
  };

  const notifyError = (title: string, body: string) => {
    notifications.notify({ type: 'error', title, body });
  };

  const copyDiagnosticInfo = async () => {
    const gatewayUrl = localStorage.getItem('aegis-gateway-http')?.replace('http', 'ws') || 'ws://127.0.0.1:18789';
    const hasGatewayToken = Boolean((editToken || '').trim() || (gatewayToken || '').trim());
    const electronVersion = typeof navigator !== 'undefined'
      ? (navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] || '—')
      : '—';
    const info = [
      `OpenClaw Desktop v${APP_VERSION}`,
      `OpenClaw: ${openclawVersion ? `v${openclawVersion}` : '—'}`,
      `${t('settingsExtra.platform', 'Platform')}: ${navigator.platform}`,
      `Electron: ${electronVersion}`,
      `${t('settingsExtra.wsUrlLabel', 'WebSocket URL')}: ${gatewayUrl}`,
      `${t('settingsExtra.gatewayTokenLabel', 'Gateway Token')}: ${hasGatewayToken ? 'configured' : 'empty'}`,
      `${t('settings.gateway', 'Gateway')}: ${connected ? t('connection.connected', 'connected') : t('connection.disconnected', 'disconnected')}`,
    ].join('\n');
    try {
      await navigator.clipboard?.writeText(info);
      notifyInfo(t('settingsExtra.copySystemInfo', 'Copy system info'), t('common.copied', 'Copied'));
      return;
    } catch {
      // Fallback for clipboard permission/availability edge cases
      try {
        const ta = document.createElement('textarea');
        ta.value = info;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          notifyInfo(t('settingsExtra.copySystemInfo', 'Copy system info'), t('common.copied', 'Copied'));
        } else {
          notifyError(t('settingsExtra.copySystemInfo', 'Copy system info'), t('settings.attachmentsOperationFailed', 'Operation failed'));
        }
      } catch {
        notifyError(t('settingsExtra.copySystemInfo', 'Copy system info'), t('settings.attachmentsOperationFailed', 'Operation failed'));
      }
    }
  };

  const openGatewayLogs = async () => {
    try {
      const res = await (window.aegis?.logs?.openGatewayLogFile?.() ?? window.aegis?.logs?.openElectronLogFile?.());
      if (res?.success) return;
      notifyError(t('settings.openGatewayLogs', '查看 Gateway 日志'), res?.error || t('settings.managedFilesListFailed'));
    } catch (err: any) {
      notifyError(t('settings.openGatewayLogs', '查看 Gateway 日志'), err?.message || t('settings.managedFilesListFailed'));
    }
  };

  const openDesktopLogs = async () => {
    try {
      // Fallback for stale preload in running app: at least open legacy log entrypoint.
      const res = await (window.aegis?.logs?.openDesktopLogFile?.() ?? window.aegis?.logs?.openElectronLogFile?.());
      if (res?.success) return;
      notifyError(t('settings.openDesktopLogs', '查看桌面日志'), res?.error || t('settings.managedFilesListFailed'));
    } catch (err: any) {
      const message = String(err?.message || err || '');
      if (message.includes("No handler registered for 'logs:openDesktopLogFile'")) {
        try {
          const fallback = await window.aegis?.logs?.openElectronLogFile?.();
          if (fallback?.success) return;
        } catch {
          // handled below
        }
      }
      notifyError(t('settings.openDesktopLogs', '查看桌面日志'), message || t('settings.managedFilesListFailed'));
    }
  };

  const resolveConnectionUrl = async (): Promise<{ url: string; token: string }> => {
    const userUrl = editUrl.trim();
    const userToken = editToken.trim();
    if (userUrl) return { url: userUrl, token: userToken };
    try {
      const config = await window.aegis?.config.get();
      return {
        url: config?.gatewayUrl || config?.gatewayWsUrl || 'ws://127.0.0.1:18789',
        token: config?.gatewayToken || '',
      };
    } catch {
      return { url: 'ws://127.0.0.1:18789', token: '' };
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const { url, token } = await resolveConnectionUrl();
      gateway.connect(url, token);
      await new Promise((r) => setTimeout(r, 2500));
      setTestResult(useChatStore.getState().connected ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleReconnect = async () => {
    const { url, token } = await resolveConnectionUrl();
    gateway.connect(url, token);
  };

  const handleSaveConnection = () => {
    setGatewayUrl(editUrl.trim());
    setGatewayToken(editToken.trim());
    setConnectionDirty(false);
    // Reconnect with new settings
    const url = editUrl.trim() || 'ws://127.0.0.1:18789';
    gateway.connect(url, editToken.trim());
  };

  // Toggle switch — unified design (used everywhere in settings)
  const Toggle = ({
    enabled,
    onChange,
    disabled,
  }: {
    enabled: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      className={clsx(
        'w-[42px] h-[24px] rounded-full relative transition-all shrink-0 border',
        enabled
          ? 'bg-aegis-primary/30 border-aegis-primary/40'
          : 'bg-[rgb(var(--aegis-overlay)/0.08)] border-[rgb(var(--aegis-overlay)/0.1)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={clsx(
        'absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all duration-300',
        enabled
          ? 'left-[21px] bg-aegis-primary shadow-[0_0_8px_rgb(var(--aegis-primary)/0.5)]'
          : 'left-[2px] bg-[rgb(var(--aegis-overlay)/0.3)]'
      )} />
    </button>
  );

  return (
    <PageTransition className="p-6 space-y-6 max-w-[700px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold text-aegis-text flex items-center gap-3">
          <Settings size={24} className="text-aegis-text-dim" />
          {t('settings.title')}
        </h1>
      </div>

      {/* Language */}
      <GlassCard delay={0.05}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Globe size={16} className="text-aegis-primary" />
          {t('settings.language')}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleLanguageChange('zh')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'zh'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            简体中文
          </button>
          <button
            onClick={() => handleLanguageChange('en')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'en'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            English
          </button>
        </div>
      </GlassCard>

      {/* Theme */}
      <GlassCard delay={0.08}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Moon size={16} className="text-aegis-primary" />
          {t('settings.theme')}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme('aegis-dark')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors flex items-center justify-center gap-2',
              (theme || 'aegis-dark') === 'aegis-dark'
                ? 'bg-aegis-primary text-aegis-btn-primary-text border-transparent'
                : 'bg-aegis-glass text-aegis-text-secondary border border-aegis-border'
            )}
          >
            <Moon size={15} />
            {t('settings.themeDark')}
          </button>
          <button
            onClick={() => setTheme('aegis-light')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors flex items-center justify-center gap-2',
              (theme || 'aegis-dark') === 'aegis-light'
                ? 'bg-aegis-primary text-aegis-btn-primary-text border-transparent'
                : 'bg-aegis-glass text-aegis-text-secondary border border-aegis-border'
            )}
          >
            <Sun size={15} />
            {t('settings.themeLight')}
          </button>
        </div>
      </GlassCard>

      {/* Accent Color */}
      <GlassCard delay={0.09}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <span className="text-aegis-primary">🎨</span>
          {t('settings.accentColor', 'Accent Color')}
        </h3>
        <div className="flex gap-3 flex-wrap">
          {(['teal', 'blue', 'purple', 'rose', 'amber', 'emerald'] as const).map((color) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              className={clsx(
                'w-8 h-8 rounded-full border-2 transition-all',
                accentColor === color
                  ? 'border-aegis-text scale-110'
                  : 'border-transparent hover:border-aegis-text-dim hover:scale-105'
              )}
              style={{
                backgroundColor: {
                  teal: 'rgb(78, 201, 176)',
                  blue: 'rgb(96, 165, 250)',
                  purple: 'rgb(192, 132, 252)',
                  rose: 'rgb(251, 113, 133)',
                  amber: 'rgb(251, 191, 36)',
                  emerald: 'rgb(52, 211, 153)',
                }[color],
              }}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            />
          ))}
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard delay={0.1}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Bell size={16} className="text-aegis-warning" />
          {t('settings.notifications')}
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text">{t('settings.enableNotifications')}</div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.notificationsDesc')}</div>
            </div>
            <Toggle enabled={notificationsEnabled} onChange={handleNotificationsToggle} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text flex items-center gap-2">
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {t('settings.sound')}
              </div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.soundDesc')}</div>
            </div>
            <Toggle enabled={soundEnabled} onChange={handleSoundToggle} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text flex items-center gap-2">
                <BellOff size={14} />
                {t('settings.dnd')}
              </div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.dndDesc')}</div>
            </div>
            <Toggle enabled={dndMode} onChange={handleDndToggle} />
          </div>

          <button
            onClick={() => notifications.notify({ type: 'info', title: t('app.title', 'OpenClaw Desktop'), body: t('settings.testNotification') })}
            className="text-[12px] px-4 py-2 rounded-xl border border-aegis-border/20 text-aegis-text-dim hover:text-aegis-text hover:border-aegis-border/40 transition-colors"
          >
            🔔 {t('settings.testSound')}
          </button>
        </div>
      </GlassCard>

      {/* Gateway */}
      <GlassCard delay={0.15}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          {connected ? <Wifi size={16} className="text-aegis-success" /> : <WifiOff size={16} className="text-aegis-danger" />}
          {t('settings.gateway', 'Gateway')}
        </h3>
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-aegis-text">{t('settingsExtra.connectionStatus')}</div>
            <div className="flex items-center gap-2">
              <StatusDot status={connected ? 'active' : connecting ? 'idle' : 'error'} size={7} />
              <span className={clsx('text-[12px] font-medium',
                connected ? 'text-aegis-success' : connecting ? 'text-aegis-warning' : 'text-aegis-danger'
              )}>
                {connected ? t('connection.connected') : connecting ? t('connection.connecting') : t('connection.disconnected')}
              </span>
            </div>
          </div>

          {/* Gateway URL — editable */}
          <div>
            <label className="text-[12px] text-aegis-text-muted font-medium mb-1.5 block">
              {t('settingsExtra.wsUrlLabel', 'WebSocket URL')}
            </label>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => { setEditUrl(e.target.value); setConnectionDirty(true); }}
              placeholder={t('settingsExtra.wsUrlPlaceholder', 'ws://127.0.0.1:18789')}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] font-mono
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-aegis-border
                text-aegis-text placeholder:text-aegis-text-dim
                outline-none focus:border-aegis-accent/40 focus:bg-aegis-accent/[0.03] transition-all"
              dir="ltr"
            />
            <div className="text-[10px] text-aegis-text-dim mt-1">
              {t('settings.gatewayUrlHint', 'Leave empty to use default (ws://127.0.0.1:18789)')}
            </div>
          </div>

          {/* Gateway Token — editable */}
          <div>
            <label className="text-[12px] text-aegis-text-muted font-medium mb-1.5 block">
              {t('settingsExtra.gatewayTokenLabel', 'Gateway Token')}
            </label>
            <input
              type="password"
              value={editToken}
              onChange={(e) => { setEditToken(e.target.value); setConnectionDirty(true); }}
              placeholder={t('settingsExtra.tokenPlaceholder')}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] font-mono
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-aegis-border
                text-aegis-text placeholder:text-aegis-text-dim
                outline-none focus:border-aegis-accent/40 focus:bg-aegis-accent/[0.03] transition-all"
              dir="ltr"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {connectionDirty && (
              <button
                onClick={handleSaveConnection}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold
                  bg-aegis-primary/15 text-aegis-primary border border-aegis-primary/25
                  hover:bg-aegis-primary/25 transition-colors"
              >
                <CheckCircle size={13} />
                {t('settingsExtra.saveReconnect')}
              </button>
            )}
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] border border-aegis-border/20 text-aegis-text-dim hover:text-aegis-text hover:border-aegis-border/40 transition-colors disabled:opacity-40"
            >
              {testingConnection ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
              {t('settings.testConnection')}
            </button>
            {!connected && !connectionDirty && (
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20 hover:bg-aegis-primary/20 transition-colors"
              >
                <Wifi size={13} />
                {t('connection.reconnect')}
              </button>
            )}
            {testResult && (
              <span className={clsx('text-[11px] flex items-center gap-1',
                testResult === 'success' ? 'text-aegis-success' : 'text-aegis-danger'
              )}>
                <CheckCircle size={12} />
                {testResult === 'success' ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Conversation files — same managed index as File Manager */}
      <GlassCard delay={0.28}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-1 flex items-center gap-2">
          <HardDrive size={16} className="text-aegis-primary" />
          {t('settings.attachmentsTemp')}
        </h3>
        <p className="text-[11px] text-aegis-text-dim/70 mb-4 leading-relaxed">
          {t('settings.attachmentsSectionHint')}
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-aegis-text-dim">{t('settings.attachmentsCount')}</span>
            <span className="text-aegis-text">{managedIndexInfo?.indexedTotal ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-aegis-text-dim">{t('settings.attachmentsSize')}</span>
            <span className="text-aegis-text">
              {managedIndexInfo ? formatBytes(managedIndexInfo.indexedBytes) : '—'}
              {managedIndexInfo?.bytesIsPartial && (
                <span className="text-[10px] text-aegis-text-dim ms-1">
                  ({t('settings.attachmentsSizePartial', { loaded: managedIndexInfo.loadedRows, total: managedIndexInfo.indexedTotal })})
                </span>
              )}
            </span>
          </div>
          {!!managedIndexInfo?.workspaceSample && (
            <div className="text-[10px] text-aegis-text-dim break-all">
              {t('settings.attachmentsWorkspaceSample')}: {managedIndexInfo.workspaceSample}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (managedFilesRefreshing) return;
                setManagedFilesRefreshing(true);
                setAttachmentsStatus('');
                try {
                  const r = await refreshManagedIndexInfo();
                  if (r.success) setAttachmentsStatus(t('settings.attachmentsReady'));
                  else setAttachmentsStatus(r.error || t('settings.managedFilesListFailed'));
                } catch {
                  setAttachmentsStatus(t('settings.managedFilesListFailed'));
                } finally {
                  setManagedFilesRefreshing(false);
                }
              }}
              disabled={managedFilesRefreshing}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors',
                managedFilesRefreshing
                  ? 'text-aegis-text-dim/60 border-aegis-border/10 cursor-not-allowed'
                  : 'text-aegis-text-dim hover:text-aegis-text border-aegis-border/20 hover:border-aegis-border/40',
              )}
            >
              <RefreshCw size={12} className={managedFilesRefreshing ? 'animate-spin' : ''} />
              {managedFilesRefreshing ? t('settings.refreshing') : t('settings.refresh')}
            </button>
          </div>
          {!!attachmentsStatus && (
            <div className="text-[11px] text-aegis-text-dim">
              {attachmentsStatus}
            </div>
          )}
        </div>
      </GlassCard>

      {/* About + System Info */}
      <GlassCard delay={0.3}>
        <div className="text-center py-4 mb-4">
          {/* OpenClaw brand mark */}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
            style={{ background: 'rgb(var(--aegis-primary) / 0.15)', border: '1px solid rgb(var(--aegis-primary) / 0.25)' }}>
            <span className="text-[22px] font-extrabold tracking-tight text-aegis-primary">OC</span>
          </div>
          <div className="text-[15px] font-bold text-aegis-text">OpenClaw Desktop</div>
          <div className="text-[12px] text-aegis-text-dim mt-1">v{APP_VERSION}</div>
          <div className="text-[11px] text-aegis-text-dim mt-0.5">{t('app.clientSubtitle')}</div>
        </div>
        <div className="space-y-2 border-t border-aegis-border/15 pt-3">
          {[
            ['OpenClaw', openclawVersion ? `v${openclawVersion}` : '—'],
            [t('settingsExtra.platform', 'Platform'), typeof navigator !== 'undefined' ? navigator.platform : '—'],
            [t('settings.gateway', 'Gateway'), connected ? `${localStorage.getItem('aegis-gateway-http')?.replace('http', 'ws') || 'ws://127.0.0.1:18789'} ✓` : '— ✗'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px] text-aegis-text-dim">{label}</span>
              <span className="text-[10px] font-mono text-aegis-text-muted truncate max-w-[250px]">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => { void copyDiagnosticInfo(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-dim hover:text-aegis-text border border-aegis-border/20 hover:border-aegis-border/40 transition-colors">
            <Copy size={12} /> {t('settingsExtra.copySystemInfo')}
          </button>

          {window.aegis?.logs && (
            <>
              <button
                onClick={() => { void openGatewayLogs(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-dim hover:text-aegis-text border border-aegis-border/20 hover:border-aegis-border/40 transition-colors"
              >
                <FileText size={12} /> {t('settings.openGatewayLogs', '查看 Gateway 日志')}
              </button>
              <button
                onClick={() => { void openDesktopLogs(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-dim hover:text-aegis-text border border-aegis-border/20 hover:border-aegis-border/40 transition-colors"
              >
                <FileText size={12} /> {t('settings.openDesktopLogs', '查看桌面日志')}
              </button>
            </>
          )}
        </div>

        {window.aegis?.consoleUi && (
          <div className="mt-3 flex items-center justify-center">
            <button
              onClick={() => window.aegis?.consoleUi?.open()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold
                bg-aegis-primary/15 text-aegis-primary border border-aegis-primary/30
                hover:bg-aegis-primary/25 transition-colors"
            >
              <MonitorDot size={13} /> {t('settings.controlUi', 'Control UI')}
            </button>
          </div>
        )}
      </GlassCard>
    </PageTransition>
  );
}

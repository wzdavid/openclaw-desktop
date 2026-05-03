// ═══════════════════════════════════════════════════════════
// OfflineOverlay — Shown on pages that require Gateway connection
// Transparent overlay with centered status — no blocking, no errors
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import { Loader2, WifiOff, FileText, MonitorDot } from 'lucide-react';
import { gateway } from '@/services/gateway';
import { useChatStore } from '@/stores/chatStore';

export function OfflineOverlay() {
  const { t } = useTranslation();
  const connecting = useChatStore((s) => s.connecting);
  const lastError = gateway.getLastError?.();

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-[360px]">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-5
          bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)]
          flex items-center justify-center">
          {connecting
            ? <Loader2 size={28} className="text-aegis-warning animate-spin" />
            : <WifiOff size={28} className="text-aegis-text-dim" />}
        </div>
        <h2 className="text-[16px] font-bold text-aegis-text mb-2">
          {connecting ? t('offline.connectingTitle') : t('offline.title')}
        </h2>
        <p className="text-[12.5px] text-aegis-text-muted leading-relaxed mb-2">
          {connecting ? t('offline.connectingDescription') : t('offline.description')}
        </p>

        {connecting ? (
          <div className="flex items-center justify-center gap-2 text-[11px] text-aegis-text-dim mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-aegis-warning/60 animate-pulse" />
            {t('offline.connectingHint')}
          </div>
        ) : lastError ? (
          <div className="mb-4 px-3 py-2 rounded-lg bg-aegis-error/10 border border-aegis-error/20 text-left">
            <p className="text-[10px] font-mono text-aegis-error/80 break-all leading-relaxed">
              {lastError}
            </p>
          </div>
        ) : null}

        {!connecting && (
          <div className="flex items-center justify-center gap-2 text-[11px] text-aegis-text-dim mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-aegis-warning/60 animate-pulse" />
            {t('offline.retrying')}
          </div>
        )}

        {!connecting && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {window.aegis?.logs && (
              <button
                onClick={() => window.aegis?.logs?.openElectronLogFile()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]
                  text-aegis-text-dim hover:text-aegis-text
                  border border-aegis-border/20 hover:border-aegis-border/40 transition-colors"
              >
                <FileText size={11} /> {t('offline.viewLogs', '查看日志')}
              </button>
            )}
            {window.aegis?.consoleUi && (
              <button
                onClick={() => window.aegis?.consoleUi?.open()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]
                  text-aegis-text-dim hover:text-aegis-text
                  border border-aegis-border/20 hover:border-aegis-border/40 transition-colors"
              >
                <MonitorDot size={11} /> {t('settings.controlUi', 'Control UI')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

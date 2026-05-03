import { useState, useEffect } from 'react';
import { X, Monitor, AppWindow, Loader2, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDirection } from '@/i18n';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Screenshot Picker — choose window or full screen
// ═══════════════════════════════════════════════════════════

interface WindowSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
}

interface ScreenshotPickerProps {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export function ScreenshotPicker({ open, onClose, onCapture }: ScreenshotPickerProps) {
  const { t } = useTranslation();
  const { language } = useSettingsStore();
  const dir = getDirection(language);
  const [windows, setWindows] = useState<WindowSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState<string | null>(null);

  // Load windows list when opened
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadWindows();
  }, [open]);

  const loadWindows = async () => {
    try {
      // Use preload getSources (desktopCapturer) for thumbnails
      const sources = await window.aegis?.screenshot.getSources?.()
        || await window.aegis?.screenshot.getWindows();
      if (Array.isArray(sources)) {
        const filtered = sources.filter(
          (w: WindowSource) => w.name && w.thumbnail
        );
        setWindows(filtered);
      }
    } catch (err) {
      console.error('[Screenshot] Failed to get windows:', err);
    } finally {
      setLoading(false);
    }
  };

  // Capture using MediaStream API (real screenshot)
  const captureSource = async (sourceId: string) => {
    try {
      // Use the real Screen Capture API via preload
      const dataUrl = await window.aegis?.screenshot.captureSourceStream?.(sourceId);
      if (dataUrl) {
        return dataUrl;
      }
      // Fallback to main process
      const result = await window.aegis?.screenshot.captureWindow(sourceId);
      return result?.success ? result.data : null;
    } catch {
      return null;
    }
  };

  // Capture full screen
  const captureScreen = async () => {
    setCapturing('screen');
    try {
      // Find the screen source
      const screenSource = windows.find((w) => w.id.startsWith('screen:'));
      const dataUrl = screenSource
        ? await captureSource(screenSource.id)
        : null;

      if (dataUrl) {
        onCapture(dataUrl);
        onClose();
      } else {
        // Fallback: main process capture
        const result = await window.aegis?.screenshot.capture();
        if (result?.success && result.data) {
          onCapture(result.data);
          onClose();
        }
      }
    } catch (err) {
      console.error('[Screenshot] Screen capture failed:', err);
    } finally {
      setCapturing(null);
    }
  };

  // Capture specific window
  const captureWindow = async (windowId: string) => {
    setCapturing(windowId);
    try {
      const dataUrl = await captureSource(windowId);
      if (dataUrl) {
        onCapture(dataUrl);
        onClose();
      }
    } catch (err) {
      console.error('[Screenshot] Window capture failed:', err);
    } finally {
      setCapturing(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-20 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-aegis-surface border border-aegis-border rounded-2xl shadow-2xl w-[680px] max-h-[420px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-aegis-border/50">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-aegis-elevated transition-colors">
            <X size={18} className="text-aegis-text-muted" />
          </button>
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-aegis-primary" />
            <h3 className="text-[15px] font-semibold text-aegis-text">{t('screenshot.title')}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4" dir={dir}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-aegis-primary" />
              <span className="mx-3 text-aegis-text-muted">{t('screenshot.loading')}</span>
            </div>
          ) : (
            <>
              {/* Full Screen Option */}
              <button
                onClick={captureScreen}
                disabled={!!capturing}
                className={clsx(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all mb-4',
                  'border-aegis-primary/30 bg-aegis-primary/5 hover:bg-aegis-primary/10',
                  capturing === 'screen' && 'opacity-60'
                )}
              >
                <div className="w-12 h-12 rounded-lg bg-aegis-primary/20 flex items-center justify-center shrink-0">
                  {capturing === 'screen' ? (
                    <Loader2 size={20} className="animate-spin text-aegis-primary" />
                  ) : (
                    <Monitor size={20} className="text-aegis-primary" />
                  )}
                </div>
                <div className={dir === 'rtl' ? 'text-end' : 'text-start'}>
                  <div className="text-[14px] font-medium text-aegis-text">{t('screenshot.fullScreen')}</div>
                  <div className="text-[11px] text-aegis-text-dim">{t('screenshot.fullScreenDesc')}</div>
                </div>
              </button>

              {/* Windows List */}
              {windows.length > 0 && (
                <div className="text-[12px] text-aegis-text-dim mb-2 font-medium">
                  {t('screenshot.openWindows', { count: windows.length })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {windows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => captureWindow(w.id)}
                    disabled={!!capturing}
                    className={clsx(
                      'flex flex-col rounded-xl border border-aegis-border/60 overflow-hidden transition-all',
                      'hover:border-aegis-primary/50 hover:shadow-lg hover:shadow-aegis-primary/5',
                      'bg-aegis-bg group',
                      capturing === w.id && 'opacity-60 border-aegis-primary/50'
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full aspect-video bg-black/20 overflow-hidden">
                      <img
                        src={w.thumbnail}
                        alt={w.name}
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                      {capturing === w.id && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 size={24} className="animate-spin text-aegis-text" />
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-aegis-primary/0 group-hover:bg-aegis-primary/10 transition-colors flex items-center justify-center">
                        <Camera
                          size={28}
                          className="text-aegis-text opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg"
                        />
                      </div>
                    </div>
                    {/* Window Name */}
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-aegis-border/30">
                      <AppWindow size={13} className="text-aegis-text-dim shrink-0" />
                      <span className={clsx('text-[11px] text-aegis-text-muted truncate flex-1', dir === 'rtl' ? 'text-end' : 'text-start')}>
                        {w.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {windows.length === 0 && (
                <div className="text-center py-8 text-aegis-text-dim text-[13px]">
                  {t('screenshot.noWindows')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

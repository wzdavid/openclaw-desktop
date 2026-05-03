import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Maximize2, X, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// ChatVideo — Video display with controls, save, and fullscreen
// Handles: HTTP URLs, gateway media paths, local files
// ═══════════════════════════════════════════════════════════

interface ChatVideoProps {
  src: string;
  alt?: string;
  maxWidth?: string;
  maxHeight?: string;
  className?: string;
}

// ── Resolve video source ──
function resolveVideoSrc(src: string): string {
  if (!src) return '';

  // Already a data URL or HTTP URL — use as-is
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
    return src;
  }

  // aegis-media: protocol (local file served by Electron)
  if (src.startsWith('aegis-media:')) {
    return src;
  }

  // Relative gateway media path (e.g., /media/xxx.mp4)
  if (src.startsWith('/media/') || src.startsWith('/v1/media/')) {
    const gwUrl = localStorage.getItem('aegis-gateway-http') || 'http://127.0.0.1:18789';
    return `${gwUrl}${src}`;
  }

  return src;
}

// ── Extract filename from src ──
function extractFilename(src: string, alt?: string): string {
  if (alt && alt !== 'video' && !alt.startsWith('http')) {
    const sanitized = alt.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
    if (sanitized.match(/\.\w{2,4}$/)) return sanitized;
    return sanitized + '.mp4';
  }

  try {
    const url = new URL(src.startsWith('data:') ? 'file:///video.mp4' : src);
    const pathname = url.pathname;
    const name = pathname.split('/').pop();
    if (name && name.includes('.')) return name;
  } catch { /* ignore */ }

  return `video-${Date.now()}.mp4`;
}

// ── Save video via Electron IPC ──
async function saveVideo(src: string, suggestedName: string): Promise<void> {
  try {
    const result = await (window.aegis as any)?.video?.save?.(src, suggestedName);
    if (result?.success) {
      console.log('[ChatVideo] Saved to:', result.path);
    } else {
      // Fallback: open in browser
      window.open(src, '_blank');
    }
  } catch (err) {
    console.error('[ChatVideo] Save failed:', err);
    window.open(src, '_blank');
  }
}

// ═══════════════════════════════════════════════════════════
// ChatVideo — Main Component
// ═══════════════════════════════════════════════════════════

export function ChatVideo({ src, alt, maxWidth = '100%', maxHeight = '400px', className }: ChatVideoProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const resolvedSrc = resolveVideoSrc(src);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const filename = extractFilename(src, alt);
    saveVideo(resolvedSrc, filename);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        videoRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  if (error) {
    return (
      <span className="inline-block my-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[12px]">
        ⚠️ {t('media.videoLoadError')}
      </span>
    );
  }

  return (
    <span
      className={clsx('relative inline-block my-2 group', className)}
      style={{ display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={resolvedSrc}
        className="rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] cursor-pointer transition-all hover:border-[rgb(var(--aegis-overlay)/0.15)]"
        style={{ 
          maxWidth, 
          maxHeight, 
          display: loaded ? 'block' : 'none',
          backgroundColor: 'var(--aegis-bg-frosted-60)'
        }}
        preload="metadata"
        playsInline
        onLoadedMetadata={() => setLoaded(true)}
        onError={() => setError(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
      />

      {/* Loading placeholder */}
      {!loaded && !error && (
        <span 
          className="rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] flex items-center justify-center"
          style={{ display: 'inline-flex', width: 300, height: 170, background: 'rgb(var(--aegis-overlay) / 0.03)' }}
        >
          <span className="w-5 h-5 border-2 border-[rgb(var(--aegis-overlay)/0.1)] border-t-white/30 rounded-full animate-spin" style={{ display: 'inline-block' }} />
        </span>
      )}

      {/* Play button overlay (when paused) */}
      {loaded && !playing && (
        <span 
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          style={{ display: 'flex' }}
          onClick={togglePlay}
        >
          <span 
            className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ 
              display: 'inline-flex',
              background: 'var(--aegis-bg-frosted-60)', 
              backdropFilter: 'blur(4px)',
              border: '1px solid var(--aegis-border)'
            }}
          >
            <Play size={24} className="text-aegis-text ms-1" fill="currentColor" />
          </span>
        </span>
      )}

      {/* Hover overlay with buttons */}
      {loaded && hovered && (
        <span 
          className="absolute top-2 right-2 flex items-center gap-1"
          style={{ display: 'inline-flex', animation: 'fadeIn 0.15s ease-out' }}
        >
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg backdrop-blur-sm transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgb(var(--aegis-overlay) / 0.1)' }}
            title={muted ? t('media.unmute') : t('media.muteAudio')}
          >
            {muted ? (
              <VolumeX size={14} className="text-aegis-text hover:text-aegis-text" />
            ) : (
              <Volume2 size={14} className="text-aegis-text hover:text-aegis-text" />
            )}
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 rounded-lg backdrop-blur-sm transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgb(var(--aegis-overlay) / 0.1)' }}
            title={t('media.saveVideo')}
          >
            <Download size={14} className="text-aegis-text hover:text-aegis-text" />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded-lg backdrop-blur-sm transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgb(var(--aegis-overlay) / 0.1)' }}
            title={t('media.fullscreen')}
          >
            <Maximize2 size={14} className="text-aegis-text hover:text-aegis-text" />
          </button>
        </span>
      )}

      {/* Bottom controls (visible when hovered and playing) */}
      {loaded && hovered && playing && (
        <span 
          className="absolute bottom-2 left-2 right-2 flex items-center gap-2 px-2 py-1 rounded-lg"
          style={{ 
            display: 'inline-flex',
            background: 'var(--aegis-bg-frosted-60)', 
            backdropFilter: 'blur(4px)'
          }}
        >
          <button onClick={togglePlay} className="text-aegis-text hover:text-aegis-text">
            <Pause size={16} />
          </button>
        </span>
      )}

      {/* Alt text / caption */}
      {alt && alt !== 'video' && (
        <span className="text-[11px] text-aegis-text-muted mt-1" style={{ display: 'block' }}>{alt}</span>
      )}
    </span>
  );
}

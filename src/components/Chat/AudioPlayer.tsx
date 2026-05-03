import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '@/stores/settingsStore';

// ═══════════════════════════════════════════════════════════
// AudioPlayer — Custom audio player for TTS / voice messages
// Compact, dark-themed, fits inside MessageBubble
// ═══════════════════════════════════════════════════════════

interface AudioPlayerProps {
  src: string;
  className?: string;
}

export function AudioPlayer({ src, className }: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [resolvedSrc, setResolvedSrc] = useState<string>(
    src.startsWith('aegis-media:') ? '' : src
  );

  // ── Resolve media sources ──
  useEffect(() => {
    if (src.startsWith('aegis-media:')) {
      let filePath = src.replace('aegis-media:', '');
      setLoading(true);

      // Sandbox /tmp/ paths → serve via TTS HTTP server (port configurable via IPC)
      if (filePath.startsWith('/tmp/tts-') || filePath.startsWith('/tmp/')) {
        const fileName = filePath.split('/').pop();
        const ttsPort = localStorage.getItem('aegis-tts-port') || '5050';
        const httpUrl = `http://localhost:${ttsPort}/audio/${fileName}`;
        console.log('[AudioPlayer] 🔊 Resolving sandbox path via HTTP:', httpUrl);

        // Try HTTP fetch from Edge TTS server
        fetch(httpUrl, { method: 'HEAD' })
          .then(r => {
            if (r.ok) {
              console.log('[AudioPlayer] ✅ HTTP audio available:', httpUrl);
              setResolvedSrc(httpUrl);
            } else {
              console.warn('[AudioPlayer] ⚠️ HTTP 404 — file not yet copied to shared folder');
              setError(true);
              setLoading(false);
            }
          })
          .catch(() => {
            console.warn('[AudioPlayer] ⚠️ Edge TTS server unreachable');
            setError(true);
            setLoading(false);
          });
        return;
      }

      // Convert Docker/Linux mount paths to native paths via IPC (platform-agnostic)
      // These paths come from Docker container mounts and need native resolution
      if (filePath.startsWith('/host-')) {
        // Extract drive letter from mount prefix: /host-d/ → D:\, /host-c/ → C:\
        const match = filePath.match(/^\/host-([a-z])\/(.*)/i);
        if (match) {
          const driveLetter = match[1].toUpperCase();
          filePath = `${driveLetter}:\\${match[2].replace(/\//g, '\\')}`;
        }
      }

      console.log('[AudioPlayer] Loading media via IPC:', filePath);

      if (window.aegis?.voice?.read) {
        window.aegis.voice.read(filePath).then((base64: string | null) => {
          if (base64) {
            const ext = filePath.split('.').pop()?.toLowerCase() || 'mp3';
            const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/webm';
            console.log('[AudioPlayer] ✅ Loaded via IPC, size:', Math.round(base64.length / 1024), 'KB');
            setResolvedSrc(`data:${mime};base64,${base64}`);
          } else {
            console.error('[AudioPlayer] ❌ No data returned for:', filePath);
            setError(true);
            setLoading(false);
          }
        }).catch((err: any) => {
          console.error('[AudioPlayer] ❌ Read failed:', err);
          setError(true);
          setLoading(false);
        });
      } else {
        console.error('[AudioPlayer] No voice.read IPC available');
        setError(true);
        setLoading(false);
      }

    } else if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) {
      setResolvedSrc(src);
    }
  }, [src]);

  // ── Time format ──
  const formatTime = (sec: number): string => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Audio event handlers ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setLoading(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      setError(true);
      setLoading(false);
      console.error('[AudioPlayer] Failed to load:', src);
    };

    const onCanPlay = () => {
      setLoading(false);
      // Auto-play if setting is enabled
      if (useSettingsStore.getState().audioAutoPlay && !playing) {
        audio.play().then(() => setPlaying(true)).catch(() => {});
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [resolvedSrc]);

  // ── Play / Pause ──
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || error) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch((e) => {
        console.error('[AudioPlayer] Play failed:', e);
        setError(true);
      });
    }
  }, [playing, error]);

  // ── Seek ──
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    // RTL: right edge = 0%, left edge = 100%
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  // ── Mute ──
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
  }, [muted]);

  // ── Playback speed ──
  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    audio.playbackRate = next;
    setPlaybackRate(next);
  }, [playbackRate]);

  // ── Replay ──
  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  }, []);

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Error state ──
  if (error) {
    return (
      <div className={clsx('flex items-center gap-2 py-2 px-3 rounded-xl bg-aegis-danger/10 border border-aegis-danger/20', className)}>
        <span className="text-[12px] text-aegis-danger">⚠️ {t('media.audioLoadError', 'Failed to load audio')}</span>
      </div>
    );
  }

  return (
    <div className={clsx(
      'flex items-center gap-2.5 py-2 px-3 rounded-xl',
      'bg-aegis-elevated/50 border border-aegis-border/30',
      'min-w-[240px] max-w-[360px]',
      className
    )}>
      {/* Hidden audio element — only render when src is resolved */}
      {resolvedSrc && <audio ref={audioRef} src={resolvedSrc} preload="metadata" />}

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={loading}
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all',
          playing
            ? 'bg-aegis-primary text-aegis-btn-primary-text shadow-md shadow-aegis-primary/30'
            : 'bg-aegis-primary/20 text-aegis-primary hover:bg-aegis-primary/30',
          loading && 'opacity-50 animate-pulse'
        )}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      {/* Progress + Time */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="h-1.5 rounded-full bg-aegis-border/40 cursor-pointer relative overflow-hidden group"
        >
          {/* Filled portion */}
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-aegis-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
          {/* Hover expand */}
          <div className="absolute inset-0 h-full group-hover:h-2 transition-all" />
        </div>

        {/* Time display */}
        <div className="flex justify-between text-[10px] text-aegis-text-dim font-mono" dir="ltr">
          <span>{formatTime(currentTime)}</span>
          <span>{loading ? '...' : formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Speed button */}
        <button
          onClick={cycleSpeed}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono text-aegis-text-dim hover:text-aegis-text-muted hover:bg-aegis-surface transition-colors"
          title={t('media.playbackSpeed')}
        >
          {playbackRate}x
        </button>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          className="p-1 rounded hover:bg-aegis-surface text-aegis-text-dim hover:text-aegis-text-muted transition-colors"
          title={muted ? t('media.unmute') : t('media.mute')}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
    </div>
  );
}

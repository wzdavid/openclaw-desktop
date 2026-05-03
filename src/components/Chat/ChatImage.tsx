import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Maximize2, X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// ChatImage — Image display with save, zoom, and lightbox
// Handles: base64, HTTP URLs, gateway media paths
// ═══════════════════════════════════════════════════════════

interface ChatImageProps {
  src: string;
  alt?: string;
  maxWidth?: string;
  maxHeight?: string;
  className?: string;
}

// ── Resolve image source ──
// Handles different source formats from OpenClaw/Gateway.
// Returns null for paths that require async IPC resolution (aegis-media:).
function resolveImageSrcSync(src: string): string | null {
  if (!src) return '';

  // Already a data URL or HTTP URL — use as-is
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
    return src;
  }

  // aegis-media: local file path — requires async IPC resolution
  if (src.startsWith('aegis-media:')) {
    return null;
  }

  // Relative gateway media path (e.g., /media/xxx.png)
  if (src.startsWith('/media/') || src.startsWith('/v1/media/')) {
    // Resolve against gateway URL (read from config, fallback to localhost)
    const gwUrl = localStorage.getItem('aegis-gateway-http') || 'http://127.0.0.1:18789';
    return `${gwUrl}${src}`;
  }

  return src;
}

/** Hook to resolve aegis-media: local file paths to base64 data URLs via Electron IPC */
function useResolvedImageSrc(src: string): string {
  const syncResolved = useMemo(() => resolveImageSrcSync(src), [src]);
  const [asyncSrc, setAsyncSrc] = useState<string>('');

  useEffect(() => {
    if (syncResolved !== null) return; // sync resolution worked — no IPC needed
    if (!src.startsWith('aegis-media:')) return;

    const filePath = src.replace('aegis-media:', '');
    const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    };
    const mime = mimeMap[ext] || 'image/png';

    setAsyncSrc('');
    window.aegis?.file?.read(filePath)
      .then((result: { base64: string } | null) => {
        if (result?.base64) {
          setAsyncSrc(`data:${mime};base64,${result.base64}`);
        }
      })
      .catch((err: unknown) => {
        console.error('[ChatImage] IPC file read failed:', filePath, err);
      });
  }, [src, syncResolved]);

  return syncResolved !== null ? syncResolved : asyncSrc;
}

// Keep backward-compatible alias for Lightbox (which doesn't need async)
function resolveImageSrc(src: string): string {
  return resolveImageSrcSync(src) ?? src;
}

// ── Extract filename from src ──
function extractFilename(src: string, alt?: string): string {
  if (alt && alt !== 'image' && alt !== 'attachment' && !alt.startsWith('http')) {
    // Sanitize alt as filename
    const sanitized = alt.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
    if (sanitized.match(/\.\w{2,4}$/)) return sanitized;
    return sanitized + '.png';
  }

  try {
    const url = new URL(src.startsWith('data:') ? 'file:///image.png' : src);
    const pathname = url.pathname;
    const name = pathname.split('/').pop();
    if (name && name.includes('.')) return name;
  } catch { /* ignore */ }

  return `image-${Date.now()}.png`;
}

// ── Save image via Electron IPC ──
async function saveImage(src: string, suggestedName: string): Promise<void> {
  try {
    // Use Electron IPC to save
    const result = await window.aegis?.image?.save(src, suggestedName);
    if (result?.success) {
      console.log('[ChatImage] Saved to:', result.path);
    }
  } catch (err) {
    console.error('[ChatImage] Save failed:', err);
    // Fallback: open in browser to allow right-click save
    window.open(src, '_blank');
  }
}

// ═══════════════════════════════════════════════════════════
// Lightbox (fullscreen image viewer)
// ═══════════════════════════════════════════════════════════

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

function Lightbox({ src, alt, onClose }: LightboxProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5));
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === '0') { setZoom(1); setOffset({ x: 0, y: 0 }); setRotation(0); }
      if (e.key === 'r' || e.key === 'R') setRotation(r => r + 90);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(z => Math.min(Math.max(z + delta, 0.25), 5));
  }, []);

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    });
  };

  const handleMouseUp = () => setDragging(false);

  const handleSave = () => {
    const filename = extractFilename(src, alt);
    saveImage(resolveImageSrc(src), filename);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'var(--aegis-bg-frosted)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onWheel={handleWheel}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-10"
        style={{ background: 'linear-gradient(to bottom, var(--aegis-bg-frosted-60), transparent)' }}>
        <span className="text-[12px] text-aegis-text-muted font-mono">
          {alt || 'Image'} — {Math.round(zoom * 100)}%
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
            className="p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-secondary hover:text-aegis-text transition-all" title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
            className="p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-secondary hover:text-aegis-text transition-all" title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => setRotation(r => r + 90)}
            className="p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-secondary hover:text-aegis-text transition-all" title="Rotate">
            <RotateCw size={16} />
          </button>
          <div className="w-px h-5 bg-[rgb(var(--aegis-overlay)/0.1)] mx-1" />
          <button onClick={handleSave}
            className="p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-secondary hover:text-aegis-text transition-all" title="Save">
            <Download size={16} />
          </button>
          <div className="w-px h-5 bg-[rgb(var(--aegis-overlay)/0.1)] mx-1" />
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.1)] text-aegis-text-secondary hover:text-aegis-text transition-all" title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Image */}
      <img
        src={resolveImageSrc(src)}
        alt={alt || ''}
        draggable={false}
        className="select-none transition-transform"
        style={{
          maxWidth: zoom === 1 ? '90vw' : 'none',
          maxHeight: zoom === 1 ? '85vh' : 'none',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
          transitionDuration: dragging ? '0ms' : '200ms',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-aegis-text-dim select-none">
        {t('media.imageControls')}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ChatImage — Main Component
// ═══════════════════════════════════════════════════════════

export function ChatImage({ src, alt, maxWidth = '100%', maxHeight = '400px', className }: ChatImageProps) {
  const { t } = useTranslation();
  const [showLightbox, setShowLightbox] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const resolvedSrc = useResolvedImageSrc(src);

  // Reset loaded/error state when src changes (e.g., async IPC result arrives)
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [resolvedSrc]);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const filename = extractFilename(src, alt);
    saveImage(resolvedSrc, filename);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLightbox(true);
  };

  if (error) return null;

  // Use <span> wrapper to allow nesting inside <p> (ReactMarkdown)
  return (
    <>
      <span
        className={clsx('relative inline-block my-2 group', className)}
        style={{ display: 'inline-block' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image */}
        <img
          src={resolvedSrc}
          alt={alt || ''}
          className="rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] cursor-pointer transition-all hover:border-[rgb(var(--aegis-overlay)/0.15)]"
          style={{ maxWidth, maxHeight, display: loaded ? 'block' : 'none' }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          onClick={handleExpand}
        />

        {/* Loading placeholder */}
        {!loaded && !error && (
          <span className="rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] flex items-center justify-center"
            style={{ display: 'inline-flex', width: 200, height: 150, background: 'rgb(var(--aegis-overlay) / 0.03)' }}>
            <span className="w-5 h-5 border-2 border-[rgb(var(--aegis-overlay)/0.1)] border-t-white/30 rounded-full animate-spin" style={{ display: 'inline-block' }} />
          </span>
        )}

        {/* Hover overlay with buttons */}
        {loaded && hovered && (
          <span className="absolute top-2 right-2 flex items-center gap-1 animate-fade-in" style={{ display: 'inline-flex', animation: 'fadeIn 0.15s ease-out' }}>
            <button
              onClick={handleSave}
              className="p-1.5 rounded-lg backdrop-blur-sm transition-all"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgb(var(--aegis-overlay) / 0.1)' }}
              title={t('media.saveImage')}
            >
              <Download size={14} className="text-aegis-text hover:text-aegis-text" />
            </button>
            <button
              onClick={handleExpand}
              className="p-1.5 rounded-lg backdrop-blur-sm transition-all"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgb(var(--aegis-overlay) / 0.1)' }}
              title={t('media.zoom')}
            >
              <Maximize2 size={14} className="text-aegis-text hover:text-aegis-text" />
            </button>
          </span>
        )}

        {/* Alt text */}
        {alt && alt !== 'image' && alt !== t('media.attachment') && (
          <span className="text-[11px] text-aegis-text-muted mt-1" style={{ display: 'block' }}>{alt}</span>
        )}
      </span>

      {/* Lightbox */}
      {showLightbox && (
        <Lightbox
          src={resolvedSrc}
          alt={alt}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  );
}

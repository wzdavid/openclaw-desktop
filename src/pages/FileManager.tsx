// ═══════════════════════════════════════════════════════════
// FileManager — Managed Files (uploads + outputs)
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FolderOpen,
  File,
  RefreshCw,
  Upload,
  ChevronRight,
  Eye,
  Loader2,
  Search,
  FileText,
  FileJson,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  AlertCircle,
  FolderSearch,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useChatStore } from '@/stores/chatStore';
import { PdfPreview } from './PdfPreview';
import clsx from 'clsx';

interface FileEntry {
  name: string;
  path: string;
  content: string;
  size: number;
  modified: string;
  ext: string;
  exists: boolean;
  kind?: 'uploads' | 'outputs' | 'voice' | string;
  sessionKey?: string;
  agentId?: string;
  workspaceRoot?: string;
  relativePath?: string;
  isCanonicalOutput?: boolean;
  visibility?: 'user-output' | 'noncanonical-output' | 'internal';
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'avif', 'svg']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v']);
const PDF_EXTS = new Set(['pdf']);
const HTML_EXTS = new Set(['html', 'htm']);
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdown']);
const TEXT_PREVIEW_EXTS = new Set([
  'md', 'markdown', 'mdown', 'txt', 'log',
  'json', 'jsonc', 'yaml', 'yml', 'toml',
  'ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'bash',
  'html', 'htm', 'css', 'csv', 'xml',
]);

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function getFileIcon(ext: string) {
  const size = 14;
  if (['json', 'jsonc'].includes(ext)) return <FileJson size={size} className="text-yellow-400/80" />;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'bash'].includes(ext)) return <FileCode size={size} className="text-blue-400/80" />;
  if (['md', 'txt', 'log'].includes(ext)) return <FileText size={size} className="text-green-400/80" />;
  if (IMAGE_EXTS.has(ext)) return <FileImage size={size} className="text-purple-400/80" />;
  if (AUDIO_EXTS.has(ext)) return <FileAudio size={size} className="text-pink-400/80" />;
  if (VIDEO_EXTS.has(ext)) return <FileVideo size={size} className="text-orange-400/80" />;
  if (PDF_EXTS.has(ext)) return <FileText size={size} className="text-red-400/80" />;
  return <File size={size} className="text-aegis-text-dim" />;
}

function getLanguageLabel(ext: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
    json: 'JSON', jsonc: 'JSON', md: 'Markdown', txt: 'Plain Text',
    py: 'Python', sh: 'Shell', bash: 'Shell', log: 'Log', yaml: 'YAML', yml: 'YAML',
    css: 'CSS', html: 'HTML', toml: 'TOML',
    png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP',
    bmp: 'BMP', svg: 'SVG', avif: 'AVIF', tiff: 'TIFF', tif: 'TIFF',
    mp3: 'MP3', wav: 'WAV', ogg: 'OGG', m4a: 'M4A', aac: 'AAC', flac: 'FLAC',
    mp4: 'MP4', mov: 'MOV', avi: 'AVI', mkv: 'MKV', pdf: 'PDF',
  };
  return map[ext] || ext.toUpperCase() || 'File';
}

const markdownPreviewComponents = {
  table({ children }: any) {
    return (
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
    );
  },
  code({ className, children, ...props }: any) {
    const codeString = String(children).replace(/\n$/, '');
    const isBlock = /language-(\w+)/.test(className || '') || codeString.includes('\n');
    if (isBlock) {
      return (
        <pre className="my-3 rounded-lg border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.04)] p-3 text-[12px] leading-relaxed text-aegis-text-muted overflow-auto">
          <code {...props}>{codeString}</code>
        </pre>
      );
    }
    return (
      <code
        className="text-[12px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: 'rgb(var(--aegis-primary) / 0.12)', color: 'rgb(var(--aegis-primary))' }}
        {...props}
      >
        {children}
      </code>
    );
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        onClick={async (e) => {
          e.preventDefault();
          if (!href) return;
          const openManagedPath =
            window.aegis?.managedFiles?.open ||
            window.aegis?.uploads?.open;
          const value = String(href).trim();
          if ((value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('file://')) && openManagedPath) {
            await openManagedPath(value);
            return;
          }
          window.open(value, '_blank');
        }}
        className="text-aegis-primary hover:text-aegis-primary/70 underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

function getKindLabel(t: any, kind?: string): string {
  if (kind === 'uploads' || kind === 'upload') return t('fileManager.kindUploads');
  if (kind === 'outputs' || kind === 'output') return t('fileManager.kindOutputs');
  if (kind === 'voice') return t('fileManager.kindVoice');
  return kind || '';
}

function getVisibilityLabel(t: any, visibility?: string): string {
  if (!visibility) return t('fileManager.visibility.unknown');
  return t(`fileManager.visibility.${visibility}`, visibility);
}

function FileItem({ file, selected, onClick }: { file: FileEntry; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-start transition-all group',
        selected
          ? 'bg-aegis-primary/15 border border-aegis-primary/30 text-aegis-text'
          : 'hover:bg-[rgb(var(--aegis-overlay)/0.04)] border border-transparent text-aegis-text-muted'
      )}
    >
      <span className="shrink-0">{getFileIcon(file.ext)}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 truncate text-[12px] font-medium">{file.name}</div>
          {(file.sessionKey || file.agentId || file.visibility) && (
            <div className="min-w-0 truncate text-[9.5px] text-aegis-text-dim">
              {[
                file.sessionKey ? `${t('fileManager.sessionLabel')}: ${file.sessionKey}` : null,
                file.agentId ? `${t('fileManager.agentLabel')}: ${file.agentId}` : null,
                file.visibility ? `${t('fileManager.visibilityLabel')}: ${getVisibilityLabel(t, file.visibility)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
        {file.kind === 'outputs' && file.isCanonicalOutput === false && (
          <span className="shrink-0 rounded border border-sky-400/20 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">
            {t('fileManager.outputRefShort')}
          </span>
        )}
        {file.visibility === 'internal' && (
          <span className="shrink-0 rounded border border-purple-400/20 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-300">
            {t('fileManager.visibility.internal')}
          </span>
        )}
        {!file.exists && (
          <span className="shrink-0 rounded border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
            {t('fileManager.missing')}
          </span>
        )}
      </div>
      <ChevronRight
        size={12}
        className={clsx(
          'shrink-0 transition-transform',
          selected ? 'text-aegis-primary opacity-100' : 'text-aegis-text-dim opacity-0 group-hover:opacity-50'
        )}
      />
    </button>
  );
}

function FileMeta({ file }: { file: FileEntry }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-[10px] text-aegis-text-dim font-mono">
      <span>{formatSize(file.size)}</span>
      <span>·</span>
      <span>{formatDate(file.modified)}</span>
      <span>·</span>
      <span className="text-aegis-text-muted">{getLanguageLabel(file.ext)}</span>
      {!file.exists && (
        <>
          <span>·</span>
          <span className="text-amber-300">{t('fileManager.missing')}</span>
        </>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-aegis-primary/10 border border-aegis-primary/20 flex items-center justify-center">
        <FolderSearch size={24} className="text-aegis-primary" />
      </div>
      <div>
        <div className="text-[14px] font-bold text-aegis-text mb-1">
          {title || t('fileManager.noFiles')}
        </div>
        <div className="text-[12px] text-aegis-text-dim max-w-[280px] leading-relaxed">
          {description || t('fileManager.noFilesDesc')}
        </div>
      </div>
    </div>
  );
}

function NoBridgeState() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-400/20 flex items-center justify-center">
        <AlertCircle size={24} className="text-yellow-400" />
      </div>
      <div>
        <div className="text-[14px] font-bold text-aegis-text mb-1">
          {t('fileManager.noBridge')}
        </div>
        <div className="text-[12px] text-aegis-text-dim max-w-[320px] leading-relaxed">
          {t('fileManager.noBridgeDesc')}
        </div>
      </div>
    </div>
  );
}

function PreviewPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <div className="w-12 h-12 rounded-xl bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] flex items-center justify-center">
        <Eye size={20} className="text-aegis-text-dim" />
      </div>
      <div className="text-[12px] text-aegis-text-dim">
        {t('fileManager.selectFile')}
      </div>
    </div>
  );
}

type FileManagerView = 'outputs' | 'uploads';

export function FileManagerPage() {
  const { t } = useTranslation();
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [query, setQuery] = useState('');
  const [hasAegis, setHasAegis] = useState<boolean | null>(null);
  const [cleanMessage, setCleanMessage] = useState('');
  const [binaryPreview, setBinaryPreview] = useState<{ dataUrl: string; mimeType: string; rawBase64?: string } | null>(null);
  const [binaryLoading, setBinaryLoading] = useState(false);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [activeView, setActiveView] = useState<FileManagerView>('outputs');
  const [sessionOnly, setSessionOnly] = useState(false);
  const [agentFilter, setAgentFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const isOutputKind = useCallback((kind?: string) => kind === 'outputs' || kind === 'output', []);

  const hasManagedBridge = useCallback(() => {
    const w = window as any;
    if (typeof w.aegis !== 'object' || w.aegis === null) return false;
    return Boolean(
      typeof w.aegis.managedFiles?.list === 'function'
    );
  }, []);

  const openFile = useCallback((file: FileEntry) => {
    return window.aegis?.managedFiles?.open?.(file.path)
      ?? window.aegis?.uploads?.open?.(file.path);
  }, []);

  const revealFile = useCallback((file: FileEntry) => {
    return window.aegis?.managedFiles?.reveal?.(file.path)
      ?? window.aegis?.uploads?.reveal?.(file.path);
  }, []);

  const saveFileAs = useCallback(async (file: FileEntry) => {
    if (typeof window.aegis?.managedFiles?.saveAs === 'function') {
      return window.aegis.managedFiles.saveAs({ path: file.path });
    }
    return window.aegis?.uploads?.saveAs?.({ path: file.path }) ?? { success: false, error: 'save_as_unavailable' };
  }, []);

  const deleteSelectedFile = useCallback(async (file: FileEntry) => {
    if (typeof window.aegis?.managedFiles?.delete === 'function') {
      return window.aegis.managedFiles.delete({ path: file.path });
    }
    if (isOutputKind(file.kind)) {
      return window.aegis?.managedFiles?.removeRef?.({ path: file.path, kind: 'outputs' });
    }
    return window.aegis?.uploads?.delete?.({ path: file.path });
  }, [isOutputKind]);

  const decodeBase64Utf8 = useCallback((base64: string) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }, []);

  useEffect(() => {
    const updateBridgeState = () => setHasAegis(hasManagedBridge());
    updateBridgeState();
    const retryFast = window.setTimeout(updateBridgeState, 250);
    const retrySlow = window.setTimeout(updateBridgeState, 1000);
    return () => {
      window.clearTimeout(retryFast);
      window.clearTimeout(retrySlow);
    };
  }, [hasManagedBridge]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const w = window as any;
      const managedKind = activeView === 'outputs' ? 'outputs' : 'uploads';
      const result = typeof w.aegis?.managedFiles?.list === 'function'
        ? await w.aegis.managedFiles.list({ sessionKey: sessionOnly ? activeSessionKey : undefined, kind: managedKind, limit: 1000, offset: 0 })
        : await w.aegis?.uploads?.list?.({ sessionKey: sessionOnly ? activeSessionKey : undefined, limit: 1000, offset: 0 });
      if (!result?.success) {
        setError(result?.error || t('fileManager.errRead'));
        setFiles([]);
        return;
      }
      const rawFiles: any[] = result.rows || [];
      const entries: FileEntry[] = rawFiles.map((f: any) => {
        const filePath = f.path ?? '';
        const parts = String(filePath).split(/[\\/]/);
        const managedIdx = (() => {
          const openclawIdx = parts.lastIndexOf('.openclaw-files');
          if (openclawIdx >= 0) return openclawIdx;
          return -1;
        })();
        const inferredKind = managedIdx >= 0 ? parts[managedIdx + 1] : undefined;
        const inferredAgentId = managedIdx >= 0 ? parts[managedIdx + 2] : undefined;
        const inferredSessionKey = managedIdx >= 0 ? parts[managedIdx + 3] : undefined;
        return {
          name: f.name ?? 'untitled',
          path: filePath,
          content: typeof f.content === 'string' ? f.content : '',
          size: typeof f.size === 'number' ? f.size : (f.content?.length ?? 0),
          modified: f.modified ?? f.mtime ?? '',
          ext: f.ext ?? getExt(f.name ?? ''),
          exists: typeof f.exists === 'boolean' ? f.exists : true,
          kind: f.kind ?? inferredKind,
          sessionKey: f.sessionKey ?? inferredSessionKey,
          agentId: f.agentId ?? inferredAgentId,
          workspaceRoot: typeof f.workspaceRoot === 'string' ? f.workspaceRoot : undefined,
          relativePath: typeof f.relativePath === 'string' ? f.relativePath : undefined,
          isCanonicalOutput: typeof f.isCanonicalOutput === 'boolean' ? f.isCanonicalOutput : undefined,
          visibility: typeof f.visibility === 'string' ? f.visibility : undefined,
        };
      });
      entries.sort((a, b) => {
        if (activeView === 'outputs') {
          const canonicalDelta = Number(b.isCanonicalOutput !== false) - Number(a.isCanonicalOutput !== false);
          if (canonicalDelta !== 0) return canonicalDelta;
        }
        const groupOrder = (ext: string) =>
          ['md', 'txt'].includes(ext) ? 0 :
          ['ts', 'tsx', 'js', 'jsx', 'py'].includes(ext) ? 1 :
          ['json', 'yaml', 'yml', 'toml'].includes(ext) ? 2 : 3;
        const g = groupOrder(a.ext) - groupOrder(b.ext);
        return g !== 0 ? g : a.name.localeCompare(b.name);
      });
      setFiles(entries);
    } catch (err: any) {
      setError(err?.message || t('fileManager.errUnknown'));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [t, activeSessionKey, activeView, sessionOnly]);

  useEffect(() => { if (hasAegis) loadFiles(); }, [hasAegis, loadFiles]);
  useEffect(() => { if (hasAegis) loadFiles(); }, [activeView, sessionOnly, hasAegis, loadFiles]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files.filter((file) => {
      if (normalizedQuery) {
        const matchesQuery =
          file.name.toLowerCase().includes(normalizedQuery) ||
          file.path.toLowerCase().includes(normalizedQuery);
        if (!matchesQuery) return false;
      }
      if (agentFilter !== 'all' && (file.agentId || '') !== agentFilter) return false;
      if (visibilityFilter !== 'all' && (file.visibility || 'user-output') !== visibilityFilter) return false;
      return true;
    });
  }, [files, query, agentFilter, visibilityFilter]);

  const availableAgents = useMemo(() => {
    const ids = new Set<string>();
    for (const file of files) {
      if (file.agentId) ids.add(file.agentId);
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const availableVisibilities = useMemo(() => {
    const labels = new Set<string>();
    for (const file of files) {
      if (file.visibility) labels.add(file.visibility);
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const lineCount = useMemo(() => {
    if (!selected?.content) return 0;
    return selected.content.split('\n').length;
  }, [selected]);

  useEffect(() => {
    setBinaryPreview(null);
    if (!selected) return;
    const isBinary = IMAGE_EXTS.has(selected.ext) || AUDIO_EXTS.has(selected.ext) || VIDEO_EXTS.has(selected.ext) || PDF_EXTS.has(selected.ext);
    if (!isBinary || !selected.exists) return;
    let cancelled = false;
    setBinaryLoading(true);
    const reader = (window as any).aegis?.managedFiles?.read
      || (window as any).aegis?.managedFiles?.readBinary
      || (window as any).aegis?.uploads?.read;
    reader?.({ path: selected.path })
      .then((res: any) => {
        if (cancelled || !res?.success || !res.data) return;
        const mimeType: string = res.mimeType;
        if (mimeType === 'application/pdf') setBinaryPreview({ dataUrl: '', mimeType, rawBase64: res.data });
        else setBinaryPreview({ dataUrl: `data:${mimeType};base64,${res.data}`, mimeType });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBinaryLoading(false); });
    return () => { cancelled = true; };
  }, [selected, isOutputKind]);

  useEffect(() => {
    if (!selected || !selected.exists) return;
    if (selected.content) return;
    const isBinary =
      IMAGE_EXTS.has(selected.ext) ||
      AUDIO_EXTS.has(selected.ext) ||
      VIDEO_EXTS.has(selected.ext) ||
      PDF_EXTS.has(selected.ext);
    if (isBinary) return;
    if (!TEXT_PREVIEW_EXTS.has(selected.ext)) return;

    let cancelled = false;
    setTextPreviewLoading(true);
    const reader = (window as any).aegis?.managedFiles?.read
      || (window as any).aegis?.managedFiles?.readBinary
      || (window as any).aegis?.uploads?.read;

    reader?.({ path: selected.path })
      .then((res: any) => {
        if (cancelled || !res?.success || !res?.data) return;
        const decoded = decodeBase64Utf8(String(res.data));
        setSelected((prev) => (prev && prev.path === selected.path ? { ...prev, content: decoded } : prev));
        setFiles((prev) => prev.map((file) => (
          file.path === selected.path ? { ...file, content: decoded } : file
        )));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTextPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, isOutputKind, decodeBase64Utf8]);

  if (hasAegis === false) {
    return (
      <PageTransition className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
          <div className="w-7 h-7 rounded-lg bg-aegis-primary/15 border border-aegis-primary/30 flex items-center justify-center">
            <FolderOpen size={15} className="text-aegis-primary" />
          </div>
          <span className="text-[15px] font-bold text-aegis-text">
            {t('fileManager.title')}
          </span>
        </div>
        <NoBridgeState />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="flex flex-col flex-1 min-h-0 h-full">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
        <div className="w-7 h-7 rounded-lg bg-aegis-primary/15 border border-aegis-primary/30 flex items-center justify-center shrink-0">
          <FolderOpen size={15} className="text-aegis-primary" />
        </div>
        <span className="text-[15px] font-bold text-aegis-text shrink-0">
          {t('fileManager.title')}
        </span>
        <div className="flex items-center gap-1 rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.04)] p-1">
          <button
            onClick={() => setActiveView('outputs')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors',
              activeView === 'outputs'
                ? 'bg-aegis-primary/15 text-aegis-primary border border-aegis-primary/25'
                : 'text-aegis-text-muted hover:text-aegis-text'
            )}
          >
            <FolderOpen size={13} />
            {t('fileManager.outputsView')}
          </button>
          <button
            onClick={() => setActiveView('uploads')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors',
              activeView === 'uploads'
                ? 'bg-aegis-primary/15 text-aegis-primary border border-aegis-primary/25'
                : 'text-aegis-text-muted hover:text-aegis-text'
            )}
          >
            <Upload size={13} />
            {t('fileManager.uploadsView')}
          </button>
        </div>
        <div className="min-w-0 flex-1 text-[11px] text-aegis-text-dim">
          {activeView === 'outputs'
            ? t('fileManager.outputsDesc')
            : t('fileManager.uploadsDesc')}
        </div>
        <button
          onClick={() => loadFiles()}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] text-[11px] text-aegis-text-muted hover:text-aegis-text-secondary transition-colors disabled:opacity-30"
          title={t('fileManager.refreshHint')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('fileManager.refresh')}
        </button>
      </div>

      {error && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-500/8 border-b border-red-400/15 text-[11px] text-red-400">
          <AlertCircle size={13} />
          {error}
        </div>
      )}
      {cleanMessage && !error && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-aegis-primary/8 border-b border-aegis-primary/20 text-[11px] text-aegis-text-muted">
          <Sparkles size={13} />
          {cleanMessage}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[260px] shrink-0 border-e border-[rgb(var(--aegis-overlay)/0.06)] flex flex-col min-h-0">
          <div className="shrink-0 p-2.5 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('fileManager.searchFiles')}
                className="w-full bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)] rounded-lg ps-7 pe-3 py-1.5 text-[11px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:border-aegis-accent/30 transition-colors"
              />
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-aegis-text-dim">
                <input
                  type="checkbox"
                  checked={sessionOnly}
                  onChange={(e) => setSessionOnly(e.target.checked)}
                  className="accent-[rgb(var(--aegis-primary))]"
                />
                {t('fileManager.sessionOnly')}
              </label>
              {activeView === 'outputs' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-aegis-text-dim">
                      {t('fileManager.filterAgent')}
                    </label>
                    <select
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                      className="w-full rounded-lg border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.04)] px-2 py-1.5 text-[11px] text-aegis-text focus:outline-none focus:border-aegis-accent/30"
                    >
                      <option value="all">{t('fileManager.filterAllAgents')}</option>
                      {availableAgents.map((agentId) => (
                        <option key={agentId} value={agentId}>{agentId}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-aegis-text-dim">
                      {t('fileManager.filterVisibility')}
                    </label>
                    <select
                      value={visibilityFilter}
                      onChange={(e) => setVisibilityFilter(e.target.value)}
                      className="w-full rounded-lg border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.04)] px-2 py-1.5 text-[11px] text-aegis-text focus:outline-none focus:border-aegis-accent/30"
                    >
                      <option value="all">{t('fileManager.filterAllVisibility')}</option>
                      {availableVisibilities.map((visibility) => (
                        <option key={visibility} value={visibility}>
                          {getVisibilityLabel(t, visibility)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {files.length > 0 && (
            <div className="shrink-0 px-3 py-1.5 text-[10px] text-aegis-text-dim border-b border-[rgb(var(--aegis-overlay)/0.04)]">
              {filtered.length === files.length
                ? `${files.length} ${t('fileManager.filesCount')}`
                : `${filtered.length} / ${files.length} ${t('fileManager.filesCount')}`}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-aegis-primary" />
              </div>
            ) : hasAegis === null ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={16} className="animate-spin text-aegis-text-dim" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={activeView === 'outputs'
                  ? t('fileManager.noOutputFiles')
                  : t('fileManager.noUploadFiles')}
                description={activeView === 'outputs'
                  ? t('fileManager.noOutputFilesDesc')
                  : t('fileManager.noUploadFilesDesc')}
              />
            ) : (
              filtered.map((file) => (
                <div key={file.path}>
                  <FileItem file={file} selected={selected?.path === file.path} onClick={() => setSelected(file)} />
                  {selected?.path === file.path && (
                    <div className="px-3 pb-1.5 -mt-0.5">
                      <FileMeta file={file} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selected ? (
            <>
              <div className="shrink-0 border-b border-[rgb(var(--aegis-overlay)/0.06)] px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getFileIcon(selected.ext)}
                    <span className="text-[13px] font-semibold text-aegis-text truncate">
                      {selected.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 text-[10px]">
                    <button
                      onClick={() => revealFile(selected)}
                      disabled={!selected.exists}
                      className="px-2 py-1 rounded bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text transition-colors disabled:opacity-40"
                    >
                      {t('fileManager.reveal')}
                    </button>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(selected.path);
                        setCleanMessage(t('fileManager.copyPathDone'));
                      }}
                      className="px-2 py-1 rounded bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text transition-colors"
                    >
                      {t('fileManager.copyPath')}
                    </button>
                    <button
                      onClick={async () => {
                        const res = await saveFileAs(selected);
                        if (res?.canceled) return;
                        if (!res?.success) {
                          setCleanMessage(res?.error || t('fileManager.saveAsFailed'));
                          return;
                        }
                        setCleanMessage(t('fileManager.saveAsDone'));
                      }}
                      disabled={!selected.exists}
                      className="px-2 py-1 rounded bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text transition-colors disabled:opacity-40"
                    >
                      {t('fileManager.saveAs')}
                    </button>
                    {selected.kind === 'outputs' || selected.kind === 'output' ? (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(t('fileManager.deleteOutputFileConfirm'));
                          if (!confirmed) return;
                          const res = await window.aegis?.managedFiles?.delete?.({ path: selected.path });
                          if (!res?.success) {
                            setCleanMessage(res?.error || t('fileManager.deleteFailed'));
                            return;
                          }
                          setSelected(null);
                          setCleanMessage(t('fileManager.deleteOutputFileDone'));
                          await loadFiles();
                        }}
                        disabled={!selected.exists}
                        className="px-2 py-1 rounded bg-red-500/10 border border-red-400/20 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                      >
                        {t('fileManager.deleteOutputFile')}
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const res = await deleteSelectedFile(selected);
                          if (!res?.success) {
                            setCleanMessage(res?.error || t('fileManager.deleteFailed'));
                            return;
                          }
                          setSelected(null);
                          setCleanMessage(t('fileManager.deleteDone'));
                          await loadFiles();
                        }}
                        className="px-2 py-1 rounded bg-red-500/10 border border-red-400/20 text-red-300 hover:bg-red-500/20 transition-colors"
                      >
                        {t('fileManager.deleteFile')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-aegis-text-dim font-mono">
                  {selected.kind === 'outputs' && selected.isCanonicalOutput === false && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-400/20 text-sky-300">
                      {t('fileManager.outputRef')}
                    </span>
                  )}
                  <span>{formatSize(selected.size)}</span>
                  <span>·</span>
                  <span className="text-aegis-text-muted">{getLanguageLabel(selected.ext)}</span>
                  {lineCount > 0 && (
                    <>
                      <span>·</span>
                      <span>{lineCount} {t('fileManager.lines')}</span>
                    </>
                  )}
                  <span className={clsx(
                    'px-1.5 py-0.5 rounded border',
                    selected.exists ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-amber-500/10 border-amber-400/20 text-amber-300'
                  )}>
                    {selected.exists ? t('fileManager.exists') : t('fileManager.missing')}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {binaryLoading || textPreviewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={22} className="animate-spin text-aegis-primary" />
                  </div>
                ) : IMAGE_EXTS.has(selected.ext) && binaryPreview ? (
                  <div className="flex items-center justify-center h-full p-6 bg-[rgb(var(--aegis-overlay)/0.02)]">
                    <img src={binaryPreview.dataUrl} alt={selected.name} className="max-w-full max-h-full object-contain rounded-lg shadow-lg" draggable={false} />
                  </div>
                ) : AUDIO_EXTS.has(selected.ext) && binaryPreview ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
                    <FileAudio size={40} className="text-pink-400/60" />
                    <span className="text-[13px] font-medium text-aegis-text">{selected.name}</span>
                    <audio controls src={binaryPreview.dataUrl} className="w-full max-w-md" />
                  </div>
                ) : VIDEO_EXTS.has(selected.ext) && binaryPreview ? (
                  <div className="flex items-center justify-center h-full p-4 bg-black/40">
                    <video controls src={binaryPreview.dataUrl} className="max-w-full max-h-full rounded-lg" />
                  </div>
                ) : PDF_EXTS.has(selected.ext) && binaryPreview?.rawBase64 ? (
                  <PdfPreview base64={binaryPreview.rawBase64} onOpenExternal={() => openFile(selected)} />
                ) : HTML_EXTS.has(selected.ext) && selected.content ? (
                  <div className="h-full bg-[rgb(var(--aegis-overlay)/0.03)] p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => openFile(selected)}
                        disabled={!selected.exists}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] text-[11px] text-aegis-text-muted hover:text-aegis-text transition-colors disabled:opacity-40"
                      >
                        <ExternalLink size={12} />
                        {t('fileManager.openInBrowser')}
                      </button>
                    </div>
                    <iframe title={selected.name} srcDoc={selected.content} sandbox="allow-scripts" className="w-full flex-1 rounded-lg border border-[rgb(var(--aegis-overlay)/0.08)] bg-white" />
                  </div>
                ) : MARKDOWN_EXTS.has(selected.ext) && selected.content ? (
                  <div className="markdown-body p-4 text-[13px] leading-relaxed text-aegis-text overflow-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownPreviewComponents}>
                      {selected.content}
                    </ReactMarkdown>
                  </div>
                ) : selected.content ? (
                  <pre className="p-4 text-[11.5px] leading-[1.65] font-mono text-aegis-text-muted whitespace-pre-wrap break-all select-text" style={{ minHeight: '100%', tabSize: 2 }}>
                    {selected.content}
                  </pre>
                ) : !selected.exists ? (
                  <div className="flex flex-col items-center justify-center gap-3 h-full text-center p-6">
                    <AlertCircle size={28} className="text-amber-300/80" />
                    <div className="text-[12px] text-aegis-text-dim">
                      {t('fileManager.missingFileDesc')}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 h-full text-center p-6">
                    <File size={28} className="text-aegis-text-dim opacity-40" />
                    <div className="text-[12px] text-aegis-text-dim">
                      {t('fileManager.binaryFile')}
                    </div>
                    <button
                      onClick={() => openFile(selected)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] text-[11px] text-aegis-text-muted hover:text-aegis-text transition-colors"
                    >
                      <ExternalLink size={12} />
                      {t('fileManager.openExternal')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <PreviewPlaceholder />
          )}
        </div>
      </div>
    </PageTransition>
  );
}

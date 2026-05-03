import { useState } from 'react';
import { Code2, Eye, FileText, FolderOpen, Info, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { Artifact, DecisionOption, FileRef, SessionEvent, WorkshopEvent } from '@/types/RenderBlock';
import { useNotificationStore } from '@/stores/notificationStore';

function isLocalFilePath(value?: string) {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  return v.startsWith('/') || v.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(v) || v.startsWith('file://');
}

function resolveWorkspacePath(rawPath: string): string {
  const cleaned = rawPath
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/^<+|>+$/g, '')
    .replace(/[，。；;:：]+$/g, '')
    .trim();
  if (isLocalFilePath(cleaned)) return cleaned;
  return cleaned.replace(/\/+$/, '');
}

function fileNameFromPath(rawPath: string) {
  const segments = rawPath.replace(/\/+$/, '').split(/[/\\]/);
  return segments.pop() || rawPath;
}

function resolveFilePath(file: FileRef): string {
  const directPath = resolveWorkspacePath(file.path || '');
  if (directPath && isLocalFilePath(directPath)) return directPath;
  if (file.workspaceRoot && file.relativePath) {
    const root = file.workspaceRoot.replace(/[\\/]+$/, '');
    const rel = resolveWorkspacePath(file.relativePath).replace(/^[/\\]+/, '');
    const joined = `${root}/${rel}`;
    if (isLocalFilePath(joined)) return joined;
  }
  return directPath;
}

async function resolveExistingFilePath(path: string): Promise<string> {
  const candidate = resolveWorkspacePath(path);
  if (!candidate) return candidate;

  const existsApi = window.aegis?.managedFiles?.exists;
  if (typeof existsApi !== 'function') return candidate;

  try {
    const result = await existsApi(candidate);
    if (result?.success && result.exists) return candidate;
  } catch {
    // keep original candidate when existence check fails
  }
  return candidate;
}

export function ArtifactResultCard({ artifact }: { artifact: Artifact }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const typeIcons: Record<string, string> = {
    html: '🌐',
    react: '⚛️',
    svg: '🎨',
    mermaid: '📊',
    code: '📝',
  };

  const handleOpen = async () => {
    setOpening(true);
    try {
      await window.aegis?.artifact?.open(artifact);
    } catch (err) {
      console.error('[ArtifactResultCard] Failed to open preview:', err);
    } finally {
      setTimeout(() => setOpening(false), 500);
    }
  };

  return (
    <div className="px-14 py-[2px]">
      <div className="overflow-hidden rounded-xl border border-aegis-primary/20 bg-aegis-primary/[0.04]">
        <div className="flex items-center justify-between gap-3 border-b border-aegis-primary/10 px-4 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0">{typeIcons[artifact.type] || '📄'}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-aegis-text">{artifact.title}</div>
              <div className="text-[10px] uppercase tracking-wider text-aegis-text-dim">{artifact.type}</div>
            </div>
          </div>
          <button
            onClick={handleOpen}
            disabled={opening}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
              'border-aegis-primary/20 bg-aegis-primary/15 text-aegis-primary hover:border-aegis-primary/40 hover:bg-aegis-primary/25',
              opening && 'opacity-60',
            )}
          >
            <Eye size={13} />
            {t('resultCards.preview', 'Preview')}
          </button>
        </div>
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-1.5 text-[11px] text-aegis-text-dim hover:text-aegis-text-muted">
            <Code2 size={11} />
            {t('resultCards.viewSource', 'View source')} ({artifact.content.length} {t('resultCards.chars', 'chars')})
          </summary>
          <div className="max-h-[200px] overflow-auto px-4 pb-3">
            <pre className="whitespace-pre-wrap rounded-lg bg-[rgb(var(--aegis-overlay)/0.08)] p-3 text-[11px] text-aegis-text-dim">
              {artifact.content.slice(0, 2000)}
              {artifact.content.length > 2000 ? '\n...(truncated)' : ''}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: FileRef }) {
  const { t } = useTranslation();
  const addToast = useNotificationStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
  const path = resolveFilePath(file);
  const name = fileNameFromPath(file.path);
  const detail = [file.meta, file.kind === 'voice' ? 'voice' : null, file.isCanonicalOutput === false ? 'noncanonical' : null]
    .filter(Boolean)
    .join(' · ');

  const handleOpen = async () => {
    try {
      const openPath = await resolveExistingFilePath(path);
      const openManagedPath = window.aegis?.managedFiles?.open || window.aegis?.uploads?.open;
      if (openManagedPath) {
        const result = await openManagedPath(openPath);
        if (result && typeof result === 'object' && 'success' in (result as any) && !(result as any).success) {
          console.warn('[FileResultCard] open file rejected:', openPath, (result as any).error);
          addToast('info', t('resultCards.open', 'Open'), t('errors.occurred', 'An error occurred'));
          return;
        }
        if (result && typeof result === 'object' && 'fallback' in (result as any)) {
          addToast('info', t('resultCards.open', 'Open'), t('fileManager.reveal', 'Reveal'));
          return;
        }
        return;
      }
      const url = openPath.startsWith('file://') ? openPath : `file://${openPath}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('[FileResultCard] open file failed:', err);
    }
  };

  const handleReveal = async () => {
    try {
      const revealPath = await resolveExistingFilePath(path);
      const revealManagedPath = window.aegis?.managedFiles?.reveal || window.aegis?.uploads?.reveal;
      const result = await revealManagedPath?.(revealPath);
      if (result && typeof result === 'object' && 'success' in (result as any) && !(result as any).success) {
        console.warn('[FileResultCard] reveal file rejected:', revealPath, (result as any).error);
      }
    } catch (err) {
      console.error('[FileResultCard] reveal file failed:', err);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      addToast(
        'info',
        t('fileManager.copyPathDone', 'Path copied'),
        path,
      );
    } catch (err) {
      console.warn('[FileResultCard] copy path failed:', err);
      addToast('info', t('resultCards.path', 'Path'), t('errors.occurred', 'An error occurred'));
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.04)] px-3 py-2">
      <FileText size={16} className="shrink-0 text-aegis-primary/80" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-aegis-text">{name}</div>
        <div className="truncate text-[10px] text-aegis-text-dim">{detail || path}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={handleOpen} className="rounded-md bg-aegis-primary/10 px-2 py-1 text-[10px] text-aegis-primary hover:bg-aegis-primary/20">
          {t('resultCards.open', 'Open')}
        </button>
        <button onClick={handleReveal} className="rounded-md px-2 py-1 text-[10px] text-aegis-text-dim hover:bg-[rgb(var(--aegis-overlay)/0.08)] hover:text-aegis-text">
          {t('resultCards.reveal', 'Reveal')}
        </button>
        <button onClick={handleCopy} className="rounded-md px-2 py-1 text-[10px] text-aegis-text-dim hover:bg-[rgb(var(--aegis-overlay)/0.08)] hover:text-aegis-text">
          {copied ? t('common.copied', 'Copied') : t('resultCards.path', 'Path')}
        </button>
      </div>
    </div>
  );
}

export function FileResultCard({ files }: { files: FileRef[] }) {
  const { t } = useTranslation();
  if (files.length === 0) return null;
  return (
    <div className="px-14 py-[2px]">
      <div className="rounded-xl border border-aegis-accent/15 bg-aegis-accent/[0.04] px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-aegis-text">
          <FolderOpen size={14} className="text-aegis-accent/80" />
          <span>{t('resultCards.files', 'Files')}</span>
          <span className="text-[10px] text-aegis-text-dim">{files.length}</span>
        </div>
        <div className="space-y-2">
          {files.map((file, index) => <FileRow key={`${file.path}-${index}`} file={file} />)}
        </div>
      </div>
    </div>
  );
}

export function DecisionCard({ options, onSelect }: { options: DecisionOption[]; onSelect: (value: string) => void }) {
  const { t } = useTranslation();
  if (options.length === 0) return null;
  return (
    <div className="px-14 py-[2px]">
      <div className="rounded-xl border border-aegis-primary/15 bg-aegis-primary/[0.04] px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-aegis-text">
          <Sparkles size={14} className="text-aegis-primary/80" />
          <span>{t('resultCards.nextStep', 'Next step')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              onClick={() => onSelect(option.value)}
              className="rounded-full border border-aegis-primary/20 bg-aegis-primary/10 px-3 py-1.5 text-[12px] font-medium text-aegis-primary transition-all hover:border-aegis-primary/35 hover:bg-aegis-primary/20 active:scale-95"
            >
              {option.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const sessionEventTone: Record<SessionEvent['kind'], string> = {
  compaction: 'border-amber-400/20 bg-amber-400/[0.04] text-amber-200',
  fallback: 'border-sky-400/20 bg-sky-400/[0.04] text-sky-200',
  retry: 'border-sky-400/20 bg-sky-400/[0.04] text-sky-200',
  reset: 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200',
  'token-warning': 'border-amber-400/20 bg-amber-400/[0.04] text-amber-200',
  'context-warning': 'border-amber-400/20 bg-amber-400/[0.04] text-amber-200',
  info: 'border-slate-400/20 bg-slate-400/[0.04] text-slate-200',
};

export function SessionEventCard({ event }: { event: SessionEvent }) {
  return (
    <div className="px-14 py-[2px]">
      <div className={clsx('rounded-xl border px-3 py-2', sessionEventTone[event.kind])}>
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 opacity-80" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">{event.kind.replace('-', ' ')}</div>
            <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">{event.text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkshopEventCard({ events }: { events: WorkshopEvent[] }) {
  const { t } = useTranslation();
  if (events.length === 0) return null;
  return (
    <div className="px-14 py-[2px]">
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-aegis-text">
          <Sparkles size={14} className="text-emerald-300/80" />
          <span>{t('resultCards.workshop', 'Workshop')}</span>
          <span className="text-[10px] text-aegis-text-dim">{events.length}</span>
        </div>
        <div className="space-y-2">
          {events.map((event, index) => (
            <div
              key={`${event.kind}-${index}`}
              className="rounded-lg border border-emerald-400/10 bg-[rgb(var(--aegis-overlay)/0.04)] px-3 py-2 text-[12px] text-aegis-text"
            >
              <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-300/70">{event.kind}</div>
              <div className="whitespace-pre-wrap break-words leading-relaxed">{event.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

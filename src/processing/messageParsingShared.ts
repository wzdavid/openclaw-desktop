import type { Artifact, FileRef, ImageRef, InlineButtonRow, SessionEvent, WorkshopEvent } from '@/types/RenderBlock';

const ARTIFACT_REGEX = /<openclaw_artifact\s+type="([^"]+)"\s+title="([^"]*)">([\s\S]*?)<\/openclaw_artifact>/g;
const QUICK_REPLY_REGEX = /\[\[button:([^\]]+)\]\]/g;
const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i;
const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i;
const MEDIA_ATTACHED_REGEX = /\[media attached:\s*([^\]]+?)\s*\]/g;

function isLocalFilePath(value?: string) {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  return (
    v.startsWith('/') ||
    v.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(v) ||
    v.startsWith('file://')
  );
}

function extractLabeledLocalPath(text: string) {
  const match = text.match(/^(?:[^\w\s]+\s*)?(?:位置|路径|文件路径|文件位置|PDF\s*报告|报告路径|file\s*path|path)[：:]\s*(.+?)\s*$/i);
  if (!match?.[1]) return '';
  return match[1]
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+\((?:\d+(?:\.\d+)?\s*(?:B|KB|MB|GB)|[^)]*?(?:mime|type|size)[^)]*)\)\s*$/i, '')
    .trim();
}

function extractSavedPathCandidate(text: string): string {
  const trigger = /(?:已保存到|已保存|保存到|写入到|输出到|saved to|saved|written to|stored at|output to)\s*/i.exec(text);
  if (!trigger || trigger.index < 0) return '';
  const tail = text.slice(trigger.index + trigger[0].length, trigger.index + trigger[0].length + 180);
  const candidateMatch = /`([^`]+?\.[A-Za-z0-9]{1,12})`|["']([^"']+?\.[A-Za-z0-9]{1,12})["']|((?:~\/|\/|[A-Za-z]:[\\/])?[A-Za-z0-9][^\s"'`，。；;:：!?(){}[\]]*?\.[A-Za-z0-9]{1,12})/i.exec(tail);
  const raw = String(candidateMatch?.[1] || candidateMatch?.[2] || candidateMatch?.[3] || '').trim();
  if (!raw) return '';
  return raw.replace(/^[^A-Za-z0-9~/.]+/, '').trim();
}

export function parseArtifacts(text: string): { cleanText: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let lastIndex = 0;
  const textParts: string[] = [];
  let match: RegExpExecArray | null;

  ARTIFACT_REGEX.lastIndex = 0;
  while ((match = ARTIFACT_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) textParts.push(before);
    }
    artifacts.push({
      type: match[1],
      title: match[2],
      content: match[3].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) textParts.push(remaining);
  }

  return {
    cleanText: textParts.join('\n\n'),
    artifacts,
  };
}

export function extractAttachmentImages(
  attachments?: Array<{ mimeType: string; content: string; fileName?: string }>,
): ImageRef[] {
  if (!attachments?.length) return [];
  return attachments
    .filter((att) => att.mimeType?.startsWith('image/'))
    .map((att) => ({
      src: att.content,
      alt: att.fileName || 'attachment',
      isAttachment: true,
    }));
}

export function extractInlineButtonRows(
  toolName: string,
  toolInput?: Record<string, unknown>,
): InlineButtonRow[] | null {
  if (toolName !== 'message') return null;
  if (!toolInput?.buttons || !Array.isArray(toolInput.buttons)) return null;

  const rows = (toolInput.buttons as unknown[])
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) =>
      (row as any[]).filter(
        (btn) => btn && typeof btn.text === 'string' && typeof btn.callback_data === 'string',
      ),
    )
    .filter((row) => row.length > 0)
    .map((row) => ({ buttons: row }));

  return rows.length > 0 ? rows : null;
}

export function extractQuickReplies(
  text: string,
): { cleanText: string; buttons: Array<{ text: string; value: string }> } {
  const buttons: Array<{ text: string; value: string }> = [];
  const cleanText = text
    .replace(QUICK_REPLY_REGEX, (_match, label: string) => {
      buttons.push({ text: label.trim(), value: label.trim() });
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanText, buttons };
}

export function extractFileRefs(text: string): { cleanText: string; files: FileRef[] } {
  const files: FileRef[] = [];
  const keptLines: string[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      keptLines.push(rawLine);
      continue;
    }

    const fileMatch = line.match(/^(?:[^\w\s]+\s*)?file:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/i);
    if (fileMatch) {
      files.push({ path: fileMatch[1].trim(), meta: fileMatch[2]?.trim(), kind: 'file' });
      continue;
    }

    const voiceMatch = line.match(/^🎤\s*\[voice\]\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
    if (voiceMatch) {
      files.push({ path: voiceMatch[1].trim(), meta: voiceMatch[2]?.trim() || 'voice', kind: 'voice' });
      continue;
    }

    const positionMatch = line.match(/^(?:[^\w\s]+\s*)?(?:文件)?位置[：:]\s*(.+?)\s*$/);
    if (positionMatch) {
      files.push({ path: positionMatch[1].trim(), meta: 'output', kind: 'path' });
      continue;
    }

    const labeledPath = extractLabeledLocalPath(line);
    if (labeledPath) {
      files.push({ path: labeledPath, meta: 'output', kind: 'path' });
      continue;
    }

    const savedPath = extractSavedPathCandidate(line);
    if (savedPath) {
      files.push({ path: savedPath, meta: 'output', kind: 'path' });
      continue;
    }

    if (isLocalFilePath(line) && /\.[A-Za-z0-9]{1,12}$/.test(line)) {
      files.push({ path: line, kind: 'path' });
      continue;
    }

    keptLines.push(rawLine);
  }

  return {
    cleanText: keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    files,
  };
}

function workshopKindFromLine(line: string): WorkshopEvent['kind'] {
  if (/^✅\s+Added task:/i.test(line)) return 'add';
  if (/^✅\s+Moved task/i.test(line)) return 'move';
  if (/^✅\s+Deleted task/i.test(line)) return 'delete';
  if (/^✅\s+Updated progress/i.test(line)) return 'progress';
  if (/^📋\s+Tasks:/i.test(line)) return 'list';
  if (/^⚠️/i.test(line)) return 'warning';
  return 'error';
}

function workshopKindFromAction(action: string): WorkshopEvent['kind'] {
  switch (action) {
    case 'add':
      return 'add';
    case 'move':
      return 'move';
    case 'delete':
      return 'delete';
    case 'progress':
      return 'progress';
    case 'list':
      return 'list';
    default:
      return 'warning';
  }
}

function workshopEventTextFromCommand(action: string, paramsStr: string): string {
  const params: Record<string, string> = {};
  const paramRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(paramsStr)) !== null) {
    params[match[1]] = match[2];
  }

  switch (action) {
    case 'add':
      return `✅ Added task: "${params.title || 'Untitled Task'}"`;
    case 'move':
      return params.status ? `✅ Moved task to ${params.status}` : '⚠️ Invalid move command';
    case 'delete':
      return params.id ? '✅ Deleted task' : '⚠️ Invalid delete command';
    case 'progress':
      return params.value ? `✅ Updated progress to ${params.value}%` : '⚠️ Invalid progress command';
    case 'list':
      return '📋 Tasks';
    default:
      return `⚠️ Unknown workshop command: ${action}`;
  }
}

export function extractWorkshopEvents(text: string): { cleanText: string; events: WorkshopEvent[] } {
  const events: WorkshopEvent[] = [];
  const lines = text
    .replace(/\[\[workshop:(\w+)((?:\s+\w+="[^"]*")*)\]\]/g, (_match, action: string, paramsStr: string) => {
      events.push({
        kind: workshopKindFromAction(action),
        text: workshopEventTextFromCommand(action, paramsStr || ''),
      });
      return '';
    })
    .split('\n');
  const keptLines: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      keptLines.push(rawLine);
      continue;
    }

    if (/^(?:✅\s+(?:Added|Moved|Deleted|Updated)\s+task|⚠️\s+(?:Invalid|Unknown)|❌\s+Error executing command:)/i.test(line)) {
      events.push({ kind: workshopKindFromLine(line), text: line });
      continue;
    }

    if (/^📋\s+Tasks:/i.test(line)) {
      const taskLines = [line];
      let cursor = i + 1;
      while (cursor < lines.length) {
        const next = lines[cursor];
        if (!next.trim()) break;
        if (!/^\s*-\s+\[.*\]/.test(next)) break;
        taskLines.push(next.trim());
        cursor += 1;
      }
      i = cursor - 1;
      events.push({ kind: 'list', text: taskLines.join('\n') });
      continue;
    }

    keptLines.push(rawLine);
  }

  return {
    cleanText: keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    events,
  };
}

function sessionKindFromNotice(line: string): SessionEvent['kind'] {
  if (/compact/i.test(line)) return 'compaction';
  if (/fallback/i.test(line)) return 'fallback';
  if (/retry/i.test(line)) return 'retry';
  if (/reset/i.test(line)) return 'reset';
  if (/token/i.test(line)) return 'token-warning';
  if (/context/i.test(line)) return 'context-warning';
  return 'info';
}

export function partitionSessionNotices(notices: string[]): { sessionEvents: SessionEvent[]; systemNotices: string[] } {
  const sessionEvents: SessionEvent[] = [];
  const systemNotices: string[] = [];

  for (const notice of notices) {
    if (/(compact|fallback|retry|reset|token|context|session)/i.test(notice)) {
      sessionEvents.push({ kind: sessionKindFromNotice(notice), text: notice });
      continue;
    }
    systemNotices.push(notice);
  }

  return { sessionEvents, systemNotices };
}

export function extractMediaAttached(text: string): { cleanText: string; images: ImageRef[] } {
  const images: ImageRef[] = [];
  const cleanText = text
    .replace(MEDIA_ATTACHED_REGEX, (_match, rawPath: string) => {
      const filePath = rawPath.trim();
      if (IMAGE_EXTS.test(filePath) && !VIDEO_EXTS.test(filePath)) {
        images.push({
          src: `aegis-media:${filePath}`,
          alt: 'attached image',
          isAttachment: true,
        });
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanText, images };
}

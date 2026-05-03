import { normalizeGatewayMessage } from './normalizeGatewayMessage';

type HistoryLikeMessage = {
  id: string;
  role?: string;
  content?: unknown;
  timestamp?: string;
  mediaUrl?: string;
  toolName?: string;
  toolCallId?: string;
  thinkingContent?: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safeStableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => safeStableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${safeStableStringify(record[key])}`).join(',')}}`;
  }
  return String(value);
}

function contentFingerprint(message: HistoryLikeMessage): string {
  const text = normalizeWhitespace(normalizeGatewayMessage(message).text);
  if (text) return text.slice(0, 500);
  return normalizeWhitespace(safeStableStringify(message.content)).slice(0, 500);
}

function messageExactKey(message: HistoryLikeMessage): string {
  return [
    message.role ?? '',
    message.toolCallId ?? '',
    message.toolName ?? '',
    contentFingerprint(message),
    message.timestamp ?? '',
    message.mediaUrl ?? '',
    normalizeWhitespace(message.thinkingContent ?? ''),
  ].join('|');
}

function messageIdentityKey(message: HistoryLikeMessage): string | null {
  const role = message.role ?? '';
  const toolCallId = message.toolCallId ?? '';
  const toolName = message.toolName ?? '';
  const content = contentFingerprint(message);
  const mediaUrl = message.mediaUrl ?? '';
  const thinking = normalizeWhitespace(message.thinkingContent ?? '');

  if (!role && !toolCallId && !toolName && !content && !mediaUrl && !thinking) {
    return null;
  }

  return [role, toolCallId, toolName, content, mediaUrl, thinking].join('|');
}

export function dedupeHistoryMessages<T extends HistoryLikeMessage>(messages: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const message of messages) {
    const key = messageExactKey(message);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(message);
  }
  return deduped;
}

export function reconcileHistoryMessageIds<T extends HistoryLikeMessage>(
  previous: T[],
  incoming: T[],
): T[] {
  if (previous.length === 0 || incoming.length === 0) {
    return incoming;
  }

  const idsByIdentity = new Map<string, string[]>();
  for (const message of previous) {
    const key = messageIdentityKey(message);
    if (!key) continue;
    const ids = idsByIdentity.get(key) ?? [];
    ids.push(message.id);
    idsByIdentity.set(key, ids);
  }

  return incoming.map((message) => {
    const key = messageIdentityKey(message);
    if (!key) return message;
    const ids = idsByIdentity.get(key);
    if (!ids || ids.length === 0) return message;
    const reusedId = ids.shift();
    if (!reusedId) return message;
    if (ids.length === 0) {
      idsByIdentity.delete(key);
    } else {
      idsByIdentity.set(key, ids);
    }
    if (reusedId === message.id) {
      return message;
    }
    return {
      ...message,
      id: reusedId,
    };
  });
}

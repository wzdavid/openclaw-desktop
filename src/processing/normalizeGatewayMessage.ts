import type {
  NormalizedMessage,
  NormalizedToolCall,
  NormalizedToolResult,
} from '@/types/NormalizedMessage';
import { extractText } from './TextCleaner';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeToolInput(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return record ?? undefined;
}

function extractTextParts(content: unknown): string[] {
  if (typeof content === 'string') {
    return [content];
  }
  if (!Array.isArray(content)) {
    const record = asRecord(content);
    if (!record) return [];
    const type = typeof record.type === 'string' ? record.type : '';
    if (type === 'thinking' || type === 'reasoning' || type === 'thought') {
      return [];
    }
    const directText = textFromUnknown(record.text) || textFromUnknown(record.content);
    return directText ? [directText] : [];
  }

  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }
    const block = asRecord(item);
    if (!block) continue;
    const type = typeof block.type === 'string' ? block.type : '';
    if (
      type === 'thinking' ||
      type === 'reasoning' ||
      type === 'thought' ||
      type === 'toolCall' ||
      type === 'tool_use' ||
      type === 'toolcall' ||
      type === 'toolResult' ||
      type === 'tool_result' ||
      type === 'toolresult'
    ) {
      continue;
    }
    const text =
      textFromUnknown(block.text) ||
      textFromUnknown(block.content);
    if (text) {
      parts.push(text);
    }
  }
  return parts;
}

/** Exported for ChatHandler — live thinking from content blocks during streams. */
export function extractThinkingContent(content: unknown): string | undefined {
  const parts: string[] = [];

  if (!Array.isArray(content)) {
    const record = asRecord(content);
    const type = typeof record?.type === 'string' ? record.type : '';
    if (type === 'thinking' || type === 'reasoning' || type === 'thought') {
      const text =
        textFromUnknown(record?.thinking) ||
        textFromUnknown(record?.text) ||
        textFromUnknown(record?.content);
      if (text) parts.push(text);
    }
  } else {
    for (const item of content) {
      const block = asRecord(item);
      if (!block) continue;
      const type = typeof block.type === 'string' ? block.type : '';
      if (type !== 'thinking' && type !== 'reasoning' && type !== 'thought') {
        continue;
      }
      const text =
        textFromUnknown(block.thinking) ||
        textFromUnknown(block.text) ||
        textFromUnknown(block.content);
      if (text) {
        parts.push(text);
      }
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n').trim() || undefined;
}

function extractToolCalls(content: unknown): NormalizedToolCall[] {
  if (!Array.isArray(content)) return [];
  const toolCalls: NormalizedToolCall[] = [];
  for (const item of content) {
    const block = asRecord(item);
    if (!block) continue;
    const type = typeof block.type === 'string' ? block.type : '';
    if (type !== 'toolCall' && type !== 'tool_use' && type !== 'toolcall') {
      continue;
    }
    toolCalls.push({
      name: textFromUnknown(block.name) || textFromUnknown(block.toolName) || 'unknown',
      input: normalizeToolInput(block.input ?? block.params ?? block.arguments),
    });
  }
  return toolCalls;
}

function extractToolResults(content: unknown): NormalizedToolResult[] {
  if (!Array.isArray(content)) return [];
  const toolResults: NormalizedToolResult[] = [];
  for (const item of content) {
    const block = asRecord(item);
    if (!block) continue;
    const type = typeof block.type === 'string' ? block.type : '';
    if (type !== 'toolResult' && type !== 'tool_result' && type !== 'toolresult') {
      continue;
    }
    const text =
      textFromUnknown(block.text) ||
      extractText(block.result ?? block.output ?? block.content ?? '');
    toolResults.push({
      name: textFromUnknown(block.name) || textFromUnknown(block.toolName) || 'unknown',
      text,
    });
  }
  return toolResults;
}

export function normalizeGatewayMessage(message: any): NormalizedMessage {
  const sessionKey =
    typeof message?.sessionKey === 'string' && message.sessionKey.trim()
      ? message.sessionKey
      : 'agent:main:main';
  const runId =
    typeof message?.runId === 'string' && message.runId.trim()
      ? message.runId
      : typeof message?.run_id === 'string' && message.run_id.trim()
        ? message.run_id
        : null;
  const role = typeof message?.role === 'string' ? message.role : 'unknown';
  const timestamp = message?.timestamp || message?.createdAt || new Date().toISOString();
  const id = message?.id || message?.messageId || `hist-${crypto.randomUUID()}`;
  const rawContent = message?.content;
  const isStreaming = Boolean(message?.isStreaming);
  const responseState =
    message?.responseState === 'error' || message?.responseState === 'aborted'
      ? message.responseState
      : isStreaming
        ? 'streaming'
        : 'final';

  const textParts = extractTextParts(rawContent);
  const toolCalls = extractToolCalls(rawContent);
  const toolResults = extractToolResults(rawContent);
  const thinkingFromContent = extractThinkingContent(rawContent);
  const text = textParts.join('');

  const contentBlocks = Array.isArray(rawContent)
    ? rawContent.filter((item) => asRecord(item))
    : [];
  const hasOnlyToolCallContent = contentBlocks.length > 0 && toolCalls.length === contentBlocks.length;
  const hasOnlyToolContent =
    contentBlocks.length > 0 &&
    contentBlocks.every((item) => {
      const block = asRecord(item);
      const type = typeof block?.type === 'string' ? block.type : '';
      return (
        type === 'toolCall' ||
        type === 'tool_use' ||
        type === 'toolcall' ||
        type === 'toolResult' ||
        type === 'tool_result' ||
        type === 'toolresult'
      );
    });

  const fallbackToolOutput =
    typeof message?.toolOutput === 'string'
      ? message.toolOutput
      : toolResults.map((item) => item.text).filter(Boolean).join('\n\n') || undefined;

  return {
    id,
    sessionKey,
    runId,
    role,
    timestamp,
    model: message?.model ?? null,
    mediaUrl: message?.mediaUrl || undefined,
    mediaType: message?.mediaType || undefined,
    isStreaming,
    responseState,
    attachments: message?.attachments,
    toolCallId: message?.toolCallId || message?.tool_call_id,
    toolName: message?.toolName || message?.name,
    toolInput: message?.toolInput || message?.input,
    toolOutput: fallbackToolOutput,
    toolStatus: message?.toolStatus,
    toolDurationMs: message?.toolDurationMs,
    thinkingContent: message?.thinkingContent || thinkingFromContent,
    fileRefs: Array.isArray(message?.fileRefs) ? message.fileRefs : undefined,
    decisionOptions: Array.isArray(message?.decisionOptions) ? message.decisionOptions : undefined,
    workshopEvents: Array.isArray(message?.workshopEvents) ? message.workshopEvents : undefined,
    sessionEvents: Array.isArray(message?.sessionEvents) ? message.sessionEvents : undefined,
    text,
    textParts,
    toolCalls,
    toolResults,
    hasOnlyToolCallContent,
    hasOnlyToolContent,
    rawContent,
  };
}

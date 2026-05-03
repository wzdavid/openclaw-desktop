import type { DecisionOption, FileRef, SessionEvent, WorkshopEvent } from './RenderBlock';

export interface NormalizedToolCall {
  name: string;
  input?: Record<string, unknown>;
}

export interface NormalizedToolResult {
  name: string;
  text: string;
}

export interface NormalizedMessage {
  id: string;
  sessionKey: string;
  runId?: string | null;
  role: string;
  timestamp: string;
  model?: string | null;
  mediaUrl?: string;
  mediaType?: string;
  isStreaming: boolean;
  responseState: 'streaming' | 'final' | 'error' | 'aborted';
  attachments?: Array<{
    mimeType: string;
    content: string;
    fileName?: string;
  }>;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: 'running' | 'done' | 'error';
  toolDurationMs?: number;
  thinkingContent?: string;
  fileRefs?: FileRef[];
  decisionOptions?: DecisionOption[];
  workshopEvents?: WorkshopEvent[];
  sessionEvents?: SessionEvent[];
  text: string;
  textParts: string[];
  toolCalls: NormalizedToolCall[];
  toolResults: NormalizedToolResult[];
  hasOnlyToolCallContent: boolean;
  hasOnlyToolContent: boolean;
  rawContent: unknown;
}

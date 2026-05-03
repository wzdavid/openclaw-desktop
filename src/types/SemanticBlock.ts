import type {
  Artifact,
  DecisionOption,
  FileRef,
  ImageRef,
  InlineButtonRow,
  MetaItem,
  SessionEvent,
  WorkshopEvent,
} from '@/types/RenderBlock';

interface SemanticBlockBase {
  id: string;
  sessionKey: string;
  runId?: string | null;
  sourceMessageId: string;
  timestamp: string;
  isStreaming: boolean;
  responseState: 'streaming' | 'final' | 'error' | 'aborted';
}

export interface MessageSemanticBlock extends SemanticBlockBase {
  type: 'message-content';
  role: 'user' | 'assistant';
  markdown: string;
  model?: string | null;
  artifacts: Artifact[];
  images: ImageRef[];
  audio?: string;
  meta?: MetaItem[];
  quickReplies?: Array<{ text: string; value: string }>;
}

export interface ThinkingSemanticBlock extends SemanticBlockBase {
  type: 'thinking';
  content: string;
}

export interface SystemNoteSemanticBlock extends SemanticBlockBase {
  type: 'system-note';
  content: string;
}

export interface ToolActivitySemanticBlock extends SemanticBlockBase {
  type: 'tool-activity';
  toolName: string;
  input?: Record<string, unknown>;
  output?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

export interface InlineButtonsSemanticBlock extends SemanticBlockBase {
  type: 'inline-buttons';
  rows: InlineButtonRow[];
}

export interface FileOutputSemanticBlock extends SemanticBlockBase {
  type: 'file-output';
  files: FileRef[];
}

export interface ArtifactSemanticBlock extends SemanticBlockBase {
  type: 'artifact';
  artifact: Artifact;
}

export interface DecisionSemanticBlock extends SemanticBlockBase {
  type: 'decision';
  options: DecisionOption[];
}

export interface WorkshopEventSemanticBlock extends SemanticBlockBase {
  type: 'workshop-event';
  events: WorkshopEvent[];
}

export interface SessionEventSemanticBlock extends SemanticBlockBase {
  type: 'session-event';
  event: SessionEvent;
}

export interface CompactionSemanticBlock extends SemanticBlockBase {
  type: 'compaction';
}

export type SemanticBlock =
  | MessageSemanticBlock
  | ThinkingSemanticBlock
  | SystemNoteSemanticBlock
  | ToolActivitySemanticBlock
  | InlineButtonsSemanticBlock
  | FileOutputSemanticBlock
  | ArtifactSemanticBlock
  | DecisionSemanticBlock
  | WorkshopEventSemanticBlock
  | SessionEventSemanticBlock
  | CompactionSemanticBlock;

import type { SemanticBlock } from './SemanticBlock';

export interface ResponseGroup {
  id: string;
  sessionKey: string;
  runId?: string | null;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  status: 'streaming' | 'final' | 'error' | 'aborted';
  startedAt: number;
  completedAt?: number;
  sourceMessageIds: string[];
  blocks: SemanticBlock[];
}

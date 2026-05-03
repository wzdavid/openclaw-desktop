import type { ResponseGroup } from '@/types/ResponseGroup';
import type { SemanticBlock } from '@/types/SemanticBlock';

function inferGroupRole(block: SemanticBlock): ResponseGroup['role'] {
  switch (block.type) {
    case 'message-content':
      return block.role;
    case 'compaction':
      return 'system';
    default:
      return 'assistant';
  }
}

function inferGroupStatus(blocks: SemanticBlock[]): ResponseGroup['status'] {
  if (blocks.some((block) => block.responseState === 'error')) return 'error';
  if (blocks.some((block) => block.responseState === 'aborted')) return 'aborted';
  return blocks.some((block) => block.isStreaming || block.responseState === 'streaming')
    ? 'streaming'
    : 'final';
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function buildIdentity(block: SemanticBlock): string {
  if (block.type === 'compaction') return `compaction:${block.sourceMessageId}`;
  const role = inferGroupRole(block);
  if (role === 'user') return `user:${block.sourceMessageId}`;
  if (role === 'system') return `system:${block.sourceMessageId}`;
  if (block.runId) return `run:${block.runId}`;
  return `message:${block.sourceMessageId}`;
}

function createGroup(block: SemanticBlock): ResponseGroup {
  const startedAt = parseTimestamp(block.timestamp);
  const status = inferGroupStatus([block]);
  return {
    id: `group:${block.sessionKey}:${buildIdentity(block)}`,
    sessionKey: block.sessionKey,
    runId: block.runId ?? null,
    role: inferGroupRole(block),
    timestamp: block.timestamp,
    status,
    startedAt,
    ...(status === 'streaming' ? {} : { completedAt: startedAt }),
    sourceMessageIds: [block.sourceMessageId],
    blocks: [block],
  };
}

function canAppend(last: ResponseGroup | null, block: SemanticBlock): boolean {
  if (!last) return false;
  if (block.type === 'compaction') return false;
  return last.id === `group:${block.sessionKey}:${buildIdentity(block)}`;
}

export function buildResponseGroups(blocks: SemanticBlock[]): ResponseGroup[] {
  const groups: ResponseGroup[] = [];

  for (const block of blocks) {
    const last = groups[groups.length - 1] ?? null;
    if (canAppend(last, block)) {
      last.blocks.push(block);
      if (!last.sourceMessageIds.includes(block.sourceMessageId)) {
        last.sourceMessageIds.push(block.sourceMessageId);
      }
      last.status = inferGroupStatus(last.blocks);
      if (last.status !== 'streaming') {
        last.completedAt = Math.max(...last.blocks.map((item) => parseTimestamp(item.timestamp)));
      } else {
        delete last.completedAt;
      }
    } else {
      groups.push(createGroup(block));
    }
  }

  return groups;
}

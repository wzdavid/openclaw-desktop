// ═══════════════════════════════════════════════════════════
// ContentParser — Converts raw chat data to RenderBlock[]
// The bridge between Gateway events and the UI.
// All content parsing happens HERE, not at render time.
// ═══════════════════════════════════════════════════════════

import type { RenderBlock } from '@/types/RenderBlock';
import { normalizeGatewayMessage } from './normalizeGatewayMessage';
import { buildSemanticBlocks, projectSemanticBlocksToRenderBlocks } from './buildSemanticBlocks';
import { buildResponseGroups } from './buildResponseGroups';
import { projectResponseGroupToRenderBlocks } from './projectResponseGroup';
export {
  parseArtifacts,
  extractAttachmentImages,
  extractQuickReplies,
} from './messageParsingShared';

// ─── Main Parsers ───

/**
 * Parse a single raw history message into RenderBlock(s).
 * One message can produce multiple blocks (e.g., tool call arrays).
 */
export function parseHistoryMessage(msg: any, toolIntentEnabled: boolean): RenderBlock[] {
  const normalized = normalizeGatewayMessage(msg);
  const semanticBlocks = buildSemanticBlocks(normalized, { toolIntentEnabled });
  const grouped = buildResponseGroups(semanticBlocks);
  return grouped.flatMap(projectResponseGroupToRenderBlocks);
}

/**
 * Convert a complete chat history response into RenderBlock[].
 * Single entry point for history → UI data.
 */
export function parseHistory(messages: any[], toolIntentEnabled: boolean): RenderBlock[] {
  const semanticBlocks = messages.flatMap((message) =>
    buildSemanticBlocks(normalizeGatewayMessage(message), { toolIntentEnabled }),
  );
  const groups = buildResponseGroups(semanticBlocks);
  return groups.flatMap((group) => projectSemanticBlocksToRenderBlocks(group.blocks));
}

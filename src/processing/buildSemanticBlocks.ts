import type { MetaItem, RenderBlock, ToolBlock, ThinkingBlock, MessageBlock, InlineButtonsBlock, CompactionBlock } from '@/types/RenderBlock';
import type { NormalizedMessage } from '@/types/NormalizedMessage';
import type {
  SemanticBlock,
  MessageSemanticBlock,
  ThinkingSemanticBlock,
  ToolActivitySemanticBlock,
  InlineButtonsSemanticBlock,
  CompactionSemanticBlock,
  FileOutputSemanticBlock,
  DecisionSemanticBlock,
  WorkshopEventSemanticBlock,
  SessionEventSemanticBlock,
} from '@/types/SemanticBlock';
import { stripDirectives, isNoise, stripUserMeta } from './TextCleaner';
import { autoDetectCode } from '@/utils/autoDetectCode';
import {
  parseArtifacts,
  extractFileRefs,
  extractAttachmentImages,
  extractInlineButtonRows,
  extractQuickReplies,
} from './messageParsingShared';

function systemEventKindFromText(text: string): 'compaction' | 'fallback' | 'retry' | 'reset' | 'token-warning' | 'context-warning' | 'info' {
  if (/compact/i.test(text)) return 'compaction';
  if (/fallback/i.test(text)) return 'fallback';
  if (/retry/i.test(text)) return 'retry';
  if (/reset/i.test(text)) return 'reset';
  if (/token/i.test(text)) return 'token-warning';
  if (/context/i.test(text)) return 'context-warning';
  return 'info';
}

function createBlockBase(normalized: NormalizedMessage, id = normalized.id) {
  return {
    id,
    sessionKey: normalized.sessionKey,
    runId: normalized.runId ?? null,
    sourceMessageId: normalized.id,
    timestamp: normalized.timestamp,
    isStreaming: normalized.isStreaming,
    responseState: normalized.responseState,
  };
}

function buildAssistantMeta(markdown: string): MetaItem[] {
  const meta: MetaItem[] = [];

  const workshopResults = markdown.match(/✅\s+(Added|Moved|Deleted|Updated)\s+task[^\n]*/g);
  if (workshopResults && workshopResults.length > 0) {
    meta.push({
      kind: 'workshop',
      label: `📋 Workshop (${workshopResults.length})`,
      content: workshopResults.join('\n'),
    });
  }
  return meta;
}

export function buildSemanticBlocks(
  normalized: NormalizedMessage,
  options: { toolIntentEnabled: boolean },
): SemanticBlock[] {
  void options.toolIntentEnabled; // reserved for future gating; tool cards always render from gateway/tool rows
  const role = normalized.role;
  const base = createBlockBase(normalized);

  if (role === 'compaction') {
    return [{ ...base, type: 'compaction' } satisfies CompactionSemanticBlock];
  }
  if (role === 'system') {
    const text = String(normalized.text || '').trim();
    if (!text) return [];
    if (/compact/i.test(text)) {
      return [{ ...base, type: 'compaction' } satisfies CompactionSemanticBlock];
    }
    return [{
      ...base,
      type: 'session-event',
      event: {
        kind: systemEventKindFromText(text),
        text,
      },
    } satisfies SessionEventSemanticBlock];
  }

  if (role === 'assistant' && normalized.hasOnlyToolCallContent && normalized.toolCalls.length > 0) {
    return normalized.toolCalls.map((tool, index) => ({
      ...createBlockBase(normalized, `${normalized.id}-call-${index}`),
      type: 'tool-activity',
      toolName: tool.name || 'unknown',
      input: tool.input ?? {},
      status: 'done',
    }) satisfies ToolActivitySemanticBlock);
  }

  if (role === 'toolResult' || role === 'tool') {
    const toolName = normalized.toolName || normalized.toolResults[0]?.name || 'unknown';
    const buttonRows = extractInlineButtonRows(toolName, normalized.toolInput);
    if (buttonRows) {
      return [{ ...base, type: 'inline-buttons', rows: buttonRows } satisfies InlineButtonsSemanticBlock];
    }
    return [{
      ...base,
      type: 'tool-activity',
      toolName,
      input: normalized.toolInput,
      output: (normalized.toolOutput || normalized.text || '').slice(0, 2000),
      status: normalized.toolStatus || 'done',
      durationMs: normalized.toolDurationMs,
    } satisfies ToolActivitySemanticBlock];
  }

  if (role !== 'user' && role !== 'assistant') return [];
  if (normalized.hasOnlyToolContent || normalized.toolCallId) return [];

  const baseText = role === 'user' ? stripUserMeta(normalized.text) : normalized.text;
  const cleanedText = stripDirectives(baseText);
  if (!cleanedText || isNoise(cleanedText)) return [];

  const markdown = role === 'assistant' ? autoDetectCode(cleanedText) : cleanedText;
  const { cleanText: textAfterArtifacts, artifacts } = parseArtifacts(markdown);
  let cleanText = textAfterArtifacts;

  let fileRefs = normalized.fileRefs ?? [];
  if (role === 'assistant' && !normalized.fileRefs?.length) {
    const fileRefResult = extractFileRefs(cleanText || markdown);
    fileRefs = fileRefResult.files;
    cleanText = fileRefResult.cleanText;
  }

  // Keep history replay behavior aligned with live-stream handling:
  // strip [[button:...]] markers from visible markdown and keep options structured.
  let parsedQuickReplies: Array<{ text: string; value: string }> = [];
  if (role === 'assistant') {
    const quickReplyResult = extractQuickReplies(cleanText || markdown);
    cleanText = quickReplyResult.cleanText;
    parsedQuickReplies = quickReplyResult.buttons;
  }

  const images = extractAttachmentImages(normalized.attachments);
  const meta = role === 'assistant'
    ? buildAssistantMeta(cleanText || markdown)
    : [];

  const blocks: SemanticBlock[] = [];
  if (role === 'assistant' && normalized.thinkingContent?.trim()) {
    blocks.push({
      ...createBlockBase(normalized, `${normalized.id}-thinking`),
      type: 'thinking',
      content: normalized.thinkingContent.trim(),
    } satisfies ThinkingSemanticBlock);
  }

  blocks.push({
    ...base,
    type: 'message-content',
    role,
    markdown: cleanText || markdown,
    model: role === 'assistant' ? (normalized.model ?? null) : null,
    artifacts,
    images,
    audio: normalized.mediaUrl || undefined,
    ...(meta.length > 0 ? { meta } : {}),
  } satisfies MessageSemanticBlock);

  if (role === 'assistant' && fileRefs.length > 0) {
    blocks.push({
      ...createBlockBase(normalized, `${normalized.id}-files`),
      type: 'file-output',
      files: fileRefs,
    } satisfies FileOutputSemanticBlock);
  }

  const decisionOptions =
    normalized.decisionOptions && normalized.decisionOptions.length > 0
      ? normalized.decisionOptions
      : parsedQuickReplies;

  if (decisionOptions.length > 0) {
    blocks.push({
      ...createBlockBase(normalized, `${normalized.id}-decision`),
      type: 'decision',
      options: decisionOptions,
    } satisfies DecisionSemanticBlock);
  }

  if (normalized.workshopEvents && normalized.workshopEvents.length > 0) {
    blocks.push({
      ...createBlockBase(normalized, `${normalized.id}-workshop`),
      type: 'workshop-event',
      events: normalized.workshopEvents,
    } satisfies WorkshopEventSemanticBlock);
  }

  if (normalized.sessionEvents && normalized.sessionEvents.length > 0) {
    for (const [index, event] of normalized.sessionEvents.entries()) {
      blocks.push({
        ...createBlockBase(normalized, `${normalized.id}-session-${index}`),
        type: 'session-event',
        event,
      } satisfies SessionEventSemanticBlock);
    }
  }

  return blocks;
}

export function projectSemanticBlocksToRenderBlocks(blocks: SemanticBlock[]): RenderBlock[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'compaction':
        return [{
          type: 'compaction',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
        } satisfies CompactionBlock];
      case 'tool-activity':
        return [{
          type: 'tool',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          toolName: block.toolName,
          input: block.input,
          output: block.output,
          status: block.status,
          durationMs: block.durationMs,
        } satisfies ToolBlock];
      case 'inline-buttons':
        return [{
          type: 'inline-buttons',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          rows: block.rows,
        } satisfies InlineButtonsBlock];
      case 'thinking':
        return [{
          type: 'thinking',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          content: block.content,
        } satisfies ThinkingBlock];
      case 'message-content':
        return [{
          type: 'message',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          role: block.role,
          markdown: block.markdown,
          model: block.model ?? null,
          artifacts: block.artifacts,
          images: block.images,
          audio: block.audio,
          ...(block.meta ? { meta: block.meta } : {}),
        } satisfies MessageBlock];
      case 'file-output':
        return [{
          type: 'file-output',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          files: block.files,
        }];
      case 'decision':
        return [{
          type: 'decision',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          options: block.options,
        }];
      case 'workshop-event':
        return [{
          type: 'workshop-event',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          events: block.events,
        }];
      case 'session-event':
        return [{
          type: 'session-event',
          id: block.id,
          timestamp: block.timestamp,
          isStreaming: block.isStreaming,
          event: block.event,
        }];
      default:
        return [];
    }
  });
}

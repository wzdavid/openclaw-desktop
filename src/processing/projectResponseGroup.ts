import type { RenderBlock } from '@/types/RenderBlock';
import type { ResponseGroup } from '@/types/ResponseGroup';
import { projectSemanticBlocksToRenderBlocks } from './buildSemanticBlocks';

export function projectResponseGroupToRenderBlocks(group: ResponseGroup): RenderBlock[] {
  return projectSemanticBlocksToRenderBlocks(group.blocks);
}

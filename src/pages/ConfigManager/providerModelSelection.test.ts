import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderSubmissionModelIds } from './providerModelSelection';

test('custom-like providers accept selected recommended models without manual model IDs', () => {
  const result = buildProviderSubmissionModelIds({
    isCustomLike: true,
    selectedModels: ['siliconflow/deepseek-ai/DeepSeek-V3'],
    customModelIds: [],
    extraModelIds: [],
  });

  assert.deepEqual(result, ['siliconflow/deepseek-ai/DeepSeek-V3']);
});

test('custom-like providers merge selected and manually entered model IDs', () => {
  const result = buildProviderSubmissionModelIds({
    isCustomLike: true,
    selectedModels: ['siliconflow/Qwen/Qwen2.5-VL-72B-Instruct'],
    customModelIds: [
      'siliconflow/deepseek-ai/DeepSeek-V3',
      'siliconflow/Qwen/Qwen2.5-VL-72B-Instruct',
    ],
    extraModelIds: ['ignored-for-custom-like'],
  });

  assert.deepEqual(result, [
    'siliconflow/Qwen/Qwen2.5-VL-72B-Instruct',
    'siliconflow/deepseek-ai/DeepSeek-V3',
  ]);
});

test('non-custom-like providers keep selected and extra model IDs', () => {
  const result = buildProviderSubmissionModelIds({
    isCustomLike: false,
    selectedModels: ['openai/gpt-4o'],
    customModelIds: ['ignored-for-standard'],
    extraModelIds: ['openai/gpt-4.1'],
  });

  assert.deepEqual(result, ['openai/gpt-4o', 'openai/gpt-4.1']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { GatewayRuntimeConfig } from './types';
import {
  normalizeAgentsForRuntime,
  normalizeModelsProvidersForRuntime,
} from './runtimeNormalization';

const generatedProviderCatalog = {
  qwen: [
    { id: 'qwen/qwen3.6-plus', supportsImage: true },
    { id: 'qwen/qwen3-coder-plus', supportsImage: false },
  ],
  openai: [
    { id: 'openai/gpt-4o', supportsImage: true },
  ],
};

function canonicalProviderId(providerId: string | undefined): string {
  return String(providerId ?? '').trim().toLowerCase();
}

function stripProviderPrefix(providerId: string, modelId: string | undefined): string {
  const trimmed = String(modelId ?? '').trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0) return trimmed;
  const head = trimmed.slice(0, slashIndex);
  if (canonicalProviderId(head) !== canonicalProviderId(providerId)) return trimmed;
  return trimmed.slice(slashIndex + 1);
}

function canonicalizeModelRef(modelRef: string | undefined): string | undefined {
  const trimmed = String(modelRef ?? '').trim();
  if (!trimmed) return undefined;
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0) return trimmed;
  const provider = canonicalProviderId(trimmed.slice(0, slashIndex));
  const model = trimmed.slice(slashIndex + 1).trim();
  return provider && model ? `${provider}/${model}` : trimmed;
}

test('normalizeModelsProvidersForRuntime clears explicit models to an empty array for known template provider models', () => {
  const providers = {
    qwen: {
      apiKey: 'secret',
      models: [
        { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus' },
      ],
    },
  };

  const normalized = normalizeModelsProvidersForRuntime({
    providers,
    agents: undefined,
    generatedProviderCatalog,
    canonicalProviderId,
    stripProviderPrefix,
    canonicalizeModelRef,
    getTemplateById: (providerId) => (providerId === 'qwen' ? { id: 'qwen' } : undefined),
  });

  assert.deepEqual(normalized, {
    qwen: {
      apiKey: 'secret',
      models: [],
    },
  });
});

test('normalizeModelsProvidersForRuntime keeps explicit models for unknown template provider models', () => {
  const providers = {
    qwen: {
      models: [
        { id: 'qwen/custom-vision-preview', name: 'Custom Vision Preview' },
      ],
    },
  };

  const normalized = normalizeModelsProvidersForRuntime({
    providers,
    agents: undefined,
    generatedProviderCatalog,
    canonicalProviderId,
    stripProviderPrefix,
    canonicalizeModelRef,
    getTemplateById: (providerId) => (providerId === 'qwen' ? { id: 'qwen' } : undefined),
  });

  assert.deepEqual(normalized, {
    qwen: {
      models: [
        {
          id: 'custom-vision-preview',
          name: 'Custom Vision Preview',
          supportsImage: false,
          input: ['text'],
        },
      ],
    },
  });
});

test('normalizeModelsProvidersForRuntime preserves explicit models for custom-like providers', () => {
  const providers = {
    custom: {
      models: [
        { id: 'openai/gpt-4o', name: 'GPT-4o' },
      ],
    },
    vllm: {
      models: [
        { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus' },
      ],
    },
    ollama: {
      models: [
        { id: 'llama3.2-vision', name: 'Llama 3.2 Vision' },
      ],
    },
  };

  const normalized = normalizeModelsProvidersForRuntime({
    providers,
    agents: undefined,
    generatedProviderCatalog,
    canonicalProviderId,
    stripProviderPrefix,
    canonicalizeModelRef,
    getTemplateById: (providerId) => (
      providerId === 'custom' || providerId === 'vllm' || providerId === 'ollama'
        ? { id: providerId }
        : undefined
    ),
  });

  assert.deepEqual(normalized, {
    custom: {
      models: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', supportsImage: false, input: ['text'] },
      ],
    },
    vllm: {
      models: [
        { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus', supportsImage: false, input: ['text'] },
      ],
    },
    ollama: {
      models: [
        { id: 'llama3.2-vision', name: 'Llama 3.2 Vision', supportsImage: false, input: ['text'] },
      ],
    },
  });
});

test('normalizeModelsProvidersForRuntime preserves explicit image capability for custom-like providers', () => {
  const providers = {
    custom: {
      models: [
        { id: 'local-vision', name: 'Local Vision', supportsImage: true },
      ],
    },
  };

  const normalized = normalizeModelsProvidersForRuntime({
    providers,
    agents: undefined,
    generatedProviderCatalog,
    canonicalProviderId,
    stripProviderPrefix,
    canonicalizeModelRef,
    getTemplateById: (providerId) => (providerId === 'custom' ? { id: 'custom' } : undefined),
  });

  assert.deepEqual(normalized, {
    custom: {
      models: [
        { id: 'local-vision', name: 'Local Vision', supportsImage: true, input: ['text', 'image'] },
      ],
    },
  });
});

test('normalizeAgentsForRuntime preserves explicit image model only when catalog marks it image-capable', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'qwen/qwen3-coder-plus' },
      imageModel: { primary: 'qwen/qwen3.6-plus' },
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers: undefined,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.equal(normalized?.defaults?.model?.primary, 'qwen/qwen3-coder-plus');
  assert.equal(normalized?.defaults?.imageModel?.primary, 'qwen/qwen3.6-plus');
});

test('normalizeAgentsForRuntime falls back to primary only when primary is image-capable', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'openai/gpt-4o' },
      imageModel: { primary: 'qwen/qwen3-coder-plus' },
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers: undefined,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.equal(normalized?.defaults?.imageModel?.primary, 'openai/gpt-4o');
});

test('normalizeAgentsForRuntime clears image model when neither requested nor primary model is image-capable', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'qwen/qwen3-coder-plus' },
      imageModel: { primary: 'qwen/qwen3-coder-plus' },
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers: undefined,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.equal(normalized?.defaults?.imageModel, undefined);
});

test('normalizeAgentsForRuntime keeps explicit image model for custom provider when config declares image support', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'custom/local-vision' },
      imageModel: { primary: 'custom/local-vision' },
    },
  };
  const providers = {
    custom: {
      models: [
        { id: 'local-vision', supportsImage: true },
      ],
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.equal(normalized?.defaults?.imageModel?.primary, 'custom/local-vision');
});

test('normalizeAgentsForRuntime strips UI-only agent model metadata before writing config', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      models: {
        'qwen/qwen3.6-plus': {
          alias: 'Qwen 3.6 Plus',
          supportsImage: true,
          input: ['text', 'image'],
          params: { temperature: 0.3 },
          streaming: true,
        },
      },
      model: { primary: 'qwen/qwen3.6-plus' },
      imageModel: { primary: 'qwen/qwen3.6-plus' },
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers: undefined,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.deepEqual(normalized?.defaults?.models, {
    'qwen/qwen3.6-plus': {
      alias: 'Qwen 3.6 Plus',
      params: { temperature: 0.3 },
      streaming: true,
    },
  });
});

test('normalizeAgentsForRuntime clears unknown custom image model when image support is not declared', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'custom/local-text' },
      imageModel: { primary: 'custom/local-vision' },
    },
  };
  const providers = {
    custom: {
      models: [
        { id: 'local-text' },
        { id: 'local-vision' },
      ],
    },
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.equal(normalized?.defaults?.imageModel, undefined);
});

test('normalizeAgentsForRuntime injects main agent when agents.list misses it', () => {
  const agents: GatewayRuntimeConfig['agents'] = {
    defaults: {
      model: { primary: 'qwen/qwen3.6-plus' },
    },
    list: [
      { id: 'investment', name: 'Investment Agent' },
    ],
  };

  const normalized = normalizeAgentsForRuntime({
    agents,
    providers: undefined,
    generatedProviderCatalog,
    canonicalizeModelRef,
  });

  assert.deepEqual(normalized?.list?.map((agent) => agent.id), ['main', 'investment']);
});

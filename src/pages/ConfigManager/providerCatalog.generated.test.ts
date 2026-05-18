import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERATED_PROVIDER_CATALOG } from '@/generated/providerCatalog.generated';

test('moonshot catalog stays separate from Kimi Coding', () => {
  const moonshotModels = (GENERATED_PROVIDER_CATALOG.moonshot ?? []).map((entry) => entry.id);
  const kimiCodingModels = (GENERATED_PROVIDER_CATALOG['kimi-coding'] ?? []).map((entry) => entry.id);

  assert.deepEqual(moonshotModels, [
    'moonshot/kimi-k2-thinking',
    'moonshot/kimi-k2-thinking-turbo',
    'moonshot/kimi-k2-turbo',
    'moonshot/kimi-k2.5',
    'moonshot/kimi-k2.6',
  ]);
  assert.deepEqual(kimiCodingModels, ['kimi-coding/k2p5']);
  assert.ok(!moonshotModels.includes('moonshot/k2p5'));
});

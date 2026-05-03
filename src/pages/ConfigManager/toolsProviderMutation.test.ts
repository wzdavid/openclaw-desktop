import test from 'node:test';
import assert from 'node:assert/strict';
import type { OpenClawConfig } from './types';
import {
  removeFetchProviderFromConfig,
  removeSearchProviderFromConfig,
} from './toolsProviderMutation';

function createConfig(partial: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return { ...partial };
}

test('removeSearchProvider: clears active provider when no alternatives', () => {
  const config = createConfig({
    tools: {
      web: {
        search: { provider: 'brave', enabled: true, apiKey: 'legacy' },
      },
    },
  });

  const next = removeSearchProviderFromConfig(config, 'brave');
  assert.equal(next.tools?.web?.search?.provider, undefined);
  assert.equal(next.tools?.web?.search?.apiKey, undefined);
});

test('removeSearchProvider: keeps active provider when removing non-active', () => {
  const config = createConfig({
    env: {
      vars: {
        BRAVE_API_KEY: 'brv',
        EXA_API_KEY: 'exa',
      },
    },
    tools: {
      web: {
        search: { provider: 'brave', enabled: true },
      },
    },
  });

  const next = removeSearchProviderFromConfig(config, 'exa');
  assert.equal(next.tools?.web?.search?.provider, 'brave');
});

test('removeFetchProvider: clears active fetch provider when removed', () => {
  const config = createConfig({
    tools: {
      web: {
        fetch: { provider: 'firecrawl', enabled: true },
      },
    },
    plugins: {
      entries: {
        firecrawl: {
          enabled: true,
          config: { webFetch: { apiKey: 'fc' } },
        },
      },
    },
  });

  const next = removeFetchProviderFromConfig(config, 'firecrawl');
  assert.equal(next.tools?.web?.fetch?.provider, undefined);
  assert.equal(next.plugins?.entries?.firecrawl?.config?.webFetch, undefined);
});


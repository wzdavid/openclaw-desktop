import test from 'node:test';
import assert from 'node:assert/strict';
import type { OpenClawConfig } from './types';
import {
  applyPreferredWebProviders,
  resolveConfiguredWebFetchProviders,
  resolveConfiguredWebSearchProviders,
} from './toolsProviderDetection';

function createConfig(partial: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return {
    ...partial,
  };
}

test('search providers: detects env-based providers', () => {
  const config = createConfig({
    env: {
      vars: {
        BRAVE_API_KEY: 'brv-123',
        EXA_API_KEY: 'exa-123',
      },
    },
  });

  const providers = resolveConfiguredWebSearchProviders(config);
  assert.equal(providers.includes('brave'), true);
  assert.equal(providers.includes('exa'), true);
});

test('search providers: detects auth-profile-based shared providers', () => {
  const config = createConfig({
    auth: {
      profiles: {
        'google:main': { provider: 'google', mode: 'api_key' },
        'xai:main': { provider: 'xai', mode: 'api_key' },
      },
    },
  });

  const providers = resolveConfiguredWebSearchProviders(config);
  assert.equal(providers.includes('gemini'), true);
  assert.equal(providers.includes('grok'), true);
});

test('search providers: detects plugin-based providers', () => {
  const config = createConfig({
    plugins: {
      entries: {
        searxng: {
          enabled: true,
          config: {
            webSearch: {
              baseUrl: 'https://searx.example.com',
            },
          },
        },
        tavily: {
          enabled: true,
          config: {
            webSearch: {
              apiKey: 'tvly-123',
            },
          },
        },
      },
    },
  });

  const providers = resolveConfiguredWebSearchProviders(config);
  assert.equal(providers.includes('searxng'), true);
  assert.equal(providers.includes('tavily'), true);
});

test('search providers: keeps current provider visible', () => {
  const config = createConfig({
    tools: {
      web: {
        search: {
          provider: 'duckduckgo',
        },
      },
    },
  });

  const providers = resolveConfiguredWebSearchProviders(config);
  assert.equal(providers.includes('duckduckgo'), true);
});

test('fetch providers: detects firecrawl from env/plugin/current', () => {
  const fromEnv = createConfig({ env: { vars: { FIRECRAWL_API_KEY: 'fc-env' } } });
  const fromPlugin = createConfig({
    plugins: {
      entries: {
        firecrawl: {
          enabled: true,
          config: { webFetch: { apiKey: 'fc-plugin' } },
        },
      },
    },
  });
  const fromCurrent = createConfig({
    tools: {
      web: { fetch: { provider: 'firecrawl' } },
    },
  });

  assert.deepEqual(resolveConfiguredWebFetchProviders(fromEnv), ['firecrawl']);
  assert.deepEqual(resolveConfiguredWebFetchProviders(fromPlugin), ['firecrawl']);
  assert.deepEqual(resolveConfiguredWebFetchProviders(fromCurrent), ['firecrawl']);
});

test('applyPreferredWebProviders: sets unique search/fetch provider when unset', () => {
  const config = createConfig({
    env: { vars: { BRAVE_API_KEY: 'brv-123' } },
    plugins: {
      entries: {
        firecrawl: {
          enabled: true,
          config: { webFetch: { apiKey: 'fc-123' } },
        },
      },
    },
    tools: { web: { search: {}, fetch: {} } },
  });

  const next = applyPreferredWebProviders(config);
  assert.equal(next.tools?.web?.search?.provider, 'brave');
  assert.equal(next.tools?.web?.fetch?.provider, 'firecrawl');
});

test('applyPreferredWebProviders: keeps current search provider when still valid', () => {
  const config = createConfig({
    env: { vars: { BRAVE_API_KEY: 'brv-123' } },
    tools: { web: { search: { provider: 'brave' } } },
  });

  const next = applyPreferredWebProviders(config);
  assert.equal(next.tools?.web?.search?.provider, 'brave');
});


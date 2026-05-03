import type { OpenClawConfig } from './types';

const WEB_SEARCH_PLUGIN_BY_PROVIDER: Record<string, string> = {
  brave: 'brave',
  exa: 'exa',
  firecrawl: 'firecrawl',
  gemini: 'google',
  grok: 'xai',
  kimi: 'moonshot',
  minimax: 'minimax',
  perplexity: 'perplexity',
  searxng: 'searxng',
  tavily: 'tavily',
};

const SEARCH_PROVIDER_ENV_RULES: Record<string, string[]> = {
  brave: ['BRAVE_API_KEY'],
  exa: ['EXA_API_KEY'],
  firecrawl: ['FIRECRAWL_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  grok: ['XAI_API_KEY'],
  kimi: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
  minimax: ['MINIMAX_CODE_PLAN_KEY', 'MINIMAX_CODING_API_KEY', 'MINIMAX_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY', 'OPENROUTER_API_KEY'],
  searxng: ['SEARXNG_BASE_URL'],
  tavily: ['TAVILY_API_KEY'],
};

function hasAnyAuthProfile(config: OpenClawConfig, providerId: string): boolean {
  const profiles = config.auth?.profiles ?? {};
  return Object.keys(profiles).some((k) => k.split(':')[0] === providerId);
}

function hasEnvValue(config: OpenClawConfig, envKey: string): boolean {
  return Boolean(String(config.env?.vars?.[envKey] ?? '').trim());
}

function hasPluginWebSearchApiKey(config: OpenClawConfig, provider: string): boolean {
  const pluginId = WEB_SEARCH_PLUGIN_BY_PROVIDER[provider];
  if (!pluginId) return false;
  return Boolean(String(config.plugins?.entries?.[pluginId]?.config?.webSearch?.apiKey ?? '').trim());
}

function hasPluginWebSearchBaseUrl(config: OpenClawConfig, provider: string): boolean {
  const pluginId = WEB_SEARCH_PLUGIN_BY_PROVIDER[provider];
  if (!pluginId) return false;
  return Boolean(String(config.plugins?.entries?.[pluginId]?.config?.webSearch?.baseUrl ?? '').trim());
}

export function resolveConfiguredWebSearchProviders(config: OpenClawConfig): string[] {
  const configured = new Set<string>();

  for (const [provider, envKeys] of Object.entries(SEARCH_PROVIDER_ENV_RULES)) {
    if (envKeys.some((envKey) => hasEnvValue(config, envKey))) {
      configured.add(provider);
    }
  }

  if (hasPluginWebSearchApiKey(config, 'firecrawl')) configured.add('firecrawl');
  if (hasPluginWebSearchApiKey(config, 'tavily')) configured.add('tavily');
  if (hasPluginWebSearchBaseUrl(config, 'searxng')) configured.add('searxng');

  if (hasAnyAuthProfile(config, 'google')) configured.add('gemini');
  if (hasAnyAuthProfile(config, 'xai')) configured.add('grok');
  if (hasAnyAuthProfile(config, 'moonshot') || hasAnyAuthProfile(config, 'kimi')) configured.add('kimi');
  if (hasAnyAuthProfile(config, 'minimax')) configured.add('minimax');
  if (hasAnyAuthProfile(config, 'perplexity')) configured.add('perplexity');
  if (hasAnyAuthProfile(config, 'ollama')) configured.add('ollama');

  const current = config.tools?.web?.search?.provider;
  if (current) configured.add(current);

  return Array.from(configured);
}

export function resolveConfiguredWebFetchProviders(config: OpenClawConfig): string[] {
  const hasFirecrawl =
    hasEnvValue(config, 'FIRECRAWL_API_KEY') ||
    Boolean(String(config.plugins?.entries?.firecrawl?.config?.webFetch?.apiKey ?? '').trim()) ||
    config.tools?.web?.fetch?.provider === 'firecrawl';

  return hasFirecrawl ? ['firecrawl'] : [];
}

export function applyPreferredWebProviders(config: OpenClawConfig): OpenClawConfig {
  const next = structuredClone(config);
  const searchConfigured = resolveConfiguredWebSearchProviders(next);
  const fetchConfigured = resolveConfiguredWebFetchProviders(next);
  const currentSearch = next.tools?.web?.search?.provider;
  const currentFetch = next.tools?.web?.fetch?.provider;

  if (searchConfigured.length === 1) {
    const only = searchConfigured[0];
    const shouldSet = !currentSearch || currentSearch === 'auto' || !searchConfigured.includes(currentSearch);
    if (shouldSet) {
      next.tools = {
        ...next.tools,
        web: {
          ...next.tools?.web,
          search: { ...next.tools?.web?.search, provider: only },
        },
      };
    }
  }

  if (fetchConfigured.length === 1) {
    const only = fetchConfigured[0];
    const shouldSet = !currentFetch || currentFetch === 'auto' || !fetchConfigured.includes(currentFetch);
    if (shouldSet) {
      next.tools = {
        ...next.tools,
        web: {
          ...next.tools?.web,
          fetch: { ...next.tools?.web?.fetch, provider: only },
        },
      };
    }
  }

  return next;
}


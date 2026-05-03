import type { OpenClawConfig } from './types';
import {
  resolveConfiguredWebFetchProviders,
  resolveConfiguredWebSearchProviders,
} from './toolsProviderDetection';

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

export function removeSearchProviderFromConfig(
  prev: OpenClawConfig,
  provider: string,
): OpenClawConfig {
  const next = structuredClone(prev);
  const pluginId = WEB_SEARCH_PLUGIN_BY_PROVIDER[provider];
  const plugin = pluginId ? next.plugins?.entries?.[pluginId] : undefined;
  if (plugin?.config?.webSearch) {
    delete plugin.config.webSearch;
  }

  const configured = resolveConfiguredWebSearchProviders(next).filter((id) => id !== provider);
  const isCurrent = next.tools?.web?.search?.provider === provider;
  if (isCurrent || configured.length === 0) {
    next.tools = next.tools ?? {};
    next.tools.web = next.tools.web ?? {};
    next.tools.web.search = {
      ...next.tools.web.search,
      provider: configured[0],
      apiKey: undefined,
    };
  }

  return next;
}

export function removeFetchProviderFromConfig(
  prev: OpenClawConfig,
  provider: string,
): OpenClawConfig {
  const next = structuredClone(prev);
  const firecrawlPlugin = next.plugins?.entries?.firecrawl;
  if (provider === 'firecrawl' && firecrawlPlugin?.config?.webFetch) {
    delete firecrawlPlugin.config.webFetch;
  }

  const configured = resolveConfiguredWebFetchProviders(next).filter((id) => id !== provider);
  const isCurrent = next.tools?.web?.fetch?.provider === provider;
  if (isCurrent || configured.length === 0) {
    next.tools = next.tools ?? {};
    next.tools.web = next.tools.web ?? {};
    next.tools.web.fetch = {
      ...next.tools.web.fetch,
      provider: configured[0],
    };
  }

  return next;
}


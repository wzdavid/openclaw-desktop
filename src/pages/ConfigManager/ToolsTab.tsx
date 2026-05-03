import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import type { OpenClawConfig, ToolsConfig } from './types';
import { resolveConfiguredWebFetchProviders, resolveConfiguredWebSearchProviders } from './toolsProviderDetection';
import { removeFetchProviderFromConfig, removeSearchProviderFromConfig } from './toolsProviderMutation';
import { FormField, SelectField, ToggleSwitch, ChipInput, MaskedInput } from './components';

interface ToolsTabProps {
  config: OpenClawConfig;
  onChange: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void;
}

type ModalMode = 'search' | 'fetch' | null;
type SharedMode = 'shared' | 'independent';
type ToolsPatch = Partial<ToolsConfig>;
type ExecPatch = Partial<NonNullable<ToolsConfig['exec']>>;
type WebSearchPatch = Partial<NonNullable<NonNullable<ToolsConfig['web']>['search']>>;
type WebSearchCodexPatch = Partial<NonNullable<NonNullable<WebSearchPatch['openaiCodex']>>>;
type WebSearchCodexLocationPatch = Partial<
  NonNullable<NonNullable<NonNullable<WebSearchPatch['openaiCodex']>['userLocation']>>
>;
type WebFetchPatch = Partial<NonNullable<NonNullable<ToolsConfig['web']>['fetch']>>;
type PluginEntriesMap = NonNullable<NonNullable<OpenClawConfig['plugins']>['entries']>;

const INPUT =
  'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2 ' +
  'text-aegis-text text-sm outline-none focus:border-aegis-primary transition-colors duration-200';

const SEARCH_PROVIDER_LABELS: Record<string, string> = {
  brave: 'Brave',
  duckduckgo: 'DuckDuckGo',
  exa: 'Exa',
  firecrawl: 'Firecrawl',
  gemini: 'Gemini',
  grok: 'Grok',
  kimi: 'Kimi',
  minimax: 'MiniMax Search',
  ollama: 'Ollama Web Search',
  perplexity: 'Perplexity',
  searxng: 'SearXNG',
  tavily: 'Tavily',
};

const ALL_SEARCH_PROVIDERS = Object.keys(SEARCH_PROVIDER_LABELS);
const FETCH_PROVIDER_LABELS: Record<string, string> = { firecrawl: 'Firecrawl' };
const SHARED_CAPABLE_SEARCH_PROVIDERS = new Set(['gemini', 'grok', 'kimi', 'minimax', 'perplexity', 'ollama']);
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

function parseNum(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function isBlockedByPolicies(tools: ToolsConfig | undefined, toolId: string): boolean {
  const deny = new Set(tools?.deny ?? []);
  if (deny.has(toolId) || deny.has('group:web') || deny.has('group:openclaw')) return true;
  const allow = tools?.allow ?? [];
  if (allow.length === 0) return false;
  return !(allow.includes(toolId) || allow.includes('group:web') || allow.includes('group:openclaw'));
}

function resolveSharedReady(config: OpenClawConfig, provider: string): boolean {
  const profiles = config.auth?.profiles ?? {};
  const hasAnyAuthProfile = (providerId: string) =>
    Object.keys(profiles).some((k) => k.split(':')[0] === providerId);
  if (provider === 'gemini') return hasAnyAuthProfile('google');
  if (provider === 'grok') return hasAnyAuthProfile('xai');
  if (provider === 'kimi') return hasAnyAuthProfile('moonshot') || hasAnyAuthProfile('kimi');
  if (provider === 'minimax') return hasAnyAuthProfile('minimax');
  if (provider === 'perplexity') return hasAnyAuthProfile('perplexity');
  if (provider === 'ollama') return hasAnyAuthProfile('ollama');
  return false;
}

function ensurePluginEntries(config: OpenClawConfig): PluginEntriesMap {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  return config.plugins.entries;
}

export function ToolsTab({ config, onChange }: ToolsTabProps) {
  const { t } = useTranslation();
  const tools = config.tools ?? {};
  const [showPolicyAdvanced, setShowPolicyAdvanced] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalProvider, setModalProvider] = useState<string>('');
  const [sharedMode, setSharedMode] = useState<SharedMode>('shared');
  const [modalApiKey, setModalApiKey] = useState('');
  const [modalBaseUrl, setModalBaseUrl] = useState('');

  const webSearchBlocked = isBlockedByPolicies(config.tools, 'web_search');
  const webFetchBlocked = isBlockedByPolicies(config.tools, 'web_fetch');

  const configuredSearchProviders = useMemo(() => resolveConfiguredWebSearchProviders(config), [config]);
  const configuredFetchProviders = useMemo(() => resolveConfiguredWebFetchProviders(config), [config]);

  const patchTools = (patch: ToolsPatch) =>
    onChange((prev) => ({ ...prev, tools: { ...prev.tools, ...patch } }));

  const patchExec = (patch: ExecPatch) =>
    onChange((prev) => ({
      ...prev,
      tools: { ...prev.tools, exec: { ...prev.tools?.exec, ...patch } },
    }));

  const patchWebSearch = (patch: WebSearchPatch) =>
    onChange((prev) => ({
      ...prev,
      tools: {
        ...prev.tools,
        web: {
          ...prev.tools?.web,
          search: { ...prev.tools?.web?.search, ...patch },
        },
      },
    }));

  const patchWebSearchCodex = (patch: WebSearchCodexPatch) =>
    onChange((prev) => ({
      ...prev,
      tools: {
        ...prev.tools,
        web: {
          ...prev.tools?.web,
          search: {
            ...prev.tools?.web?.search,
            openaiCodex: {
              ...prev.tools?.web?.search?.openaiCodex,
              ...patch,
            },
          },
        },
      },
    }));

  const patchWebSearchCodexLocation = (patch: WebSearchCodexLocationPatch) =>
    onChange((prev) => ({
      ...prev,
      tools: {
        ...prev.tools,
        web: {
          ...prev.tools?.web,
          search: {
            ...prev.tools?.web?.search,
            openaiCodex: {
              ...prev.tools?.web?.search?.openaiCodex,
              userLocation: {
                ...prev.tools?.web?.search?.openaiCodex?.userLocation,
                ...patch,
              },
            },
          },
        },
      },
    }));

  const patchWebFetch = (patch: WebFetchPatch) =>
    onChange((prev) => ({
      ...prev,
      tools: {
        ...prev.tools,
        web: {
          ...prev.tools?.web,
          fetch: { ...prev.tools?.web?.fetch, ...patch },
        },
      },
    }));

  const setSearchProvider = (provider: string) => {
    patchWebSearch({ provider, enabled: true });
  };

  const setFetchProvider = (provider: string) => {
    patchWebFetch({ provider, enabled: true });
  };

  const removeSearchProvider = (provider: string) => {
    onChange((prev) => removeSearchProviderFromConfig(prev, provider));
  };

  const removeFetchProvider = (provider: string) => {
    onChange((prev) => removeFetchProviderFromConfig(prev, provider));
  };

  const openAddModal = (mode: ModalMode) => {
    setModalMode(mode);
    setModalProvider('');
    setSharedMode('shared');
    setModalApiKey('');
    setModalBaseUrl('');
  };

  const closeModal = () => setModalMode(null);

  const canUseShared = modalMode === 'search' && resolveSharedReady(config, modalProvider);
  const sharedCapable = modalMode === 'search' && SHARED_CAPABLE_SEARCH_PROVIDERS.has(modalProvider);
  const modelApiKeyReady = modalMode === 'search' && resolveSharedReady(config, modalProvider);
  const apiKeyPlaceholder = modelApiKeyReady
    ? t('config.apiKeyPlaceholderReuseModel')
    : t('config.apiKeyPlaceholderNeedConfig');
  const searchProviderHint = modalMode === 'search' && modalProvider
    ? t(`config.webSearchProviderHint_${modalProvider}`, '')
    : '';
  const fetchProviderHint = modalMode === 'fetch' && modalProvider
    ? t(`config.webFetchProviderHint_${modalProvider}`, '')
    : '';
  const needApiKey =
    modalProvider === 'tavily' ||
    modalProvider === 'firecrawl' ||
    modalProvider === 'brave' ||
    modalProvider === 'exa' ||
    modalProvider === 'gemini' ||
    modalProvider === 'grok' ||
    modalProvider === 'kimi' ||
    modalProvider === 'minimax' ||
    modalProvider === 'perplexity';
  const needBaseUrl = modalProvider === 'searxng' || modalProvider === 'firecrawl';
  const shouldPersistSearchApiKey =
    needApiKey &&
    (sharedMode === 'independent' || !canUseShared) &&
    Boolean(modalApiKey.trim());
  const shouldPersistSearchBaseUrl = needBaseUrl && Boolean(modalBaseUrl.trim());

  const handleAddTool = () => {
    if (!modalMode || !modalProvider) return;
    if (modalMode === 'search') {
      onChange((prev) => {
        const pluginId = WEB_SEARCH_PLUGIN_BY_PROVIDER[modalProvider];
        const next = structuredClone(prev);
        next.tools = {
          ...next.tools,
          web: {
            ...next.tools?.web,
            search: { ...next.tools?.web?.search, enabled: true, provider: modalProvider },
          },
        };
        if (pluginId) {
          const entries = ensurePluginEntries(next);
          const plugin = entries[pluginId] ?? {};
          const webSearch = plugin.config?.webSearch ?? {};
          entries[pluginId] = {
            ...plugin,
            enabled: true,
            config: {
              ...plugin.config,
              webSearch: {
                ...webSearch,
                ...(shouldPersistSearchApiKey ? { apiKey: modalApiKey.trim() } : {}),
                ...(shouldPersistSearchBaseUrl ? { baseUrl: modalBaseUrl.trim() } : {}),
              },
            },
          };
        }
        return next;
      });
    } else {
      onChange((prev) => {
        const next = structuredClone(prev);
        next.tools = {
          ...next.tools,
          web: {
            ...next.tools?.web,
            fetch: { ...next.tools?.web?.fetch, enabled: true, provider: 'firecrawl' },
          },
        };
        const entries = ensurePluginEntries(next);
        const plugin = entries.firecrawl ?? {};
        const webFetch = plugin.config?.webFetch ?? {};
        entries.firecrawl = {
          ...plugin,
          enabled: true,
          config: {
            ...plugin.config,
            webFetch: {
              ...webFetch,
              ...(modalApiKey.trim() ? { apiKey: modalApiKey } : {}),
              ...(modalBaseUrl.trim() ? { baseUrl: modalBaseUrl } : {}),
            },
          },
        };
        return next;
      });
    }
    closeModal();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="px-5 py-3.5 border-b border-aegis-border">
          <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
            🌐 {t('config.webTools')}
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">{t('config.searchEnabled')}</span>
            <ToggleSwitch
              value={tools.web?.search?.enabled !== false}
              onChange={(v) => patchWebSearch({ enabled: v })}
            />
          </div>
          {tools.web?.search?.enabled !== false && (
            <div className="space-y-3 pl-2 border-l-2 border-aegis-primary/20">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => openAddModal('search')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
                    'bg-aegis-primary text-aegis-btn-primary-text',
                    'hover:brightness-110 transition-all duration-200'
                  )}
                >
                  <Plus size={12} /> {t('config.addWebSearchTool')}
                </button>
              </div>
              <div className="space-y-2">
                {configuredSearchProviders.length === 0 ? (
                  <p className="text-[11px] text-aegis-text-muted">{t('config.noWebSearchToolsConfigured')}</p>
                ) : configuredSearchProviders.map((id) => (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-aegis-border bg-aegis-surface px-3 py-2">
                    <span className="text-sm text-aegis-text-secondary">{SEARCH_PROVIDER_LABELS[id] ?? id}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSearchProvider(id)}
                        className={clsx(
                          'text-xs px-2 py-1 rounded-md border transition-colors',
                          tools.web?.search?.provider === id
                            ? 'border-aegis-primary/40 text-aegis-primary bg-aegis-primary/10'
                            : 'border-aegis-border text-aegis-text-secondary hover:text-aegis-text',
                        )}
                      >
                        {tools.web?.search?.provider === id ? t('config.activeProvider') : t('config.setAsActiveProvider')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSearchProvider(id)}
                        className={clsx(
                          'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                          'border-red-500/25 text-red-400 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40',
                        )}
                      >
                        <Trash2 size={11} />
                        {t('common.remove', 'Remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label={t('config.searchMaxResults')}>
                  <input
                    type="number"
                    value={tools.web?.search?.maxResults ?? ''}
                    onChange={(e) => patchWebSearch({ maxResults: parseNum(e.target.value) })}
                    className={INPUT}
                    min={1}
                    placeholder="5"
                  />
                </FormField>
                <FormField label={t('config.searchTimeoutSeconds')}>
                  <input
                    type="number"
                    value={tools.web?.search?.timeoutSeconds ?? ''}
                    onChange={(e) => patchWebSearch({ timeoutSeconds: parseNum(e.target.value) })}
                    className={INPUT}
                    min={1}
                    placeholder="30"
                  />
                </FormField>
                <FormField label={t('config.searchCacheTtlMinutes')}>
                  <input
                    type="number"
                    value={tools.web?.search?.cacheTtlMinutes ?? ''}
                    onChange={(e) => patchWebSearch({ cacheTtlMinutes: parseNum(e.target.value) })}
                    className={INPUT}
                    min={1}
                    placeholder="15"
                  />
                </FormField>
              </div>
              <div className="pt-1 border-t border-aegis-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-aegis-text-secondary">{t('config.codexNativeSearch')}</span>
                  <ToggleSwitch
                    value={tools.web?.search?.openaiCodex?.enabled ?? false}
                    onChange={(v) => patchWebSearchCodex({ enabled: v })}
                  />
                </div>
                {tools.web?.search?.openaiCodex?.enabled && (
                  <div className="space-y-4 pl-2 border-l-2 border-aegis-primary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField label={t('config.codexNativeMode')}>
                        <SelectField
                          value={tools.web?.search?.openaiCodex?.mode ?? 'cached'}
                          onChange={(v) => patchWebSearchCodex({ mode: v })}
                          options={[{ value: 'cached', label: 'cached' }, { value: 'direct', label: 'direct' }]}
                        />
                      </FormField>
                      <FormField label={t('config.contextSize')}>
                        <SelectField
                          value={tools.web?.search?.openaiCodex?.contextSize ?? 'high'}
                          onChange={(v) => patchWebSearchCodex({ contextSize: v })}
                          options={[{ value: 'low', label: 'low' }, { value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }]}
                        />
                      </FormField>
                    </div>
                    <FormField label={t('config.allowedDomains')}>
                      <ChipInput
                        values={tools.web?.search?.openaiCodex?.allowedDomains ?? []}
                        onChange={(v) => patchWebSearchCodex({ allowedDomains: v })}
                        placeholder={t('config.allowedDomainsPlaceholder')}
                      />
                    </FormField>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField label={t('config.userLocationCountry')}>
                        <input
                          type="text"
                          value={tools.web?.search?.openaiCodex?.userLocation?.country ?? ''}
                          onChange={(e) => patchWebSearchCodexLocation({ country: e.target.value || undefined })}
                          className={INPUT}
                          placeholder="US"
                        />
                      </FormField>
                      <FormField label={t('config.userLocationCity')}>
                        <input
                          type="text"
                          value={tools.web?.search?.openaiCodex?.userLocation?.city ?? ''}
                          onChange={(e) => patchWebSearchCodexLocation({ city: e.target.value || undefined })}
                          className={INPUT}
                          placeholder="New York"
                        />
                      </FormField>
                      <FormField label={t('config.userLocationTimezone')}>
                        <input
                          type="text"
                          value={tools.web?.search?.openaiCodex?.userLocation?.timezone ?? ''}
                          onChange={(e) => patchWebSearchCodexLocation({ timezone: e.target.value || undefined })}
                          className={INPUT}
                          placeholder="America/New_York"
                        />
                      </FormField>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-aegis-border flex items-center justify-between">
            <span className="text-sm text-aegis-text-secondary">{t('config.fetchEnabled')}</span>
            <ToggleSwitch
              value={tools.web?.fetch?.enabled !== false}
              onChange={(v) => patchWebFetch({ enabled: v })}
            />
          </div>
          {tools.web?.fetch?.enabled !== false && (
            <div className="space-y-3 pl-2 border-l-2 border-aegis-primary/20">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => openAddModal('fetch')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
                    'bg-aegis-primary text-aegis-btn-primary-text',
                    'hover:brightness-110 transition-all duration-200'
                  )}
                >
                  <Plus size={12} /> {t('config.addWebFetchTool')}
                </button>
              </div>
              <div className="space-y-2">
                {configuredFetchProviders.length === 0 ? (
                  <p className="text-[11px] text-aegis-text-muted">{t('config.noWebFetchToolsConfigured')}</p>
                ) : configuredFetchProviders.map((id) => (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-aegis-border bg-aegis-surface px-3 py-2">
                    <span className="text-sm text-aegis-text-secondary">{FETCH_PROVIDER_LABELS[id] ?? id}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFetchProvider(id)}
                        className={clsx(
                          'text-xs px-2 py-1 rounded-md border transition-colors',
                          tools.web?.fetch?.provider === id
                            ? 'border-aegis-primary/40 text-aegis-primary bg-aegis-primary/10'
                            : 'border-aegis-border text-aegis-text-secondary hover:text-aegis-text',
                        )}
                      >
                        {tools.web?.fetch?.provider === id ? t('config.activeProvider') : t('config.setAsActiveProvider')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFetchProvider(id)}
                        className={clsx(
                          'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                          'border-red-500/25 text-red-400 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40',
                        )}
                      >
                        <Trash2 size={11} />
                        {t('common.remove', 'Remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <FormField label={t('config.fetchMaxChars')}>
                <input
                  type="number"
                  value={tools.web?.fetch?.maxChars ?? ''}
                  onChange={(e) => patchWebFetch({ maxChars: parseNum(e.target.value) })}
                  className={INPUT}
                  min={1}
                  placeholder="50000"
                />
              </FormField>
            </div>
          )}

          {(webSearchBlocked || webFetchBlocked) && (
            <div className="text-xs rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 px-3 py-2">
              {t('config.toolBlockedHint')}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="px-5 py-3.5 border-b border-aegis-border">
          <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
            🔧 {t('config.toolsAccessControl')}
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <FormField label={t('config.toolProfile')}>
            <SelectField
              value={tools.profile ?? 'full'}
              onChange={(v) => patchTools({ profile: v })}
              options={[
                { value: 'minimal', label: 'Minimal' },
                { value: 'coding', label: 'Coding' },
                { value: 'messaging', label: 'Messaging' },
                { value: 'full', label: 'Full' },
              ]}
            />
          </FormField>
          <div className="pt-1 border-t border-aegis-border">
            <button
              type="button"
              onClick={() => setShowPolicyAdvanced((v) => !v)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-aegis-border text-aegis-text-secondary hover:text-aegis-text hover:border-aegis-border-hover transition-colors"
            >
              {showPolicyAdvanced ? t('config.hideAdvancedPolicy') : t('config.showAdvancedPolicy')}
            </button>
          </div>
          {showPolicyAdvanced && (
            <div className="space-y-4 pt-1">
              <FormField label={t('config.execAskMode')}>
                <SelectField
                  value={tools.exec?.ask ?? 'off'}
                  onChange={(v) => patchExec({ ask: v })}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'on-miss', label: 'On Miss' },
                    { value: 'always', label: 'Always' },
                  ]}
                />
              </FormField>
              <FormField label={t('config.denyTools')}>
                <ChipInput
                  values={tools.deny ?? []}
                  onChange={(v) => patchTools({ deny: v })}
                  placeholder={t('config.advanced.addToolNamePlaceholder', 'Add tool name...')}
                />
              </FormField>
              <FormField label={t('config.allowTools')}>
                <ChipInput
                  values={tools.allow ?? []}
                  onChange={(v) => patchTools({ allow: v })}
                  placeholder={t('config.advanced.addToolNamePlaceholder', 'Add tool name...')}
                />
              </FormField>
              <p className="text-[11px] text-aegis-text-muted">{t('config.allowDenyHint')}</p>
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-aegis-border bg-aegis-card-solid">
            <div className="px-5 py-4 border-b border-aegis-border">
              <h3 className="text-sm font-bold text-aegis-text">
                {modalMode === 'search' ? t('config.addWebSearchTool') : t('config.addWebFetchTool')}
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <FormField label={t('config.webSearchProvider')}>
                <SelectField
                  value={modalProvider}
                  onChange={setModalProvider}
                  options={[
                    { value: '', label: t('config.selectProvider') },
                    ...(modalMode === 'search'
                      ? ALL_SEARCH_PROVIDERS.map((id) => ({ value: id, label: SEARCH_PROVIDER_LABELS[id] }))
                      : [{ value: 'firecrawl', label: 'Firecrawl' }]),
                  ]}
                />
              </FormField>
              {searchProviderHint && (
                <div className="text-xs rounded-lg border border-aegis-border bg-aegis-surface px-3 py-2 text-aegis-text-secondary">
                  {searchProviderHint}
                </div>
              )}
              {fetchProviderHint && (
                <div className="text-xs rounded-lg border border-aegis-border bg-aegis-surface px-3 py-2 text-aegis-text-secondary">
                  {fetchProviderHint}
                </div>
              )}
              {modalMode === 'search' && modalProvider && (
                <div className="space-y-3">
                  {canUseShared && (
                    <FormField label={t('config.sharedCredentialSource')}>
                      <SelectField
                        value={sharedMode}
                        onChange={(v) => setSharedMode(v as SharedMode)}
                        options={[
                          { value: 'shared', label: t('config.useSharedCredential') },
                          { value: 'independent', label: t('config.useIndependentCredential') },
                        ]}
                      />
                    </FormField>
                  )}
                  {(sharedMode === 'independent' || !canUseShared) && needApiKey && (
                    <FormField label={t('config.providerCredentialOverride')}>
                      <MaskedInput
                        value={modalApiKey}
                        onChange={setModalApiKey}
                        placeholder={apiKeyPlaceholder}
                      />
                    </FormField>
                  )}
                  {needApiKey && (
                    <div
                      className={clsx(
                        'text-[11px] rounded-lg border px-3 py-2',
                        sharedCapable
                          ? (modelApiKeyReady
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300')
                          : 'border-aegis-border bg-aegis-surface text-aegis-text-muted',
                      )}
                    >
                      {sharedCapable
                        ? (modelApiKeyReady
                          ? t('config.apiKeyHintSharedConfigured')
                          : t('config.apiKeyHintSharedMissing'))
                        : t('config.apiKeyHintNotShared')}
                    </div>
                  )}
                  {needBaseUrl && (
                    <FormField label="Base URL">
                      <input
                        type="text"
                        value={modalBaseUrl}
                        onChange={(e) => setModalBaseUrl(e.target.value)}
                        className={INPUT}
                        placeholder={modalProvider === 'searxng' ? 'https://searx.example.com' : 'https://api.firecrawl.dev'}
                      />
                    </FormField>
                  )}
                </div>
              )}
              {modalMode === 'fetch' && modalProvider === 'firecrawl' && (
                <div className="space-y-3">
                  <FormField label="Firecrawl Fetch API Key">
                    <MaskedInput value={modalApiKey} onChange={setModalApiKey} placeholder="fc-..." />
                  </FormField>
                  <FormField label="Firecrawl Fetch Base URL">
                    <input
                      type="text"
                      value={modalBaseUrl}
                      onChange={(e) => setModalBaseUrl(e.target.value)}
                      className={INPUT}
                      placeholder="https://api.firecrawl.dev"
                    />
                  </FormField>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-aegis-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-aegis-border text-aegis-text-secondary"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleAddTool}
                disabled={!modalProvider}
                className={clsx(
                  'px-3.5 py-2 rounded-lg text-xs font-bold bg-aegis-primary text-aegis-btn-primary-text',
                  !modalProvider && 'opacity-50 cursor-not-allowed',
                )}
              >
                {t('common.apply', 'Apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolsTab;

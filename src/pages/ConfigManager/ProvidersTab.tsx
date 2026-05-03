// ═══════════════════════════════════════════════════════════
// Config Manager — ProvidersTab
// Phase 2+: Unified provider management (auth + models + env)
// Design: theme Tailwind classes only (no hardcoded colors)
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  ChevronRight,
  CheckCircle,
  Save,
  Trash2,
  Search,
  X,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import type {
  GatewayRuntimeConfig,
  AuthProfile,
  ModelEntry,
  ModelProviderConfig,
  ModelProviderModelEntry,
} from './types';
import {
  PROVIDER_TEMPLATES,
  POPULAR_PROVIDER_IDS,
  UI_CATALOG,
  getCatalogEntriesForTab,
  getTemplateById,
  type ProviderTemplate,
  type ProviderCatalogEntry,
  type ProviderTab,
} from './providerTemplates';
import { MaskedInput, ChipList, ChipInput, StatCard } from './components';
import { buildProviderSubmissionModelIds } from './providerModelSelection';
import { gateway } from '@/services/gateway';
import { GENERATED_PROVIDER_CATALOG } from '@/generated/providerCatalog.generated';
import {
  GENERATED_IMAGE_GENERATION_MODELS,
  GENERATED_VIDEO_GENERATION_MODELS,
} from '@/generated/mediaCatalog.generated';

// ─────────────────────────────────────────────────────────────────────────────
// Provider test: try GET /models first; if 404, fallback to POST /chat/completions
// Not all providers expose /models (e.g. some use other paths); fallback is more universal.
// ─────────────────────────────────────────────────────────────────────────────

/** Build path suffix for baseUrl: either /models or /chat/completions (same version segment). */
function modelsEndpointUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (!base) return '';
  if (/\/v\d+(beta)?$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

function chatCompletionsEndpointUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (!base) return '';
  if (/\/v\d+(beta)?$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

const PROVIDER_TEST_TIMEOUT_MS = 15_000;

function buildTestHeaders(tmpl: ProviderTemplate | undefined, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!apiKey) return headers;
  if (tmpl?.id === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Test provider connection. Tries GET /models first; on 404, tries POST /chat/completions (minimal body). */
export async function testProviderConnection(
  baseUrl: string,
  apiKey: string,
  tmpl?: ProviderTemplate,
  modelOverride?: string
): Promise<{ ok: boolean; message: string }> {
  const modelsUrl = modelsEndpointUrl(baseUrl);
  if (!modelsUrl) return { ok: false, message: 'Missing API endpoint' };

  const headers = buildTestHeaders(tmpl, apiKey);
  // Google Gemini uses ?key= for auth
  const isGoogle = tmpl?.id === 'google';
  const url = isGoogle && apiKey ? `${modelsUrl}?key=${encodeURIComponent(apiKey)}` : modelsUrl;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) return { ok: true, message: 'OK' };
    if (res.status !== 404) {
      const text = await res.text();
      const short = text ? text.slice(0, 120).replace(/\s+/g, ' ') : '';
      return { ok: false, message: `${res.status} ${res.statusText}${short ? ` — ${short}` : ''}` };
    }

    // 404 on /models → fallback: POST /chat/completions (Anthropic uses Messages API, no fallback)
    if (tmpl?.api === 'anthropic') {
      const text = await res.text();
      const short = text ? text.slice(0, 120).replace(/\s+/g, ' ') : '';
      return { ok: false, message: `404 ${res.statusText}${short ? ` — ${short}` : ''}` };
    }
    const chatUrl = isGoogle && apiKey
      ? `${chatCompletionsEndpointUrl(baseUrl)}?key=${encodeURIComponent(apiKey)}`
      : chatCompletionsEndpointUrl(baseUrl);
    const generatedRows = tmpl ? getGeneratedCatalogRows(tmpl.id) : [];
    const modelId =
      modelOverride ??
      generatedRows[0]?.id?.split('/').pop() ??
      'gpt-3.5-turbo';
    const body = JSON.stringify({
      model: modelId,
      messages: [{ role: 'user' as const, content: 'Hi' }],
      max_tokens: 1,
    });

    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), PROVIDER_TEST_TIMEOUT_MS);
    try {
      const res2 = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller2.signal,
      });
      clearTimeout(t2);
      if (res2.ok) return { ok: true, message: 'OK' };
      if (res2.status === 401 || res2.status === 403) {
        return { ok: false, message: `${res2.status} — 连接可达，请检查 API Key 或权限` };
      }
      const text2 = await res2.text();
      const short2 = text2 ? text2.slice(0, 120).replace(/\s+/g, ' ') : '';
      return { ok: false, message: `${res2.status} ${res2.statusText}${short2 ? ` — ${short2}` : ''}` };
    } catch (e2: any) {
      clearTimeout(t2);
      if (e2?.name === 'AbortError') {
        return { ok: false, message: `Connection timed out (${PROVIDER_TEST_TIMEOUT_MS / 1000}s)` };
      }
      return { ok: false, message: e2?.message || String(e2) };
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      return { ok: false, message: `Connection timed out (${PROVIDER_TEST_TIMEOUT_MS / 1000}s)` };
    }
    return { ok: false, message: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProvidersTabProps {
  config: GatewayRuntimeConfig;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
  onApplyAndSave: (
    updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig,
    options?: { connectionProbe?: ConnectionPrecheckProbe }
  ) => Promise<boolean>;
  saving: boolean;
}


/** Unified representation of a provider from any of the 3 sources */
interface UnifiedProvider {
  key: string;           // profile key (e.g. "anthropic:my-clawdbot") or provider id
  provider: string;      // "anthropic", "nvidia", "google", etc.
  displayName: string;   // from template or provider id
  source: 'auth' | 'models-provider' | 'env-only';

  // Auth info (from auth.profiles)
  authProfile?: AuthProfile;
  profileKey?: string;

  // Models provider info (from models.providers)
  modelsProvider?: ModelProviderConfig;

  // Models in agents.defaults.models belonging to this provider
  models: Record<string, ModelEntry>;
  modelCount: number;

  // Template match
  template?: ProviderTemplate;

  // Env key detected
  envKeyFound?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getProviderFromModelId(modelId: string): string {
  // "anthropic/claude-opus-4-6" → "anthropic"
  // "nvidia/moonshotai/kimi-k2.5" → "nvidia"
  const parts = modelId.split('/');
  return parts[0] || modelId;
}

function getProviderFromProfileKey(profileKey: string): string {
  // "anthropic:my-clawdbot" → "anthropic"
  return profileKey.split(':')[0] || profileKey;
}

function normalizeProviderIdForCatalog(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  if (normalized === 'modelstudio' || normalized === 'qwencloud' || normalized === 'qwen-dashscope') return 'qwen';
  if (normalized === 'kimi-coding' || normalized === 'kimi-code' || normalized === 'kimi') return 'moonshot';
  if (normalized === 'z.ai' || normalized === 'z-ai') return 'zai';
  return normalized;
}

function providerNamespaceMatches(modelProviderId: string, expectedProviderId: string): boolean {
  return normalizeProviderIdForCatalog(modelProviderId) === normalizeProviderIdForCatalog(expectedProviderId);
}

function getGeneratedCatalogRows(providerId: string) {
  return GENERATED_PROVIDER_CATALOG[normalizeProviderIdForCatalog(providerId)] ?? [];
}

function normalizeProviderModelRef(providerId: string, modelId: string | undefined): string | undefined {
  const trimmed = String(modelId ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return undefined;
  if (trimmed.startsWith(`${providerId}/`)) return trimmed;
  const head = trimmed.split('/')[0] || '';
  if (providerNamespaceMatches(head, providerId)) return trimmed;
  return `${providerId}/${trimmed}`;
}

function stripProviderNamespace(providerId: string, modelRef: string): string {
  const trimmed = String(modelRef ?? '').trim();
  if (!trimmed) return trimmed;
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0) return trimmed;
  const head = trimmed.slice(0, slashIndex);
  if (!providerNamespaceMatches(head, providerId)) return trimmed;
  return trimmed.slice(slashIndex + 1);
}

type GatewayModelOption = {
  id: string;
  provider?: string;
  model?: string;
  alias?: string;
  supportsImage?: boolean;
};

function resolveGeneratedModelSupportsImage(modelRef: string): boolean | undefined {
  const normalizedRef = String(modelRef ?? '').trim();
  if (!normalizedRef) return undefined;
  const slashIndex = normalizedRef.indexOf('/');
  if (slashIndex <= 0) return undefined;
  const providerId = normalizedRef.slice(0, slashIndex);
  const rows = getGeneratedCatalogRows(providerId);
  if (rows.length === 0) return undefined;
  const row = rows.find((entry) => {
    const normalized = normalizeProviderModelRef(providerId, entry.id);
    return normalized === normalizedRef;
  });
  return row?.supportsImage;
}

function buildConfiguredImageSupportMap(models: Record<string, ModelEntry>): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const [id, entry] of Object.entries(models)) {
    const explicitSupport = resolveModelSupportsImage(entry);
    if (typeof explicitSupport === 'boolean') {
      map.set(id, explicitSupport);
      continue;
    }
    const generatedSupport = resolveGeneratedModelSupportsImage(id);
    if (typeof generatedSupport === 'boolean') {
      map.set(id, generatedSupport);
    }
  }
  return map;
}

function isModelImageCapable(modelRef: string, imageSupportMap?: Map<string, boolean>): boolean {
  const explicitSupport = imageSupportMap?.get(String(modelRef ?? '').trim());
  if (typeof explicitSupport === 'boolean') {
    return explicitSupport;
  }
  return resolveGeneratedModelSupportsImage(modelRef) === true;
}

function pickFirstImageCapableModel(
  modelIds: string[],
  imageSupportMap?: Map<string, boolean>,
): string | undefined {
  return modelIds.find((id) => isModelImageCapable(id, imageSupportMap));
}

function resolveImagePrimaryModel(
  currentImagePrimary: string | undefined,
  availableModelIds: string[],
  imageSupportMap?: Map<string, boolean>,
): string | undefined {
  if (
    currentImagePrimary &&
    availableModelIds.includes(currentImagePrimary) &&
    isModelImageCapable(currentImagePrimary, imageSupportMap)
  ) {
    return currentImagePrimary;
  }
  return pickFirstImageCapableModel(availableModelIds, imageSupportMap);
}

function resolveModelSupportsImage(value: any): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.supportsImage === 'boolean') return value.supportsImage;
  if (typeof value.supports_image === 'boolean') return value.supports_image;
  if (Array.isArray(value.input)) {
    const modalities = value.input.map((m: any) => String(m).toLowerCase());
    if (modalities.includes('image')) return true;
    if (modalities.includes('text')) return false;
  }
  if (Array.isArray(value.modalities?.input)) {
    const modalities = value.modalities.input.map((m: any) => String(m).toLowerCase());
    if (modalities.includes('image')) return true;
    if (modalities.includes('text')) return false;
  }
  if (Array.isArray(value.architecture?.input_modalities)) {
    const modalities = value.architecture.input_modalities.map((m: any) => String(m).toLowerCase());
    if (modalities.includes('image')) return true;
    if (modalities.includes('text')) return false;
  }
  return undefined;
}

function parseGatewayModelsResponse(res: unknown): GatewayModelOption[] {
  const out: GatewayModelOption[] = [];
  const pushModel = (value: any) => {
    if (!value) return;
    if (typeof value === 'string') {
      out.push({ id: value });
      return;
    }
    if (typeof value !== 'object') return;
    const id = String(value.id ?? value.model ?? '').trim();
    const provider = String(value.provider ?? '').trim() || undefined;
    const model = String(value.model ?? '').trim() || undefined;
    const alias = String(value.alias ?? value.name ?? '').trim() || undefined;
    const supportsImage = resolveModelSupportsImage(value);
    if (id) {
      out.push({ id, provider, model, alias, supportsImage });
      return;
    }
    if (provider && model) {
      out.push({ id: `${provider}/${model}`, provider, model, alias, supportsImage });
    }
  };

  if (Array.isArray(res)) {
    for (const item of res) pushModel(item);
  } else if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.models)) {
      for (const item of obj.models) pushModel(item);
    } else if (obj.models && typeof obj.models === 'object') {
      for (const [id, cfg] of Object.entries(obj.models as Record<string, any>)) {
        pushModel({ id, ...(cfg ?? {}) });
      }
    }
  }

  const deduped = new Map<string, GatewayModelOption>();
  for (const item of out) {
    if (!item.id) continue;
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }
  return Array.from(deduped.values());
}

async function fetchProviderModelCatalog(
  baseUrl: string,
  apiKey: string,
  tmpl?: ProviderTemplate,
): Promise<GatewayModelOption[]> {
  const modelsUrl = modelsEndpointUrl(baseUrl);
  if (!modelsUrl) return [];
  const headers = buildTestHeaders(tmpl, apiKey);
  const isGoogle = tmpl?.id === 'google';
  const url = isGoogle && apiKey ? `${modelsUrl}?key=${encodeURIComponent(apiKey)}` : modelsUrl;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const rows: GatewayModelOption[] = [];
    const pushRow = (row: any) => {
      const id = String(row?.id ?? row?.model ?? '').trim();
      if (!id) return;
      rows.push({ id, supportsImage: resolveModelSupportsImage(row) });
    };
    if (json && typeof json === 'object' && Array.isArray((json as any).data)) {
      for (const row of (json as any).data) {
        pushRow(row);
      }
    } else if (json && typeof json === 'object' && Array.isArray((json as any).models)) {
      for (const row of (json as any).models) {
        pushRow(row);
      }
    } else if (Array.isArray(json)) {
      for (const row of json) {
        if (typeof row === 'string') {
          const id = row.trim();
          if (id) rows.push({ id });
        } else {
          pushRow(row);
        }
      }
    }
    const deduped = new Map<string, GatewayModelOption>();
    for (const row of rows) {
      if (!deduped.has(row.id)) deduped.set(row.id, row);
    }
    return Array.from(deduped.values());
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// Backward-compat alias
const providerFromProfileKey = getProviderFromProfileKey;

function getModelsForProvider(
  provider: string,
  models: Record<string, ModelEntry>
): Record<string, ModelEntry> {
  return Object.fromEntries(
    Object.entries(models).filter(([id]) => providerNamespaceMatches(getProviderFromModelId(id), provider))
  );
}

/** @deprecated use getModelsForProvider — kept for ProfileRow backward compat */
function modelsForProvider(
  profileKey: string,
  models: Record<string, ModelEntry> | undefined
): Record<string, ModelEntry> {
  if (!models) return {};
  const provider = providerFromProfileKey(profileKey);
  return Object.fromEntries(
    Object.entries(models).filter(([id]) => {
      const tmpl = getTemplateById(provider);
      const generatedRows = GENERATED_PROVIDER_CATALOG[normalizeProviderIdForCatalog(provider)] ?? [];
      if (!tmpl) return providerNamespaceMatches(getProviderFromModelId(id), provider);
      return (
        generatedRows.some((m) => normalizeProviderModelRef(provider, m.id) === id) ||
        providerNamespaceMatches(getProviderFromModelId(id), provider) ||
        id.startsWith(provider + ':')
      );
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildUnifiedProviders — merge 3 sources
// ─────────────────────────────────────────────────────────────────────────────

function buildUnifiedProviders(config: GatewayRuntimeConfig): UnifiedProvider[] {
  const result: UnifiedProvider[] = [];
  const allModels = config.agents?.defaults?.models ?? {};
  const findExistingIndex = (providerId: string) =>
    result.findIndex((p) => providerNamespaceMatches(p.provider, providerId));

  // ── 1. auth.profiles ──────────────────────────────────────
  const envVarsForAuth = config.env?.vars ?? {};
  const profiles = config.auth?.profiles ?? {};
  for (const [profileKey, profile] of Object.entries(profiles)) {
    const providerRaw = profile.provider || getProviderFromProfileKey(profileKey);
    const template = getTemplateById(providerRaw);
    const provider = template?.id ?? providerRaw;
    const models   = getModelsForProvider(providerRaw, allModels);
    const envKeyFound = !!(
      template?.envKey && envVarsForAuth[template.envKey] &&
      String(envVarsForAuth[template.envKey]).trim()
    );

    result.push({
      key:         profileKey,
      provider,
      displayName: template?.name ?? provider,
      source:      'auth',
      authProfile: profile,
      profileKey,
      models,
      modelCount:  Object.keys(models).length,
      template,
      envKeyFound,
    });
  }

  // ── 2. models.providers ───────────────────────────────────
  const modelsProviders = config.models?.providers ?? {};
  for (const [providerId, modelsProvider] of Object.entries(modelsProviders)) {
    // Find auth profiles for this provider
    const existingAuthProfiles = result.filter(
      (p) => providerNamespaceMatches(p.provider, providerId) && p.source === 'auth'
    );

    if (existingAuthProfiles.length > 0) {
      // Merge modelsProvider info into all matching auth profiles
      for (const p of existingAuthProfiles) {
        p.modelsProvider = modelsProvider;
      }
    } else {
      const existingIndex = findExistingIndex(providerId);
      if (existingIndex !== -1) {
        result[existingIndex].modelsProvider = modelsProvider;
      } else {
        const template = getTemplateById(providerId);
        const models   = getModelsForProvider(providerId, allModels);
        const normalizedProvider = template?.id ?? providerId;
        result.push({
          key:           providerId,
          provider:      normalizedProvider,
          displayName:   template?.name ?? providerId,
          source:        'models-provider',
          modelsProvider,
          models,
          modelCount:    Object.keys(models).length,
          template,
        });
      }
    }
  }

  // ── 3. env.vars ───────────────────────────────────────────
  const envVars = config.env?.vars ?? {};
  for (const template of PROVIDER_TEMPLATES) {
    if (!template.envKey && !template.envKeyAlt?.length) continue;

    const envKeyFound =
      (!!template.envKey && template.envKey in envVars) ||
      (template.envKeyAlt?.some((k) => k in envVars) ?? false);

    if (!envKeyFound) continue;

    // Find any existing entry for this provider
    const existingIndex = findExistingIndex(template.id);

    if (existingIndex !== -1) {
      result[existingIndex].envKeyFound = true;
    } else {
      const models = getModelsForProvider(template.id, allModels);

      result.push({
        key:         `env:${template.id}`,
        provider:    template.id,
        displayName: template.name,
        source:      'env-only',
        models,
        modelCount:  Object.keys(models).length,
        template,
        envKeyFound: true,
      });
    }
  }

  return result;
}

function applyProviderAddition(
  prev: GatewayRuntimeConfig,
  profileKey: string,
  profile: AuthProfile,
  models: string[],
  providerConfig?: ProviderConfigOverride
): GatewayRuntimeConfig {
  const providerIdFromKey = getProviderFromProfileKey(profileKey);
  const providerId = profile.provider || providerIdFromKey;
  const tmpl = getTemplateById(providerId);

  const normalizedModelSet = new Set<string>(
    (models || [])
      .map((id) => normalizeProviderModelRef(providerId, id))
      .filter((id): id is string => Boolean(id))
  );
  const requestedTextPrimary = normalizeProviderModelRef(providerId, providerConfig?.textPrimaryModel);
  const requestedImagePrimary = normalizeProviderModelRef(providerId, providerConfig?.imagePrimaryModel);
  const explicitImageModelSet = new Set<string>(
    (providerConfig?.imageCapableModels ?? [])
      .map((id) => normalizeProviderModelRef(providerId, id))
      .filter((id): id is string => Boolean(id))
  );
  if (requestedTextPrimary) normalizedModelSet.add(requestedTextPrimary);
  if (requestedImagePrimary) normalizedModelSet.add(requestedImagePrimary);
  if (requestedImagePrimary) explicitImageModelSet.add(requestedImagePrimary);
  const normalizedModels = Array.from(normalizedModelSet);
  const modelPairs = normalizedModels.map((fullId) => ({
    fullId,
    rawId: stripProviderNamespace(providerId, fullId),
  }));

  const configuredProviderIds = new Set<string>([
    ...Object.values(prev.auth?.profiles ?? {}).map((p: AuthProfile) => p.provider).filter(Boolean),
    ...Object.keys(prev.models?.providers ?? {}),
    providerId,
  ]);

  const prevModels = prev.agents?.defaults?.models ?? {};
  const generatedRows = getGeneratedCatalogRows(providerId);
  const currentProviderCfg = prev.models?.providers?.[providerId] ?? {};
  const existingProviderModels = Array.isArray(currentProviderCfg.models)
    ? currentProviderCfg.models
    : [];
  const existingProviderModelMap = new Map<string, ModelProviderModelEntry>();
  for (const model of existingProviderModels) {
    const rawId = stripProviderNamespace(providerId, String(model?.id ?? ''));
    if (!rawId) continue;
    existingProviderModelMap.set(rawId, model);
  }

  const submissionModels = modelPairs.map(({ fullId, rawId }) => {
    const generatedModel = generatedRows.find((m) => normalizeProviderModelRef(providerId, m.id) === fullId);
    const existingProviderModel = existingProviderModelMap.get(rawId);
    const supportsImage =
      explicitImageModelSet.has(fullId)
      || generatedModel?.supportsImage === true
      || resolveModelSupportsImage(existingProviderModel) === true
      || resolveModelSupportsImage(prevModels[fullId]) === true;
    const name =
      existingProviderModel?.name
      ?? generatedModel?.suggestedAlias
      ?? rawId.split('/').pop()
      ?? rawId;
    return {
      fullId,
      rawId,
      name,
      supportsImage,
      input: supportsImage ? ['text', 'image'] : ['text'],
    };
  });
  const submissionModelMap = new Map(
    submissionModels.map((model) => [model.rawId, model] as const)
  );

  const existingModels: Record<string, ModelEntry> = {};
  for (const [id, entry] of Object.entries(prevModels)) {
    if (configuredProviderIds.has(getProviderFromModelId(id))) {
      existingModels[id] = entry;
    }
  }
  for (const model of submissionModels) {
    const existingEntry = existingModels[model.fullId];
    existingModels[model.fullId] = {
      ...existingEntry,
      alias: existingEntry?.alias ?? model.name,
      supportsImage: model.supportsImage,
      input: model.input,
      params: existingEntry?.params ?? {},
    };
  }

  let next: GatewayRuntimeConfig = { ...prev };

  const buildNextProviderModels = (): ModelProviderModelEntry[] => {
    const updatedExistingModels = existingProviderModels.map((model) => {
      const rawId = stripProviderNamespace(providerId, String(model?.id ?? ''));
      const submittedModel = submissionModelMap.get(rawId);
      if (!submittedModel) {
        return {
          ...model,
          id: rawId,
        };
      }
      return {
        ...model,
        id: rawId,
        name: model.name ?? submittedModel.name,
        supportsImage: submittedModel.supportsImage,
        input: submittedModel.input,
      };
    });
    const existingIds = new Set(
      updatedExistingModels.map((model) => stripProviderNamespace(providerId, String(model.id ?? '')))
    );
    const addedModels = submissionModels
      .filter((model) => !existingIds.has(model.rawId))
      .map((model) => ({
        id: model.rawId,
        name: model.name,
        supportsImage: model.supportsImage,
        input: model.input,
      }));
    return [...updatedExistingModels, ...addedModels];
  };

  const key = (profile as any).token ?? (profile as any).apiKey ?? (profile as any).key;
  if (tmpl?.envKey && key) {
    window.aegis?.agentAuth?.syncMain?.([
      { provider: providerId, profileKey, apiKey: key, mode: profile.mode ?? (profile as any).type ?? 'api_key' },
    ]);

    next = {
      ...next,
      env: {
        ...next.env,
        vars: {
          ...(next.env?.vars ?? {}),
          [tmpl.envKey]: key,
        },
      },
    };

    const existingProfiles = { ...(next.auth?.profiles ?? {}) };
    next.auth = {
      ...next.auth,
      profiles: {
        ...existingProfiles,
        [profileKey]: {
          ...profile,
          token: undefined,
          apiKey: undefined,
        },
      },
    };
    const nextProviderModels = buildNextProviderModels();
    const effectiveBaseUrl = providerConfig?.baseUrl ?? tmpl?.baseUrl ?? currentProviderCfg.baseUrl;
    const effectiveApi = providerConfig?.api ?? tmpl?.api ?? currentProviderCfg.api;
    if (nextProviderModels.length > 0 || effectiveBaseUrl || effectiveApi) {
      next = {
        ...next,
        models: {
          ...next.models,
          providers: {
            ...(next.models?.providers ?? {}),
            [providerId]: {
              ...currentProviderCfg,
              baseUrl: effectiveBaseUrl,
              api: effectiveApi,
              models: nextProviderModels,
            },
          },
        },
      };
    }
  } else {
    const profiles = { ...next.auth?.profiles, [profileKey]: profile };
    next = {
      ...next,
      auth: { ...next.auth, profiles },
    };
    if (normalizedModels.length > 0 || providerConfig?.baseUrl || providerConfig?.api || tmpl?.api) {
      const nextProviderModels = buildNextProviderModels();
      next = {
        ...next,
        models: {
          ...next.models,
          providers: {
            ...(next.models?.providers ?? {}),
            [providerId]: {
              ...currentProviderCfg,
              baseUrl: providerConfig?.baseUrl ?? tmpl?.baseUrl ?? currentProviderCfg.baseUrl,
              api: providerConfig?.api ?? tmpl?.api ?? currentProviderCfg.api,
              models: nextProviderModels,
            },
          },
        },
      };
    }
  }

  const firstSelectedModel = normalizedModels[0];
  const currentPrimary = next.agents?.defaults?.model?.primary;
  const shouldOverridePrimary =
    !currentPrimary || currentPrimary.startsWith('anthropic/');
  const primaryStillValid = currentPrimary && currentPrimary in existingModels;
  const nextPrimary = requestedTextPrimary
    ? requestedTextPrimary
    : shouldOverridePrimary && firstSelectedModel
    ? firstSelectedModel
    : primaryStillValid
      ? currentPrimary
      : Object.keys(existingModels)[0];
  const currentImagePrimary = next.agents?.defaults?.imageModel?.primary;
  const modelIds = Object.keys(existingModels);
  const imageSupportMap = buildConfiguredImageSupportMap(existingModels);
  const imagePrimaryStillValid =
    currentImagePrimary &&
    currentImagePrimary in existingModels &&
    isModelImageCapable(currentImagePrimary, imageSupportMap);
  const nextImagePrimary = requestedImagePrimary
    ? (isModelImageCapable(requestedImagePrimary, imageSupportMap) ? requestedImagePrimary : undefined)
    : imagePrimaryStillValid
      ? currentImagePrimary
      : pickFirstImageCapableModel(modelIds, imageSupportMap);

  const nextDefaults = {
    ...next.agents?.defaults,
    models: existingModels,
    model: {
      ...(next.agents?.defaults?.model ?? {}),
      primary: nextPrimary ?? undefined,
    },
    imageModel: nextImagePrimary
      ? {
        ...(next.agents?.defaults?.imageModel ?? {}),
        primary: nextImagePrimary,
      }
      : undefined,
  };

  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: nextDefaults,
    },
  };
}

function buildPreviewChanges(current: any, next: any): any {
  if (JSON.stringify(current) === JSON.stringify(next)) return undefined;
  if (
    current &&
    next &&
    typeof current === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(current) &&
    !Array.isArray(next)
  ) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(next)) {
      const child = buildPreviewChanges(current?.[key], next[key]);
      if (child !== undefined) result[key] = child;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return next;
}

function maskPreviewSecrets(value: any, path = ''): any {
  if (Array.isArray(value)) {
    return value.map((item, index) => maskPreviewSecrets(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        maskPreviewSecrets(child, path ? `${path}.${key}` : key),
      ])
    );
  }
  const lowered = path.toLowerCase();
  if (
    typeof value === 'string' &&
    (lowered.includes('token') || lowered.includes('key') || lowered.includes('secret') || lowered.includes('password'))
  ) {
    return value ? '****' : value;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Icon
// ─────────────────────────────────────────────────────────────────────────────

function ProviderIcon({ providerId, size = 'md' }: { providerId: string; size?: 'sm' | 'md' }) {
  const tmpl = getTemplateById(providerId);
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-lg font-black text-aegis-btn-primary-text flex-shrink-0',
        `bg-gradient-to-br ${tmpl?.colorClass ?? 'from-slate-500 to-gray-600'}`,
        sizeClass
      )}
    >
      {tmpl?.icon ?? providerId[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Row (auth source, expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileRowProps {
  profileKey: string;
  profile: AuthProfile;
  allModels: Record<string, ModelEntry> | undefined;
  primaryModel: string | undefined;
  imagePrimaryModel: string | undefined;
  imageSupportMap: Map<string, boolean>;
  /** True when key is stored in env.vars (so profile has no key but it is configured) */
  apiKeyConfigured?: boolean;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
  saving?: boolean;
}

function ProfileRow({
  profileKey,
  profile,
  allModels,
  primaryModel,
  imagePrimaryModel,
  imageSupportMap,
  apiKeyConfigured,
  onChange,
  saving = false,
}: ProfileRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const providerId    = providerFromProfileKey(profileKey);
  const tmpl          = getTemplateById(providerId);
  const providerModels = modelsForProvider(profileKey, allModels);
  const modelCount    = Object.keys(providerModels).length;
  const hasStoredSecret = Boolean(
    profile.token ?? profile.apiKey ?? (profile as any).key ?? apiKeyConfigured
  );

  // ── Inline edit state ──
  const [localProfile, setLocalProfile] = useState<string>(profile.profileName ?? profileKey);
  const [localMode, setLocalMode]       = useState<string>(profile.mode ?? (profile as any).type ?? tmpl?.defaultAuthMode ?? 'api_key');

  const updateProfile = (patch: Partial<AuthProfile>) => {
    onChange((prev) => {
      const next: GatewayRuntimeConfig = { ...prev };

      // ── Canonical provider handling ─────────────────────────────
      // For all LLM providers that declare an envKey in PROVIDER_TEMPLATES
      // (OpenAI, DeepSeek, Z.AI, etc.), we:
      //   - store the secret in env.vars[envKey]
      //   - keep only non-sensitive metadata in auth.profiles[profileKey]
      //
      // This matches the official OpenClaw guidance where providers are
      // configured via environment variables + models.providers, and avoids
      // future schema breakage like the recent ZAI change.
      if (tmpl?.envKey) {
        const profiles = { ...(next.auth?.profiles ?? {}) };
        const existing = profiles[profileKey] ?? profile;

        const { token, apiKey, ...restPatch } = patch as any;
        const key: string | undefined =
          (token as string | undefined) ?? (apiKey as string | undefined);

        if (key !== undefined) {
          next.env = {
            ...next.env,
            vars: {
              ...(next.env?.vars ?? {}),
              [tmpl.envKey]: key,
            },
          };
        }

        next.auth = {
          ...next.auth,
          profiles: {
            ...profiles,
            [profileKey]: {
              ...existing,
              ...restPatch,
              // Never persist raw secrets here for envKey-backed providers
              token: undefined,
              apiKey: undefined,
            },
          },
        };

        return next;
      }

      // Fallback for legacy / custom providers without envKey:
      // keep previous behavior (store into auth.profiles directly).
      return {
        ...next,
        auth: {
          ...next.auth,
          profiles: {
            ...next.auth?.profiles,
            [profileKey]: { ...profile, ...patch },
          },
        },
      };
    });
  };

  const removeProfile = () => {
    onChange((prev) => {
      const providerId = profile.provider || providerFromProfileKey(profileKey);
      const tmplForEnv = getTemplateById(providerId);

      // 1) Remove auth profile
      const profiles = { ...prev.auth?.profiles };
      delete profiles[profileKey];

      // 2) Remove env.vars[envKey] for this provider
      let nextEnv = prev.env;
      if (tmplForEnv?.envKey && prev.env?.vars) {
        const vars = { ...prev.env.vars };
        delete vars[tmplForEnv.envKey];
        nextEnv = { ...prev.env, vars };
      }

      // 3) Remove models.providers[providerId]
      let nextModels = prev.models;
      if (prev.models?.providers && prev.models.providers[providerId]) {
        const providers = { ...prev.models.providers };
        delete providers[providerId];
        nextModels = { ...prev.models, providers };
      }

      // 4) Remove from agents.defaults.models all entries for this provider
      const existingModels = prev.agents?.defaults?.models ?? {};
      const modelsToRemove = Object.keys(existingModels).filter(
        (id) => getProviderFromModelId(id) === providerId
      );
      const nextDefaultsModels = { ...existingModels };
      for (const id of modelsToRemove) delete nextDefaultsModels[id];

      const removedModelIds = new Set(modelsToRemove);
      const currentPrimary = prev.agents?.defaults?.model?.primary;
      const currentImagePrimary = prev.agents?.defaults?.imageModel?.primary;
      const nextPrimary =
        Object.keys(nextDefaultsModels).length === 0
          ? undefined
          : currentPrimary && removedModelIds.has(currentPrimary)
            ? Object.keys(nextDefaultsModels)[0] ?? undefined
            : currentPrimary;
      const nextImagePrimary =
        currentImagePrimary && removedModelIds.has(currentImagePrimary)
          ? pickFirstImageCapableModel(
            Object.keys(nextDefaultsModels),
            buildConfiguredImageSupportMap(nextDefaultsModels)
          )
          : resolveImagePrimaryModel(
            currentImagePrimary,
            Object.keys(nextDefaultsModels),
            buildConfiguredImageSupportMap(nextDefaultsModels)
          );

      return {
        ...prev,
        auth: { ...prev.auth, profiles },
        env: nextEnv,
        models: nextModels,
        agents: {
          ...prev.agents,
          defaults: {
            ...prev.agents?.defaults,
            models: nextDefaultsModels,
            model: {
              ...prev.agents?.defaults?.model,
              primary: nextPrimary,
            },
            imageModel: {
              ...prev.agents?.defaults?.imageModel,
              primary: nextImagePrimary,
            },
          },
        },
      };
    });
  };

  const setModelPrimary = (modelId: string) => {
    onChange((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        defaults: {
          ...prev.agents?.defaults,
          model: { ...prev.agents?.defaults?.model, primary: modelId },
        },
      },
    }));
  };

  const setImageModelPrimary = (modelId: string) => {
    onChange((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        defaults: {
          ...prev.agents?.defaults,
          imageModel: { ...prev.agents?.defaults?.imageModel, primary: modelId },
        },
      },
    }));
  };

  const removeModel = (modelId: string) => {
    onChange((prev) => {
      const models = { ...prev.agents?.defaults?.models };
      delete models[modelId];
      const nextPrimary =
        prev.agents?.defaults?.model?.primary === modelId
          ? Object.keys(models)[0] ?? undefined
          : prev.agents?.defaults?.model?.primary;
      const nextImagePrimary =
        prev.agents?.defaults?.imageModel?.primary === modelId
          ? pickFirstImageCapableModel(Object.keys(models), buildConfiguredImageSupportMap(models))
          : resolveImagePrimaryModel(
            prev.agents?.defaults?.imageModel?.primary,
            Object.keys(models),
            buildConfiguredImageSupportMap(models)
          );
      return {
        ...prev,
        agents: {
          ...prev.agents,
          defaults: {
            ...prev.agents?.defaults,
            models,
            model: { ...prev.agents?.defaults?.model, primary: nextPrimary },
            imageModel: { ...prev.agents?.defaults?.imageModel, primary: nextImagePrimary },
          },
        },
      };
    });
  };

  return (
    <div className="mb-2">
      {/* ── Row header ── */}
      <div
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center justify-between px-3.5 py-3',
          'bg-aegis-elevated border border-aegis-border rounded-xl',
          'cursor-pointer transition-all duration-200',
          'hover:border-aegis-border-hover hover:bg-white/[0.02]',
          open && 'rounded-b-none border-aegis-primary/20'
        )}
      >
        {/* left */}
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon providerId={providerId} />
          <div className="min-w-0">
            <div className="font-semibold text-sm text-aegis-text truncate">
              {tmpl?.name ?? providerId}
            </div>
            <div className="text-[11px] text-aegis-text-muted font-mono truncate">{profileKey}</div>
          </div>
        </div>

        {/* right */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[11px] text-aegis-text-muted bg-aegis-surface border border-aegis-border rounded-full px-2.5 py-0.5">
            {t('config.modelCount', { count: modelCount })}
          </span>
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(var(--aegis-success)/0.5)]" />
          <ChevronRight
            size={14}
            className={clsx(
              'text-aegis-text-muted transition-transform duration-200',
              open && 'rotate-90'
            )}
          />
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        <div
          className={clsx(
            'border border-aegis-primary/20 border-t-0',
            'rounded-b-xl bg-white/[0.01] p-4 space-y-4'
          )}
        >
          {/* Profile name + Auth mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
                {t('config.profileName')}
              </label>
              <input
                value={localProfile}
                onChange={(e) => setLocalProfile(e.target.value)}
                onBlur={() => updateProfile({ profileName: localProfile })}
                className={clsx(
                  'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
                  'text-aegis-text text-sm outline-none focus:border-aegis-primary',
                  'transition-colors duration-200'
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
                {t('config.authMode')}
              </label>
              <select
                value={localMode}
                onChange={(e) => {
                  setLocalMode(e.target.value);
                  updateProfile({ mode: e.target.value });
                }}
                className={clsx(
                  'bg-aegis-menu-bg border border-aegis-menu-border rounded-lg px-3 py-2',
                  'text-aegis-text text-sm outline-none focus:border-aegis-primary',
                  'transition-colors duration-200 cursor-pointer'
                )}
              >
                {(tmpl?.authModes ?? ['api_key']).map((m) => (
                  <option key={m} value={m}>
                    {t(`config.authModeOption.${m}` as const, m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.apiKey')}
            </label>
            <div
              className={clsx(
                'rounded-lg border px-3 py-2 text-sm',
                hasStoredSecret
                  ? 'border-aegis-success/20 bg-aegis-success/8 text-aegis-success'
                  : 'border-aegis-border bg-aegis-surface text-aegis-text-muted'
              )}
            >
              {hasStoredSecret
                ? t('config.apiKeyConfigured')
                : t('config.notSet', '未设置')}
            </div>
            <p className="text-[10px] text-aegis-text-muted mt-0.5">
              {t('config.apiKeyReadOnlyHint', '如需更换 API 密钥，请移除后重新添加该提供方。')}
            </p>
          </div>

          {/* Models */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.modelsAndAliases')}
            </label>
            <ChipList
              models={providerModels}
              primaryModel={primaryModel}
              imageModel={imagePrimaryModel}
              imageSupportMap={imageSupportMap}
              onSetPrimary={setModelPrimary}
              onSetImageModel={setImageModelPrimary}
              onRemove={removeModel}
              disabled={saving}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={removeProfile}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                'border border-red-500/20 text-red-400 bg-red-400/5',
                'hover:bg-red-400/10 hover:border-red-500/40',
                'transition-all duration-200'
              )}
            >
              <Trash2 size={12} />{t('config.remove')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Models Provider Row (models-provider source, expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface ModelsProviderRowProps {
  unifiedProvider: UnifiedProvider;
  onChange: (updater: (prev: GatewayRuntimeConfig) => GatewayRuntimeConfig) => void;
  saving?: boolean;
}

function ModelsProviderRow({ unifiedProvider, onChange, saving = false }: ModelsProviderRowProps) {
  const [open, setOpen] = useState(false);
  const { provider, modelsProvider, modelCount, template, envKeyFound } = unifiedProvider;
  const { t } = useTranslation();

  const [localBaseUrl, setLocalBaseUrl] = useState(modelsProvider?.baseUrl ?? '');

  const updateModelsProvider = (patch: Partial<ModelProviderConfig>) => {
    onChange((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        providers: {
          ...prev.models?.providers,
          [provider]: {
            ...prev.models?.providers?.[provider],
            ...patch,
          },
        },
      },
    }));
  };

  const removeModelsProvider = () => {
    onChange((prev) => {
      const providers = { ...prev.models?.providers };
      delete providers[provider];

      const existingModels = prev.agents?.defaults?.models ?? {};
      const modelsToRemove = Object.keys(existingModels).filter(
        (id) => getProviderFromModelId(id) === provider
      );
      const nextDefaultsModels = { ...existingModels };
      for (const id of modelsToRemove) delete nextDefaultsModels[id];

      const removedIds = new Set(modelsToRemove);
      const currentPrimary = prev.agents?.defaults?.model?.primary;
      const currentImagePrimary = prev.agents?.defaults?.imageModel?.primary;
      const nextPrimary =
        Object.keys(nextDefaultsModels).length === 0
          ? undefined
          : currentPrimary && removedIds.has(currentPrimary)
            ? Object.keys(nextDefaultsModels)[0] ?? undefined
            : currentPrimary;
      const nextImagePrimary =
        currentImagePrimary && removedIds.has(currentImagePrimary)
          ? pickFirstImageCapableModel(
            Object.keys(nextDefaultsModels),
            buildConfiguredImageSupportMap(nextDefaultsModels)
          )
          : resolveImagePrimaryModel(
            currentImagePrimary,
            Object.keys(nextDefaultsModels),
            buildConfiguredImageSupportMap(nextDefaultsModels)
          );

      return {
        ...prev,
        models: { ...prev.models, providers },
        agents: {
          ...prev.agents,
          defaults: {
            ...prev.agents?.defaults,
            models: nextDefaultsModels,
            model: {
              ...prev.agents?.defaults?.model,
              primary: nextPrimary,
            },
            imageModel: {
              ...prev.agents?.defaults?.imageModel,
              primary: nextImagePrimary,
            },
          },
        },
      };
    });
  };

  const envKeyName = template?.envKey;

  return (
    <div className="mb-2">
      {/* ── Row header ── */}
      <div
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center justify-between px-3.5 py-3',
          'bg-aegis-elevated border border-aegis-border rounded-xl',
          'cursor-pointer transition-all duration-200',
          'hover:border-aegis-border-hover hover:bg-white/[0.02]',
          open && 'rounded-b-none border-blue-500/20'
        )}
      >
        {/* left */}
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon providerId={provider} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-aegis-text">
                {template?.name ?? provider}
              </span>
              <span
                className={clsx(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                  'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                )}
              >
                ⚡ {t('config.customProvider', 'Custom Provider')}
              </span>
            </div>
            <div className="text-[11px] text-aegis-text-muted font-mono truncate">
              {modelsProvider?.baseUrl ?? provider}
            </div>
          </div>
        </div>

        {/* right */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[11px] text-aegis-text-muted bg-aegis-surface border border-aegis-border rounded-full px-2.5 py-0.5">
            {t('config.modelCount', { count: modelCount })}
          </span>
          <ChevronRight
            size={14}
            className={clsx(
              'text-aegis-text-muted transition-transform duration-200',
              open && 'rotate-90'
            )}
          />
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        <div
          className={clsx(
            'border border-blue-500/20 border-t-0',
            'rounded-b-xl bg-white/[0.01] p-4 space-y-4'
          )}
        >
          {/* Base URL */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.baseUrl', 'Base URL')}
            </label>
            <input
              value={localBaseUrl}
              disabled={saving}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              onBlur={() => updateModelsProvider({ baseUrl: localBaseUrl })}
              className={clsx(
                'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
                'text-aegis-text text-sm font-mono outline-none focus:border-aegis-primary',
                'transition-colors duration-200'
              )}
            />
          </div>

          {/* API Type */}
          {modelsProvider?.api && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
                {t('config.api', 'API')}
              </label>
              <div
                className={clsx(
                  'text-sm text-aegis-text-secondary font-mono',
                  'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2'
                )}
              >
                {modelsProvider.api}
              </div>
            </div>
          )}

          {/* Models list */}
          {modelsProvider?.models && modelsProvider.models.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
                {t('config.models', 'Models')}
              </label>
              <div className="flex flex-wrap gap-2">
                {modelsProvider.models.map((m) => (
                  <span
                    key={m.id}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                      'border border-aegis-border bg-aegis-elevated text-aegis-text-secondary'
                    )}
                  >
                    {m.name ?? m.id}
                    {m.name && m.name !== m.id && (
                      <span className="text-[9px] opacity-50 font-mono">{m.id}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Env Key status */}
          {envKeyName && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
                {t('config.envKey', 'Env Key')}
              </label>
              <div
                className={clsx(
                  'flex items-center gap-2 text-sm font-mono px-3 py-2 rounded-lg border',
                  envKeyFound
                    ? 'bg-aegis-success/8 border-aegis-success/20 text-aegis-success'
                    : 'bg-aegis-surface border-aegis-border text-aegis-text-muted'
                )}
              >
                <span>{envKeyFound ? '✓' : '○'}</span>
                <span>{envKeyName}</span>
                {!envKeyFound && (
                  <span className="text-[10px] opacity-60 ml-1">
                    {t('config.envKeyNotSet', 'not set in env.vars')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={removeModelsProvider}
              disabled={saving}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                'border border-red-500/20 text-red-400 bg-red-400/5',
                'hover:bg-red-400/10 hover:border-red-500/40',
                'transition-all duration-200',
                saving && 'cursor-not-allowed opacity-50 hover:bg-red-400/5 hover:border-red-500/20'
              )}
            >
              <Trash2 size={12} /> {t('common.remove', 'Remove')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Env-Only Row (env-only source, non-expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface EnvOnlyRowProps {
  unifiedProvider: UnifiedProvider;
  onConfigure: (template: ProviderTemplate) => void;
}

function EnvOnlyRow({ unifiedProvider, onConfigure }: EnvOnlyRowProps) {
  const { t } = useTranslation();
  const { provider, template, modelCount } = unifiedProvider;
  const envKeyName = template?.envKey;

  return (
    <div className="mb-2">
      <div
        className={clsx(
          'flex items-center justify-between px-3.5 py-3',
          'bg-aegis-elevated border border-amber-500/20 rounded-xl',
          'transition-all duration-200'
        )}
      >
        {/* left */}
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon providerId={provider} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-aegis-text">
                {template?.name ?? provider}
              </span>
              <span
                className={clsx(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                  'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                )}
              >
                🔑 {t('config.envKeyOnly', 'ENV Key Only')}
              </span>
            </div>
            <div className="text-[11px] text-aegis-text-muted truncate">
              {envKeyName && <span className="font-mono">{envKeyName}</span>}
              {envKeyName && ' · '}
              <span>{t('config.addAuthProfileHint', 'Add an auth profile for full configuration')}</span>
            </div>
          </div>
        </div>

        {/* right */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {modelCount > 0 && (
            <span className="text-[11px] text-aegis-text-muted bg-aegis-surface border border-aegis-border rounded-full px-2.5 py-0.5">
              {t('config.modelCount', { count: modelCount })}
            </span>
          )}
          {template && (
            <button
              onClick={() => onConfigure(template)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                'border border-aegis-primary/30 text-aegis-primary bg-aegis-primary/5',
                'hover:bg-aegis-primary/10 hover:border-aegis-primary/50',
                'transition-all duration-200'
              )}
            >
              <Plus size={11} /> {t('config.configure', 'Configure')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Provider Modal — Step 1: Tabbed picker
// ─────────────────────────────────────────────────────────────────────────────

interface PickStepProps {
  onPick: (tmpl: ProviderTemplate, entry?: ProviderCatalogEntry) => void;
  onClose: () => void;
}

const PICK_TAB_IDS: ProviderTab[] = ['recommended', 'china', 'global', 'coding', 'local'];

function PickStep({ onPick, onClose: _onClose }: PickStepProps) {
  const { t } = useTranslation();
  const [tab, setTab]     = useState<ProviderTab>('recommended');
  const [search, setSearch] = useState('');
  const getCatalogLabel = useCallback(
    (entry: ProviderCatalogEntry) => t(`config.providerCatalog.${entry.catalogId}`, entry.label),
    [t]
  );

  // When searching, scan the full catalog regardless of tab.
  // When not searching, filter by selected tab.
  const entries = useMemo<ProviderCatalogEntry[]>(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return UI_CATALOG.filter(
        (e) =>
          getCatalogLabel(e).toLowerCase().includes(q) ||
          e.label.toLowerCase().includes(q) ||
          e.templateId.toLowerCase().includes(q) ||
          e.catalogId.toLowerCase().includes(q)
      );
    }
    return getCatalogEntriesForTab(tab);
  }, [tab, search, getCatalogLabel]);

  const handleEntryPick = (entry: ProviderCatalogEntry) => {
    const tmpl = getTemplateById(entry.templateId);
    if (!tmpl) return;
    onPick(tmpl, entry);
  };

  const isSearching = Boolean(search.trim());

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-aegis-text-muted" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('config.searchProviders')}
          className={clsx(
            'w-full bg-aegis-surface border border-aegis-border rounded-lg pl-9 pr-3 py-2',
            'text-aegis-text text-sm placeholder:text-aegis-text-muted',
            'outline-none focus:border-aegis-primary transition-colors duration-200'
          )}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-aegis-text-muted hover:text-aegis-text"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Tab bar — hidden while searching */}
      {!isSearching && (
        <div className="flex gap-0 border-b border-aegis-border -mx-5 px-5">
          {PICK_TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={clsx(
                'px-3 py-2 text-[11px] font-semibold border-b-2 whitespace-nowrap transition-colors',
                tab === tabId
                  ? 'border-aegis-primary text-aegis-primary'
                  : 'border-transparent text-aegis-text-muted hover:text-aegis-text'
              )}
            >
              {t(`config.pickTab.${tabId}` as const)}
            </button>
          ))}
        </div>
      )}

      {/* Tab-level advisories */}
      {!isSearching && tab === 'coding' && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 leading-snug">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>{t('config.codingPlanAdvisory')}</span>
        </div>
      )}
      {!isSearching && tab === 'local' && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 leading-snug">
          <span className="flex-shrink-0 mt-0.5">🖥</span>
          <span>{t('config.localProviderAdvisory')}</span>
        </div>
      )}

      {/* Entry grid */}
      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <CatalogCard key={entry.catalogId} entry={entry} onPick={handleEntryPick} />
        ))}
        {entries.length === 0 && (
          <p className="col-span-2 text-center text-xs text-aegis-text-muted py-6">
            {t('config.noProvidersFound')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Region badge colors */
const REGION_STYLE: Record<string, string> = {
  cn:     'bg-red-500/15 text-red-400 border-red-500/20',
  global: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
};

/** Plan badge colors */
const PLAN_STYLE: Record<string, string> = {
  coding:        'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'oauth-portal':'bg-violet-500/15 text-violet-400 border-violet-500/20',
};

function CatalogCard({
  entry,
  onPick,
}: {
  entry: ProviderCatalogEntry;
  onPick: (e: ProviderCatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const tmpl = getTemplateById(entry.templateId);
  if (!tmpl) return null;
  const displayLabel = t(`config.providerCatalog.${entry.catalogId}`, entry.label);

  return (
    <button
      onClick={() => onPick(entry)}
      className={clsx(
        'flex items-start gap-2.5 p-2.5 rounded-xl text-left',
        'border border-aegis-border bg-aegis-elevated',
        'hover:border-aegis-border-hover hover:bg-white/[0.03]',
        'transition-all duration-200 group'
      )}
    >
      {/* Icon */}
      <div
        className={clsx(
          'flex items-center justify-center w-7 h-7 rounded-lg font-black text-aegis-btn-primary-text flex-shrink-0 text-xs mt-0.5',
          `bg-gradient-to-br ${tmpl.colorClass}`
        )}
      >
        {tmpl.icon}
      </div>

      {/* Label + badges */}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-xs text-aegis-text group-hover:text-aegis-primary transition-colors truncate leading-tight">
          {displayLabel}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {entry.region !== 'none' && (
            <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', REGION_STYLE[entry.region])}>
              {entry.region === 'cn' ? 'CN' : 'Global'}
            </span>
          )}
          {entry.plan !== 'general' && (
            <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', PLAN_STYLE[entry.plan] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/20')}>
              {entry.plan === 'coding' ? t('config.codingPlan') : t('config.authModeOption.oauth')}
            </span>
          )}
          {entry.region === 'none' && entry.plan === 'general' && (
            <span className="text-[9px] text-aegis-text-muted font-mono truncate">
              {tmpl.envKey}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Legacy compact card, only used for the existing providers list (not the picker). */
function ProviderCard({
  tmpl,
  onPick,
  compact,
}: {
  tmpl: ProviderTemplate;
  onPick: (t: ProviderTemplate) => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={() => onPick(tmpl)}
      className={clsx(
        'flex items-center gap-2.5 p-2.5 rounded-xl',
        'border border-aegis-border bg-aegis-elevated text-left',
        'hover:border-aegis-border-hover hover:bg-white/[0.03]',
        'transition-all duration-200 group',
        compact && 'flex-col items-center text-center gap-1.5'
      )}
    >
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg font-black text-aegis-btn-primary-text flex-shrink-0',
          `bg-gradient-to-br ${tmpl.colorClass}`,
          compact ? 'w-8 h-8 text-sm' : 'w-7 h-7 text-xs'
        )}
      >
        {tmpl.icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-xs text-aegis-text group-hover:text-aegis-primary transition-colors truncate">
          {tmpl.name}
        </div>
        {!compact && tmpl.envKey && (
          <div className="text-[9px] text-aegis-text-muted font-mono truncate">{tmpl.envKey}</div>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Provider Modal — Step 2: Configure
// ─────────────────────────────────────────────────────────────────────────────

/** Optional provider-level config (e.g. baseUrl for custom) passed when adding */
export interface ProviderConfigOverride {
  baseUrl?: string;
  api?: string;
  textPrimaryModel?: string;
  imagePrimaryModel?: string;
  imageCapableModels?: string[];
}

export interface ConnectionPrecheckProbe {
  providerId: string;
  profileKey: string;
  baseUrl: string;
  apiKey: string;
  modelOverride?: string;
}

interface ConfigureStepProps {
  config: GatewayRuntimeConfig;
  tmpl: ProviderTemplate;
  /** Catalog entry that drove the pick (carries region, plan, baseUrlOverride, warning). */
  catalogEntry?: ProviderCatalogEntry;
  onBack: () => void;
  onSubmit: (
    profileKey: string,
    profile: AuthProfile,
    selectedModels: string[],
    providerConfig?: ProviderConfigOverride,
    connectionProbe?: ConnectionPrecheckProbe
  ) => Promise<boolean>;
  saving: boolean;
}

function ConfigureStep({ config, tmpl, catalogEntry, onBack, onSubmit, saving }: ConfigureStepProps) {
  const { t } = useTranslation();
  const catalogLabel = catalogEntry
    ? t(`config.providerCatalog.${catalogEntry.catalogId}`, catalogEntry.label)
    : undefined;
  // vllm and custom both require a base URL; check template flag
  const needsBaseUrl = tmpl.requiresBaseUrl || tmpl.id === 'custom' || tmpl.id === 'vllm';
  const isCustomLike = needsBaseUrl || tmpl.id === 'siliconflow'; // providers that need manual model IDs
  const [profileName, setProfileName] = useState(`${tmpl.id}:main`);
  const [apiKey, setApiKey]           = useState('');
  const [authMode, setAuthMode]       = useState(tmpl.defaultAuthMode);
  // Pre-fill baseUrl from catalog entry's region-specific override, falling back to template default.
  const [baseUrl, setBaseUrl]         = useState(catalogEntry?.baseUrlOverride ?? tmpl.baseUrl ?? '');
  const [customModelIds, setCustomModelIds] = useState<string[]>([]);
  const [imageCapableModelIds, setImageCapableModelIds] = useState<string[]>([]);
  const [extraModelIds, setExtraModelIds] = useState<string[]>([]);
  // For true custom template: let user override the provider ID written to config
  const [customProviderId, setCustomProviderId] = useState('custom');
  const [textPrimaryModel, setTextPrimaryModel] = useState('');
  const [imagePrimaryModel, setImagePrimaryModel] = useState('');
  const [gatewayModels, setGatewayModels] = useState<GatewayModelOption[]>([]);
  const [providerCatalogModels, setProviderCatalogModels] = useState<GatewayModelOption[]>([]);
  const [loadingGatewayModels, setLoadingGatewayModels] = useState(false);
  const [loadingProviderCatalog, setLoadingProviderCatalog] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>(() =>
    catalogEntry?.defaultModelRef ? [catalogEntry.defaultModelRef] : []
  );
  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const runtimeProviderId = tmpl.id === 'modelstudio'
    ? 'qwen'
    : tmpl.id === 'kimi-coding'
      ? 'kimi'
      : tmpl.id;

  // Effective provider ID written into config:
  // - custom template: user-specified customProviderId (default "custom")
  // - vllm template: "vllm"
  // - all others: tmpl.id
  const effectiveProviderId =
    tmpl.id === 'custom' ? (customProviderId.trim() || 'custom') : runtimeProviderId;

  const resolvedBaseUrl = baseUrl.trim() || catalogEntry?.baseUrlOverride || tmpl.baseUrl;
  const modelsToAdd = buildProviderSubmissionModelIds({
    isCustomLike,
    selectedModels,
    customModelIds,
    extraModelIds,
  });
  const normalizedTemplateProvider = normalizeProviderIdForCatalog(effectiveProviderId);
  const generatedCatalogModelOptions = useMemo(() => {
    const rows = GENERATED_PROVIDER_CATALOG[normalizedTemplateProvider] ?? [];
    const values = rows
      .map((item) => normalizeProviderModelRef(effectiveProviderId, item.id))
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [effectiveProviderId, normalizedTemplateProvider]);
  const gatewayModelOptions = useMemo(() => {
    if (!isCustomLike) return [];
    const values = gatewayModels
      .map((item) => {
        const full = String(item.id ?? '').trim();
        if (!full) return null;
        const ref = full.includes('/')
          ? full
          : item.provider && item.model
            ? `${item.provider}/${item.model}`
            : full;
        const provider = ref.includes('/') ? ref.split('/')[0] : (item.provider ?? '');
        if (!provider) return null;
        if (normalizeProviderIdForCatalog(provider) !== normalizedTemplateProvider) return null;
        return ref;
      })
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [gatewayModels, isCustomLike, normalizedTemplateProvider]);
  const providerCatalogModelOptions = useMemo(() => {
    if (!isCustomLike) return [];
    const values = providerCatalogModels
      .map((item) => normalizeProviderModelRef(effectiveProviderId, item.id))
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [effectiveProviderId, isCustomLike, providerCatalogModels]);
  const hasDynamicCatalogOptions = providerCatalogModelOptions.length > 0 || gatewayModelOptions.length > 0;
  const modelSourceInfo = useMemo(() => {
    if (!isCustomLike) {
      return {
        label: t('config.modelSourceSynced', 'Source: Synced Catalog'),
        detail: t('config.modelSourceSyncedHint', 'Using rcesbot catalog synchronized from OpenClaw source definitions'),
        className: 'bg-green-500/10 text-green-300 border-green-500/20',
      };
    }
    if (providerCatalogModelOptions.length > 0) {
      return {
        label: t('config.modelSourceProvider', 'Source: Provider Catalog'),
        detail: t('config.modelSourceProviderHint', 'Using the live /models response from this provider'),
        className: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      };
    }
    return {
      label: t('config.modelSourceGateway', 'Source: Runtime Catalog'),
      detail: t('config.modelSourceGatewayHint', 'Using the model catalog currently exposed by the connected gateway'),
      className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    };
  }, [isCustomLike, providerCatalogModelOptions.length, t]);
  const suggestedModels = useMemo(
    () => {
      if (!isCustomLike) {
        return generatedCatalogModelOptions;
      }
      if (hasDynamicCatalogOptions) {
        return Array.from(new Set([
          ...providerCatalogModelOptions,
          ...gatewayModelOptions,
        ]));
      }
      return Array.from(new Set([
        ...providerCatalogModelOptions,
        ...gatewayModelOptions,
      ]));
    },
    [
      gatewayModelOptions,
      generatedCatalogModelOptions,
      hasDynamicCatalogOptions,
      isCustomLike,
      providerCatalogModelOptions,
    ]
  );
  const normalizedModelOptions = modelsToAdd
    .map((id) => normalizeProviderModelRef(effectiveProviderId, id))
    .filter((id): id is string => Boolean(id));
  const normalizedExplicitImageModels = imageCapableModelIds
    .map((id) => normalizeProviderModelRef(effectiveProviderId, id))
    .filter((id): id is string => Boolean(id));
  const imageSupportMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const model of GENERATED_PROVIDER_CATALOG[normalizedTemplateProvider] ?? []) {
      if (typeof model.supportsImage !== 'boolean') continue;
      const normalized = normalizeProviderModelRef(effectiveProviderId, model.id);
      if (!normalized) continue;
      map.set(normalized, model.supportsImage);
    }
    for (const item of providerCatalogModels) {
      if (typeof item.supportsImage !== 'boolean') continue;
      const normalized = normalizeProviderModelRef(effectiveProviderId, item.id);
      if (!normalized) continue;
      map.set(normalized, item.supportsImage);
    }
    for (const item of gatewayModels) {
      if (typeof item.supportsImage !== 'boolean') continue;
      const normalized = normalizeProviderModelRef(effectiveProviderId, item.id);
      if (!normalized) continue;
      map.set(normalized, item.supportsImage);
    }
    for (const id of normalizedExplicitImageModels) {
      map.set(id, true);
    }
    return map;
  }, [
    effectiveProviderId,
    gatewayModels,
    normalizedExplicitImageModels,
    normalizedTemplateProvider,
    providerCatalogModels,
  ]);
  const imageModelOptions = useMemo(
    () => normalizedModelOptions.filter((id) => imageSupportMap.get(id) === true),
    [normalizedModelOptions, imageSupportMap]
  );
  const imageCapableModelsForSubmission = useMemo(
    () => normalizedModelOptions.filter((id) => imageSupportMap.get(id) === true),
    [normalizedModelOptions, imageSupportMap]
  );
  const resolvedTextPrimaryModel = normalizedModelOptions.includes(textPrimaryModel)
    ? textPrimaryModel
    : normalizedModelOptions[0] ?? '';
  const resolvedImagePrimaryModel = imageModelOptions.includes(imagePrimaryModel)
    ? imagePrimaryModel
    : imageModelOptions[0] ?? '';
  const canSubmit = Boolean(profileName) && (
    isCustomLike
      ? Boolean(baseUrl.trim()) && modelsToAdd.length > 0
      : modelsToAdd.length > 0
  );
  const submission = canSubmit ? {
    profileKey: profileName,
    profile: {
      provider: effectiveProviderId,
      mode: authMode,
      ...(authMode === 'token' ? { token: apiKey } : { apiKey }),
    } satisfies AuthProfile,
    providerConfig: (
      isCustomLike ||
      resolvedBaseUrl ||
      resolvedTextPrimaryModel ||
      resolvedImagePrimaryModel
    )
      ? {
        baseUrl: isCustomLike || resolvedBaseUrl ? resolvedBaseUrl : undefined,
        api: tmpl.api,
        textPrimaryModel: resolvedTextPrimaryModel || undefined,
        imagePrimaryModel: resolvedImagePrimaryModel || undefined,
        imageCapableModels: imageCapableModelsForSubmission,
      }
      : undefined,
    models: modelsToAdd,
  } : null;

  const previewDraft = useMemo(() => {
    if (!submission) return undefined;
    return applyProviderAddition(
      config,
      submission.profileKey,
      submission.profile,
      submission.models,
      submission.providerConfig
    );
  }, [config, submission]);

  const previewChanges = useMemo(() => {
    if (!previewDraft) return undefined;
    return maskPreviewSecrets(buildPreviewChanges(config, previewDraft));
  }, [config, previewDraft]);

  const handleSubmit = async () => {
    if (!submission || saving) return;
    const preferredProbeModel = stripProviderNamespace(
      effectiveProviderId,
      resolvedTextPrimaryModel || selectedModels[0] || suggestedModels[0] || ''
    ) || undefined;
    const connectionProbe: ConnectionPrecheckProbe | undefined =
      canTestConnection && apiKey.trim()
        ? {
          providerId: effectiveProviderId,
          profileKey: submission.profileKey,
          baseUrl: effectiveBaseUrl,
          apiKey: apiKey.trim(),
          modelOverride: preferredProbeModel,
        }
        : undefined;
    await onSubmit(
      submission.profileKey,
      submission.profile,
      submission.models,
      submission.providerConfig,
      connectionProbe
    );
  };

  const effectiveBaseUrl = baseUrl.trim() || (tmpl.baseUrl ?? '').trim();
  const canTestConnection =
    effectiveBaseUrl &&
    authMode !== 'oauth' &&
    (isCustomLike ||
      tmpl.api === 'openai-completions' ||
      tmpl.api === 'anthropic' ||
      tmpl.api === 'anthropic-messages');

  const testConnection = async () => {
    if (!canTestConnection) return;
    setTestStatus('testing');
    setTestMessage('');
    const firstCustomModel = customModelIds.find((id) => id.trim())?.trim();
    const preferredProbeModel = stripProviderNamespace(
      effectiveProviderId,
      resolvedTextPrimaryModel || selectedModels[0] || suggestedModels[0] || ''
    );
    const result = await testProviderConnection(
      effectiveBaseUrl,
      apiKey,
      tmpl,
      firstCustomModel || preferredProbeModel
    );
    setTestStatus(result.ok ? 'ok' : 'error');
    setTestMessage(result.ok ? t('config.connected') : result.message);
  };

  const hasCatalogRegion = catalogEntry && catalogEntry.region !== 'none';
  const hasCatalogPlan   = catalogEntry && catalogEntry.plan   !== 'general';
  // Warn if user has changed baseUrl away from what the catalog specified.
  const baseUrlDrifted   = catalogEntry?.baseUrlOverride && baseUrl.trim() !== catalogEntry.baseUrlOverride;

  useEffect(() => {
    if (isCustomLike || selectedModels.length > 0 || suggestedModels.length === 0) return;
    const initialSelection: string[] = [];
    if (catalogEntry?.defaultModelRef) {
      const normalizedDefault = normalizeProviderModelRef(effectiveProviderId, catalogEntry.defaultModelRef);
      if (normalizedDefault && suggestedModels.includes(normalizedDefault)) {
        initialSelection.push(normalizedDefault);
      }
    }
    if (initialSelection.length === 0) {
      initialSelection.push(suggestedModels[0]);
    }
    setSelectedModels(initialSelection.filter(Boolean));
  }, [
    catalogEntry?.defaultModelRef,
    effectiveProviderId,
    isCustomLike,
    selectedModels.length,
    suggestedModels,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!isCustomLike) {
      setGatewayModels([]);
      setLoadingGatewayModels(false);
      return;
    }
    setLoadingGatewayModels(true);
    gateway.getAvailableModels()
      .then((res) => {
        if (cancelled) return;
        setGatewayModels(parseGatewayModelsResponse(res));
      })
      .catch(() => {
        if (cancelled) return;
        setGatewayModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGatewayModels(false);
      });
    return () => { cancelled = true; };
  }, [isCustomLike]);

  useEffect(() => {
    let cancelled = false;
    if (
      !effectiveBaseUrl ||
      authMode === 'oauth' ||
      !apiKey.trim() ||
      !isCustomLike
    ) {
      setProviderCatalogModels([]);
      setLoadingProviderCatalog(false);
      return;
    }
    setLoadingProviderCatalog(true);
    fetchProviderModelCatalog(effectiveBaseUrl, apiKey, tmpl)
      .then((rows) => {
        if (cancelled) return;
        const normalizedRows = rows
          .map((item) => {
            const id = normalizeProviderModelRef(effectiveProviderId, item.id);
            if (!id) return null;
            return { ...item, id };
          })
          .filter((item): item is GatewayModelOption => Boolean(item));
        const deduped = new Map<string, GatewayModelOption>();
        for (const item of normalizedRows) {
          if (!deduped.has(item.id)) deduped.set(item.id, item);
        }
        setProviderCatalogModels(Array.from(deduped.values()));
      })
      .catch(() => {
        if (cancelled) return;
        setProviderCatalogModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProviderCatalog(false);
      });
    return () => { cancelled = true; };
  }, [effectiveBaseUrl, authMode, apiKey, tmpl, effectiveProviderId, isCustomLike]);

  return (
    <div className="flex flex-col gap-4">
      {/* Provider header — includes region/plan badges when driven by a catalog entry */}
      <div className="flex items-center gap-3 p-3 bg-aegis-elevated border border-aegis-border rounded-xl">
        <div
          className={clsx(
            'flex items-center justify-center w-10 h-10 rounded-xl font-black text-aegis-btn-primary-text text-base flex-shrink-0',
            `bg-gradient-to-br ${tmpl.colorClass}`
          )}
        >
          {tmpl.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-aegis-text">
              {catalogLabel ?? tmpl.name}
            </span>
            {hasCatalogRegion && (
              <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', REGION_STYLE[catalogEntry.region])}>
                {catalogEntry.region === 'cn' ? 'CN' : 'Global'}
              </span>
            )}
            {hasCatalogPlan && (
              <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', PLAN_STYLE[catalogEntry.plan] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/20')}>
                {catalogEntry.plan === 'coding' ? t('config.codingPlan') : t('config.authModeOption.oauth')}
              </span>
            )}
          </div>
          {tmpl.docsUrl && (
            <a
              href={tmpl.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-aegis-primary hover:underline"
            >
              Docs ↗
            </a>
          )}
        </div>
      </div>

      {/* Coding plan warning — shown whenever the selected catalog entry is a coding plan */}
      {catalogEntry?.planWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 leading-snug">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>{catalogEntry.planWarning}</span>
        </div>
      )}

      {/* Profile name */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
          {t('config.profileName')}
        </label>
        <input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          className={clsx(
            'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
            'text-aegis-text text-sm font-mono outline-none focus:border-aegis-primary',
            'transition-colors duration-200'
          )}
        />
      </div>

      {/* Provider ID override — only shown for the "custom" template */}
      {tmpl.id === 'custom' && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
            {t('config.providerId')}
          </label>
          <input
            value={customProviderId}
            onChange={(e) => {
              setCustomProviderId(e.target.value);
              setProfileName(`${e.target.value.trim() || 'custom'}:main`);
            }}
            placeholder={t('config.providerIdPlaceholder')}
            className={clsx(
              'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
              'text-aegis-text text-sm font-mono outline-none focus:border-aegis-primary',
              'transition-colors duration-200'
            )}
          />
          <p className="text-[10px] text-aegis-text-muted leading-tight">
            {t('config.providerIdHint')}
          </p>
        </div>
      )}

      {/* API Endpoint (Base URL) — for providers that require a URL, or when baseUrl was overridden by catalog */}
      {(isCustomLike || catalogEntry?.baseUrlOverride) && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
            {t('config.baseUrl')}
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={tmpl.baseUrl || t('config.baseUrlPlaceholder')}
            className={clsx(
              'bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2',
              'text-aegis-text text-sm font-mono outline-none focus:border-aegis-primary',
              'transition-colors duration-200'
            )}
          />
          {/* Drift warning: user changed the pre-filled URL */}
          {baseUrlDrifted && (
            <p className="text-[10px] text-amber-400 leading-tight">
              {t('config.baseUrlDriftWarning', { url: catalogEntry?.baseUrlOverride })}
            </p>
          )}
          {tmpl.hint && !baseUrlDrifted && (
            <p className="text-[10px] text-aegis-text-muted leading-tight">{tmpl.hint}</p>
          )}
        </div>
      )}

      {/* Model IDs — for providers that require manual model entry */}
      {isCustomLike && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.modelId')}
            </label>
            <ChipInput
              values={customModelIds}
              onChange={setCustomModelIds}
              placeholder={t('config.modelIdPlaceholder')}
            />
            <p className="text-[10px] text-aegis-text-muted leading-tight">
              {t('config.modelIdHint', { providerId: effectiveProviderId })}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.imageCapableModelsLabel', 'Image-capable Model IDs')}
            </label>
            <ChipInput
              values={imageCapableModelIds}
              onChange={setImageCapableModelIds}
              placeholder={t('config.imageCapableModelsPlaceholder', 'Enter model IDs that support images')}
            />
            <p className="text-[10px] text-aegis-text-muted leading-tight">
              {t(
                'config.imageCapableModelsHint',
                'Manual and unsupported providers default to text-only. Add only model IDs that really support image input.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Auth mode + API Key */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
            {t('config.authMode')}
          </label>
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value)}
            className={clsx(
              'bg-aegis-menu-bg border border-aegis-menu-border rounded-lg px-3 py-2',
              'text-aegis-text text-sm outline-none focus:border-aegis-primary',
              'transition-colors duration-200 cursor-pointer'
            )}
          >
            {tmpl.authModes.map((m) => (
              <option key={m} value={m}>
                {t(`config.authModeOption.${m}` as const, m)}
              </option>
            ))}
          </select>
        </div>
        {authMode !== 'oauth' && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.apiKey')}
            </label>
            <MaskedInput
              value={apiKey}
              onChange={setApiKey}
              placeholder={tmpl.envKey || t('config.apiKeyPlaceholder')}
            />
          </div>
        )}
      </div>

      {tmpl.envKey && (
        <p className="text-[10px] text-aegis-text-muted -mt-2">
          {t('config.envKeyHint', { envKey: tmpl.envKey })}
          {tmpl.envKeyAlt && tmpl.envKeyAlt.length > 0 && (
            <span className="opacity-70"> {t('config.envKeyAltHint', { keys: tmpl.envKeyAlt.join(', ') })}</span>
          )}
        </p>
      )}

      {/* Test connection — all providers with baseUrl (OpenClaw-style: GET models endpoint) */}
      {canTestConnection && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={testConnection}
            disabled={testStatus === 'testing'}
            className={clsx(
              'self-start flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
              'border border-aegis-border text-aegis-text-secondary',
              'hover:bg-white/[0.03] hover:border-aegis-border-hover',
              'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200'
            )}
          >
            {testStatus === 'testing' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : null}
            {t('config.testConnection')}
          </button>
          {testStatus === 'ok' && (
            <p className="text-[11px] text-green-500 font-medium">{testMessage}</p>
          )}
          {testStatus === 'error' && testMessage && (
            <p className="text-[11px] text-red-400 font-mono break-all">{testMessage}</p>
          )}
        </div>
      )}

      {/* Suggested models */}
      {suggestedModels.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.suggestedModels')}
            </label>
            <span
              className={clsx(
                'text-[10px] font-semibold px-2 py-1 rounded-full border',
                modelSourceInfo.className
              )}
            >
              {modelSourceInfo.label}
            </span>
          </div>
          <p className="text-[10px] text-aegis-text-muted leading-tight">
            {modelSourceInfo.detail}
          </p>
          {(loadingGatewayModels || loadingProviderCatalog) && (
            <p className="text-[10px] text-aegis-text-muted">{t('config.loading', 'Loading...')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {suggestedModels.map((id) => {
              const selected = selectedModels.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleModel(id)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                    'border transition-all duration-200',
                    selected
                      ? 'border-aegis-primary/40 bg-aegis-primary/10 text-aegis-primary'
                      : 'border-aegis-border bg-aegis-elevated text-aegis-text-secondary hover:border-aegis-border-hover'
                  )}
                >
                  {selected && <CheckCircle size={10} />}
                  <span>{id}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isCustomLike && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
            {t('config.modelId')}
          </label>
          <ChipInput
            values={extraModelIds}
            onChange={setExtraModelIds}
            placeholder={t('config.modelIdPlaceholder')}
          />
          <p className="text-[10px] text-aegis-text-muted leading-tight">
            {t('config.modelIdHint', { providerId: effectiveProviderId })}
          </p>
        </div>
      )}

      {normalizedModelOptions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.primaryModel')}
            </label>
            <select
              value={resolvedTextPrimaryModel}
              onChange={(e) => setTextPrimaryModel(e.target.value)}
              className={clsx(
                'bg-aegis-menu-bg border border-aegis-menu-border rounded-lg px-3 py-2',
                'text-aegis-text text-sm outline-none focus:border-aegis-primary',
                'transition-colors duration-200 cursor-pointer'
              )}
            >
              {normalizedModelOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
              {t('config.imageModel', 'Image Model')}
            </label>
            <select
              value={resolvedImagePrimaryModel}
              onChange={(e) => setImagePrimaryModel(e.target.value)}
              className={clsx(
                'bg-aegis-menu-bg border border-aegis-menu-border rounded-lg px-3 py-2',
                'text-aegis-text text-sm outline-none focus:border-aegis-primary',
                'transition-colors duration-200 cursor-pointer'
              )}
            >
              <option value="">{t('config.notSet', 'Not set')}</option>
              {imageModelOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            {imageModelOptions.length === 0 && (
              <p className="text-[10px] text-aegis-text-muted">
                {t('config.imageModelStrictHint', 'No image-capable models detected in current selection')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Config preview — shows exactly what will be written before the user clicks Add */}
      {(apiKey || effectiveBaseUrl || selectedModels.length > 0 || customModelIds.length > 0) && (
        <div className="rounded-xl border border-aegis-border bg-aegis-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-aegis-text-muted">
              {t('config.configPreviewTitle')}
            </span>
            <button
              type="button"
              onClick={() => setPreviewOpen((open) => !open)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold',
                'text-aegis-text-muted hover:text-aegis-text hover:bg-white/[0.04]',
                'transition-all duration-200'
              )}
            >
              <ChevronRight
                size={12}
                className={clsx('transition-transform duration-200', previewOpen && 'rotate-90')}
              />
              {previewOpen ? t('common.hide') : t('common.show')}
            </button>
          </div>
          {previewOpen && (
            <div className="border-t border-aegis-border p-3">
              {previewChanges ? (
                <pre className="whitespace-pre-wrap break-all text-[10px] font-mono leading-relaxed text-aegis-text-muted">
                  {JSON.stringify(previewChanges, null, 2)}
                </pre>
              ) : (
                <span className="text-[10px] italic text-aegis-text-muted">
                  {t('config.apiKeyEmpty')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2 pt-1 border-t border-aegis-border">
        <button
          onClick={onBack}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'border border-aegis-border text-aegis-text-secondary',
            'hover:bg-white/[0.03] hover:border-aegis-border-hover',
            'transition-all duration-200'
          )}
        >
          {t('config.back')}
        </button>
        <button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit || saving}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
            'text-sm font-bold bg-aegis-primary text-aegis-btn-primary-text',
            'hover:brightness-110 transition-all duration-200',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <Save size={14} /> {saving ? t('config.saving') : t('config.saveAndRestart')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Provider Modal — Shell
// ─────────────────────────────────────────────────────────────────────────────

interface AddProviderModalProps {
  config: GatewayRuntimeConfig;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    profileKey: string,
    profile: AuthProfile,
    models: string[],
    providerConfig?: ProviderConfigOverride,
    connectionProbe?: ConnectionPrecheckProbe
  ) => Promise<boolean>;
  /** Pre-select a template and skip to the configure step */
  initialTemplate?: ProviderTemplate;
}

function AddProviderModal({ config, saving, onClose, onSubmit, initialTemplate }: AddProviderModalProps) {
  const { t } = useTranslation();
  const [step, setStep]               = useState<'pick' | 'configure'>(
    initialTemplate ? 'configure' : 'pick'
  );
  const [selectedTmpl, setSelectedTmpl]   = useState<ProviderTemplate | null>(initialTemplate ?? null);
  const [selectedEntry, setSelectedEntry] = useState<ProviderCatalogEntry | undefined>(undefined);

  const handlePick = (tmpl: ProviderTemplate, entry?: ProviderCatalogEntry) => {
    setSelectedTmpl(tmpl);
    setSelectedEntry(entry);
    setStep('configure');
  };

  const handleBack = () => {
    setStep('pick');
    setSelectedTmpl(null);
    setSelectedEntry(undefined);
  };

  return (
    /* backdrop — only close via header X to avoid losing half-filled form */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      {/* modal */}
      <div
        className={clsx(
          'bg-aegis-card-solid border border-aegis-border rounded-2xl w-full max-w-lg',
          'max-h-[90vh] overflow-hidden flex flex-col',
          'shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
          'animate-[pop-in_0.15s_ease-out]'
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-aegis-border">
          <h3 className="text-sm font-bold text-aegis-text">
            {step === 'pick'
              ? t('config.addProvider')
              : t('config.configureProvider', {
                name: selectedEntry
                  ? t(`config.providerCatalog.${selectedEntry.catalogId}`, selectedEntry.label)
                  : selectedTmpl?.name ?? t('config.providers'),
              })}
          </h3>
          <button
            onClick={onClose}
            className="text-aegis-text-muted hover:text-aegis-text transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="p-5 overflow-y-auto flex-1">
          {step === 'pick' ? (
            <PickStep onPick={handlePick} onClose={onClose} />
          ) : selectedTmpl ? (
            <ConfigureStep
              config={config}
              tmpl={selectedTmpl}
              catalogEntry={selectedEntry}
              onBack={handleBack}
              saving={saving}
              onSubmit={async (key, profile, models, providerConfig, connectionProbe) => {
                const ok = await onSubmit(key, profile, models, providerConfig, connectionProbe);
                if (ok) onClose();
                return ok;
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProvidersTab — Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProvidersTab({ config, onChange, onApplyAndSave, saving }: ProvidersTabProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal]                   = useState(false);
  const [modalInitialTemplate, setModalInitialTemplate] = useState<ProviderTemplate | undefined>();

  const allModels    = config.agents?.defaults?.models ?? {};
  const allModelImageSupportMap = useMemo(
    () => buildConfiguredImageSupportMap(allModels),
    [allModels]
  );
  const primaryModel = config.agents?.defaults?.model?.primary;
  const imagePrimaryModel = config.agents?.defaults?.imageModel?.primary;
  const imageGenerationPrimaryModel = config.agents?.defaults?.imageGenerationModel?.primary;
  const videoGenerationPrimaryModel = config.agents?.defaults?.videoGenerationModel?.primary;
  const imageGenerationOptions = useMemo(
    () => Array.from(new Set([
      ...GENERATED_IMAGE_GENERATION_MODELS.map((entry) => entry.id),
      ...(imageGenerationPrimaryModel ? [imageGenerationPrimaryModel] : []),
    ])).sort((a, b) => a.localeCompare(b)),
    [imageGenerationPrimaryModel]
  );
  const videoGenerationOptions = useMemo(
    () => Array.from(new Set([
      ...GENERATED_VIDEO_GENERATION_MODELS.map((entry) => entry.id),
      ...(videoGenerationPrimaryModel ? [videoGenerationPrimaryModel] : []),
    ])).sort((a, b) => a.localeCompare(b)),
    [videoGenerationPrimaryModel]
  );

  useEffect(() => {
    const modelIds = Object.keys(allModels);
    if (modelIds.length === 0) return;
    const desiredPrimary = primaryModel && modelIds.includes(primaryModel)
      ? primaryModel
      : modelIds[0];
    const desiredImagePrimary = resolveImagePrimaryModel(
      imagePrimaryModel,
      modelIds,
      allModelImageSupportMap
    );
    if (desiredPrimary === primaryModel && desiredImagePrimary === imagePrimaryModel) return;
    onChange((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        defaults: {
          ...prev.agents?.defaults,
          model: {
            ...prev.agents?.defaults?.model,
            primary: desiredPrimary,
          },
          imageModel: desiredImagePrimary
            ? {
              ...prev.agents?.defaults?.imageModel,
              primary: desiredImagePrimary,
            }
            : undefined,
        },
      },
    }));
  }, [allModelImageSupportMap, allModels, imagePrimaryModel, onChange, primaryModel]);

  // ── Build unified provider list ──
  const unifiedProviders = useMemo(() => buildUnifiedProviders(config), [config]);

  // ── Stats ──
  const uniqueProviderCount = useMemo(
    () => new Set(unifiedProviders.map((p) => p.provider)).size,
    [unifiedProviders]
  );
  const modelCount = Object.keys(allModels).length;
  const aliasCount = Object.values(allModels).filter((m) => m.alias).length;

  // ── Open modal (optionally with a pre-selected template) ──
  const openModal = useCallback((template?: ProviderTemplate) => {
    setModalInitialTemplate(template);
    setShowModal(true);
  }, []);

  // ── Add provider (auth profile + models) ──
  const handleAdd = (
    profileKey: string,
    profile: AuthProfile,
    models: string[],
    providerConfig?: ProviderConfigOverride
  ) => {
    onChange((prev) => applyProviderAddition(prev, profileKey, profile, models, providerConfig));
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── A) Overview Hero Card ── */}
      <div
        className={clsx(
          'rounded-xl border border-aegis-border p-5',
          'bg-white/[0.02] backdrop-blur-sm'
        )}
      >
        {/* top */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-aegis-text">🤖 {t('config.providers')}</h2>
            <p className="text-xs text-aegis-text-muted mt-0.5">
              {t('config.manageProvidersDesc')}
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
              'bg-aegis-primary text-aegis-btn-primary-text',
              'hover:brightness-110 transition-all duration-200'
            )}
          >
            <Plus size={12} /> {t('config.addProvider')}
          </button>
        </div>

        {/* stats row */}
        <div className="flex gap-5 p-3.5 bg-aegis-surface border border-aegis-border rounded-xl">
          <StatCard value={uniqueProviderCount} label={t('config.providers')} colorClass="text-aegis-primary" />
          <div className="w-px bg-aegis-border" />
          <StatCard value={modelCount} label={t('config.models')}  colorClass="text-blue-400" />
          <div className="w-px bg-aegis-border" />
          <StatCard value={aliasCount} label={t('config.aliases')} colorClass="text-purple-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-3 p-3.5 bg-aegis-surface border border-aegis-primary/20 rounded-xl">
            <div
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
                'bg-aegis-primary/10 border border-aegis-primary/20'
              )}
            >
              ⭐
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-aegis-text-muted uppercase tracking-wider font-bold">
                {t('config.primaryModel')}
              </div>
              <div className="text-sm font-bold text-aegis-primary truncate mt-0.5">
                {primaryModel ?? (
                  <span className="text-aegis-text-muted font-normal italic">
                    {t('config.notSet', 'Not set')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 bg-aegis-surface border border-blue-500/20 rounded-xl">
            <div
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
                'bg-blue-500/10 border border-blue-500/20'
              )}
            >
              🖼
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-aegis-text-muted uppercase tracking-wider font-bold">
                {t('config.imageModel', 'Image Model')}
              </div>
              <div className="text-sm font-bold text-blue-400 truncate mt-0.5">
                {imagePrimaryModel ?? (
                  <span className="text-aegis-text-muted font-normal italic">
                    {t('config.notSet', 'Not set')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-3 p-3.5 bg-aegis-surface border border-emerald-500/20 rounded-xl">
            <div
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
                'bg-emerald-500/10 border border-emerald-500/20'
              )}
            >
              🎨
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-aegis-text-muted uppercase tracking-wider font-bold">
                {t('config.imageGenerationModel', 'Image Generation Model')}
              </div>
              <div className="text-sm font-bold text-emerald-400 truncate mt-0.5">
                {imageGenerationPrimaryModel ?? (
                  <span className="text-aegis-text-muted font-normal italic">
                    {t('config.notSet', 'Not set')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 bg-aegis-surface border border-pink-500/20 rounded-xl">
            <div
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
                'bg-pink-500/10 border border-pink-500/20'
              )}
            >
              🎬
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-aegis-text-muted uppercase tracking-wider font-bold">
                {t('config.videoGenerationModel', 'Video Generation Model')}
              </div>
              <div className="text-sm font-bold text-pink-400 truncate mt-0.5">
                {videoGenerationPrimaryModel ?? (
                  <span className="text-aegis-text-muted font-normal italic">
                    {t('config.notSet', 'Not set')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── B) Unified Providers List ── */}
      <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-aegis-border">
          <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
              🔌 {t('config.providers')}
            </h3>
        </div>
        <div className="p-4">
          {unifiedProviders.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="text-4xl opacity-40">🤖</div>
              <p className="text-sm font-medium text-aegis-text-secondary">
                {t('config.noProviders')}
              </p>
              <p className="text-xs text-aegis-text-muted">{t('config.addFirstProvider')}</p>
              <button
                onClick={() => openModal()}
                className={clsx(
                  'mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold',
                  'bg-aegis-primary text-aegis-btn-primary-text hover:brightness-110',
                  'transition-all duration-200'
                )}
              >
                <Plus size={14} /> {t('config.addProvider')}
              </button>
            </div>
          ) : (
            <>
              {unifiedProviders.map((up) => {
                if (up.source === 'auth') {
                  return (
                    <ProfileRow
                      key={up.key}
                      profileKey={up.profileKey!}
                      profile={up.authProfile!}
                      allModels={allModels}
                      primaryModel={primaryModel}
                      imagePrimaryModel={imagePrimaryModel}
                      imageSupportMap={allModelImageSupportMap}
                      apiKeyConfigured={up.envKeyFound}
                      onChange={onChange}
                      saving={saving}
                    />
                  );
                }
                if (up.source === 'models-provider') {
                  return (
                    <ModelsProviderRow
                      key={up.key}
                      unifiedProvider={up}
                      onChange={onChange}
                      saving={saving}
                    />
                  );
                }
                // env-only
                return (
                  <EnvOnlyRow
                    key={up.key}
                    unifiedProvider={up}
                    onConfigure={(tmpl) => openModal(tmpl)}
                  />
                );
              })}

              {/* Add row */}
              <button
                onClick={() => openModal()}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 p-4 mt-1',
                  'border-2 border-dashed border-aegis-border rounded-xl',
                  'text-xs font-semibold text-aegis-text-muted',
                  'hover:border-aegis-primary hover:text-aegis-primary hover:bg-aegis-primary/5',
                  'transition-all duration-200 cursor-pointer'
                )}
              >
                <Plus size={13} /> {t('config.addProvider')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── C) Models & Aliases ── */}
      {modelCount > 0 && (
        <div className="rounded-xl border border-aegis-border bg-aegis-elevated overflow-hidden">
          <div className="px-5 py-3.5 border-b border-aegis-border">
            <h3 className="text-xs font-bold uppercase tracking-widest text-aegis-text-secondary">
              📝 {t('config.modelsAndAliases')}
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-aegis-border bg-aegis-surface p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-aegis-text-muted mb-1.5">
                  {t('config.imageGenerationModel', 'Image Generation Model')}
                </div>
                <select
                  className="w-full rounded-lg border border-aegis-border bg-aegis-elevated px-2 py-2 text-xs text-aegis-text"
                  value={imageGenerationPrimaryModel ?? ''}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value || undefined;
                    onChange((prev) => ({
                      ...prev,
                      agents: {
                        ...prev.agents,
                        defaults: {
                          ...prev.agents?.defaults,
                          imageGenerationModel: value
                            ? { ...prev.agents?.defaults?.imageGenerationModel, primary: value }
                            : undefined,
                        },
                      },
                    }));
                  }}
                >
                  <option value="">{t('config.notSet', 'Not set')}</option>
                  {imageGenerationOptions.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-aegis-border bg-aegis-surface p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-aegis-text-muted mb-1.5">
                  {t('config.videoGenerationModel', 'Video Generation Model')}
                </div>
                <select
                  className="w-full rounded-lg border border-aegis-border bg-aegis-elevated px-2 py-2 text-xs text-aegis-text"
                  value={videoGenerationPrimaryModel ?? ''}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value || undefined;
                    onChange((prev) => ({
                      ...prev,
                      agents: {
                        ...prev.agents,
                        defaults: {
                          ...prev.agents?.defaults,
                          videoGenerationModel: value
                            ? { ...prev.agents?.defaults?.videoGenerationModel, primary: value }
                            : undefined,
                        },
                      },
                    }));
                  }}
                >
                  <option value="">{t('config.notSet', 'Not set')}</option>
                  {videoGenerationOptions.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>
            </div>
            <ChipList
              models={allModels}
              primaryModel={primaryModel}
              imageModel={imagePrimaryModel}
              imageSupportMap={allModelImageSupportMap}
              disabled={saving}
              onSetPrimary={(id) => {
                onChange((prev) => ({
                  ...prev,
                  agents: {
                    ...prev.agents,
                    defaults: {
                      ...prev.agents?.defaults,
                      model: { ...prev.agents?.defaults?.model, primary: id },
                    },
                  },
                }));
              }}
              onSetImageModel={(id) => {
                onChange((prev) => ({
                  ...prev,
                  agents: {
                    ...prev.agents,
                    defaults: {
                      ...prev.agents?.defaults,
                      imageModel: { ...prev.agents?.defaults?.imageModel, primary: id },
                    },
                  },
                }));
              }}
              onRemove={(id) => {
                onChange((prev) => {
                  const models = { ...prev.agents?.defaults?.models };
                  delete models[id];
                  const nextPrimary =
                    prev.agents?.defaults?.model?.primary === id
                      ? Object.keys(models)[0] ?? undefined
                      : prev.agents?.defaults?.model?.primary;
                  const nextImagePrimary =
                    prev.agents?.defaults?.imageModel?.primary === id
                      ? pickFirstImageCapableModel(
                        Object.keys(models),
                        buildConfiguredImageSupportMap(models)
                      )
                      : resolveImagePrimaryModel(
                        prev.agents?.defaults?.imageModel?.primary,
                        Object.keys(models),
                        buildConfiguredImageSupportMap(models)
                      );
                  return {
                    ...prev,
                    agents: {
                      ...prev.agents,
                      defaults: {
                        ...prev.agents?.defaults,
                        models,
                        model: { ...prev.agents?.defaults?.model, primary: nextPrimary },
                        imageModel: { ...prev.agents?.defaults?.imageModel, primary: nextImagePrimary },
                      },
                    },
                  };
                });
              }}
            />
          </div>
        </div>
      )}

      {/* ── Add Provider Modal ── */}
      {showModal && (
        <AddProviderModal
          config={config}
          saving={saving}
          onClose={() => {
            setShowModal(false);
            setModalInitialTemplate(undefined);
          }}
          onSubmit={async (profileKey, profile, models, providerConfig, connectionProbe) =>
            onApplyAndSave(
              (prev) => applyProviderAddition(prev, profileKey, profile, models, providerConfig),
              { connectionProbe }
            )
          }
          initialTemplate={modalInitialTemplate}
        />
      )}
    </div>
  );
}

export default ProvidersTab;

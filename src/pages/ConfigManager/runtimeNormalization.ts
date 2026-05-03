import type { GatewayRuntimeConfig } from './types';

export interface GeneratedProviderCatalogEntry {
  id: string;
  supportsImage?: boolean;
}

function ensureMainAgentInList(list: GatewayRuntimeConfig['agents'] extends { list?: infer T } ? T : any): any {
  const items = Array.isArray(list) ? list : [];
  const existingMain = items.find((item: any) => item?.id === 'main');
  const main = existingMain && typeof existingMain === 'object' ? existingMain : { id: 'main' };
  const others = items.filter((item: any) => item?.id !== 'main');
  return [main, ...others];
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
  return undefined;
}

function sanitizeAgentModelEntry(value: any): Record<string, any> {
  if (!value || typeof value !== 'object') return {};

  const next: Record<string, any> = {};
  if (typeof value.alias === 'string') next.alias = value.alias;
  if (value.params && typeof value.params === 'object' && !Array.isArray(value.params)) {
    next.params = value.params;
  }
  if (typeof value.streaming === 'boolean') next.streaming = value.streaming;
  return next;
}

export function normalizeModelsProvidersForRuntime(params: {
  providers: Record<string, any> | undefined;
  agents?: GatewayRuntimeConfig['agents'] | undefined;
  generatedProviderCatalog: Record<string, GeneratedProviderCatalogEntry[]>;
  canonicalProviderId: (providerId: string | undefined) => string;
  stripProviderPrefix: (providerId: string, modelId: string | undefined) => string;
  canonicalizeModelRef?: (modelRef: string | undefined) => string | undefined;
  getTemplateById: (providerId: string) => unknown;
}): Record<string, any> | undefined {
  const { providers } = params;
  if (!providers) return providers;

  const out: Record<string, any> = {};
  for (const [providerId, providerConfig] of Object.entries(providers)) {
    const canonicalId = params.canonicalProviderId(providerId) || providerId;
    const template = params.getTemplateById(canonicalId);
    const generatedRows = params.generatedProviderCatalog[canonicalId] ?? [];
    const knownModelIds = new Set(
      generatedRows.map((model) => params.stripProviderPrefix(canonicalId, model.id))
    );
    const existing = out[canonicalId] ?? {};
    const next = {
      ...existing,
      ...(providerConfig ?? {}),
    } as Record<string, any>;
    const models = Array.isArray(providerConfig?.models) ? providerConfig.models : undefined;
    const shouldAlwaysKeepExplicitModels =
      !template || canonicalId === 'custom' || canonicalId === 'vllm' || canonicalId === 'ollama';

    if (models) {
      if (template && !shouldAlwaysKeepExplicitModels) {
        const allKnown = models.every((model: any) =>
          knownModelIds.has(params.stripProviderPrefix(canonicalId, String(model?.id ?? '')))
        );
        if (allKnown) {
          // Keep template providers schema-safe while still letting OpenClaw
          // derive capabilities from the bundled catalog instead of half-written
          // explicit model entries.
          next.models = [];
        } else {
          next.models = models.map((model: any) => {
            const strippedId = params.stripProviderPrefix(canonicalId, String(model?.id ?? ''));
            const generatedSupport = generatedRows.find(
              (row) => params.stripProviderPrefix(canonicalId, row.id) === strippedId
            )?.supportsImage;
            const supportsImage =
              resolveModelSupportsImage(model)
              ?? generatedSupport
              ?? false;
            return {
              ...model,
              id: strippedId,
              supportsImage,
              input: supportsImage ? ['text', 'image'] : ['text'],
            };
          });
        }
      } else {
        next.models = models.map((model: any) => {
          const strippedId = params.stripProviderPrefix(canonicalId, String(model?.id ?? ''));
          const supportsImage =
            resolveModelSupportsImage(model)
            ?? false;
          return {
            ...model,
            id: strippedId,
            supportsImage,
            input: supportsImage ? ['text', 'image'] : ['text'],
          };
        });
      }
    } else if (template) {
      next.models = [];
    }

    out[canonicalId] = next;
  }

  return out;
}

export function normalizeAgentsForRuntime(params: {
  agents: GatewayRuntimeConfig['agents'] | undefined;
  providers?: Record<string, any> | undefined;
  generatedProviderCatalog: Record<string, GeneratedProviderCatalogEntry[]>;
  canonicalizeModelRef: (modelRef: string | undefined) => string | undefined;
}): GatewayRuntimeConfig['agents'] | undefined {
  const { agents } = params;
  if (!agents?.defaults) return agents;

  const nextModels = agents.defaults.models
    ? Object.fromEntries(
      Object.entries(agents.defaults.models).map(([id, value]) => [
        params.canonicalizeModelRef(id) ?? id,
        sanitizeAgentModelEntry(value),
      ])
    )
    : agents.defaults.models;

  const modelSupportMap = new Map<string, boolean>();
  for (const rows of Object.values(params.generatedProviderCatalog)) {
    for (const model of rows) {
      const normalizedId = params.canonicalizeModelRef(model.id);
      if (!normalizedId || typeof model.supportsImage !== 'boolean') continue;
      modelSupportMap.set(normalizedId, model.supportsImage);
    }
  }
  for (const [providerId, providerConfig] of Object.entries(params.providers ?? {})) {
    const canonicalProvider = providerId.trim().toLowerCase();
    const models = Array.isArray((providerConfig as any)?.models) ? (providerConfig as any).models : [];
    for (const model of models) {
      const normalizedId = params.canonicalizeModelRef(
        `${canonicalProvider}/${String(model?.id ?? '').trim()}`
      );
      const supportsImage = resolveModelSupportsImage(model);
      if (!normalizedId || typeof supportsImage !== 'boolean') continue;
      modelSupportMap.set(normalizedId, supportsImage);
    }
  }

  const primaryModelRef = params.canonicalizeModelRef(agents.defaults.model?.primary);
  const requestedImageModelRef = params.canonicalizeModelRef(agents.defaults.imageModel?.primary);
  const nextImagePrimary =
    requestedImageModelRef && modelSupportMap.get(requestedImageModelRef) === true
      ? requestedImageModelRef
      : primaryModelRef && modelSupportMap.get(primaryModelRef) === true
        ? primaryModelRef
        : undefined;

  return {
    ...agents,
    list: ensureMainAgentInList(agents.list),
    defaults: {
      ...agents.defaults,
      models: nextModels,
      model: agents.defaults.model
        ? { ...agents.defaults.model, primary: primaryModelRef }
        : agents.defaults.model,
      imageModel: nextImagePrimary
        ? { ...(agents.defaults.imageModel ?? {}), primary: nextImagePrimary }
        : undefined,
      imageGenerationModel: agents.defaults.imageGenerationModel
        ? {
          ...agents.defaults.imageGenerationModel,
          primary: params.canonicalizeModelRef(agents.defaults.imageGenerationModel.primary),
        }
        : agents.defaults.imageGenerationModel,
      videoGenerationModel: agents.defaults.videoGenerationModel
        ? {
          ...agents.defaults.videoGenerationModel,
          primary: params.canonicalizeModelRef(agents.defaults.videoGenerationModel.primary),
        }
        : agents.defaults.videoGenerationModel,
    },
  };
}

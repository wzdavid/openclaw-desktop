const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const templatesPath = path.join(repoRoot, 'src', 'pages', 'ConfigManager', 'providerTemplates.ts');
const outputPath = path.join(repoRoot, 'src', 'generated', 'providerCatalog.generated.ts');
const mediaOutputPath = path.join(repoRoot, 'src', 'generated', 'mediaCatalog.generated.ts');
const runIfMissingOnly = process.argv.includes('--if-missing');

const bundledOpenClawRoot = (() => {
  const candidates = [
    path.join(repoRoot, 'resources', `node-${process.arch}`, 'node_modules', 'openclaw'),
    path.join(repoRoot, 'resources', 'node', 'node_modules', 'openclaw'),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json'))) || null;
})();

const providerAliases = {
  modelstudio: 'qwen',
  qwencloud: 'qwen',
  'qwen-dashscope': 'qwen',
  'z.ai': 'zai',
  'z-ai': 'zai',
  'kimi-coding': 'moonshot',
  'kimi-code': 'moonshot',
};

const normalizeProviderId = (providerId) => {
  const normalized = String(providerId || '').trim().toLowerCase();
  return providerAliases[normalized] || normalized;
};

function extractTemplates() {
  const raw = fs.readFileSync(templatesPath, 'utf8');
  const providerMap = {};
  const blockRegex = /\{\s*id:\s*'([^']+)'[\s\S]*?popularModels:\s*\[([\s\S]*?)\],/g;
  for (const match of raw.matchAll(blockRegex)) {
    const providerId = normalizeProviderId(match[1]);
    const body = match[2];
    const models = [];
    const objectRegex = /\{([^{}]*)\}/g;
    for (const modelMatch of body.matchAll(objectRegex)) {
      const segment = modelMatch[1] || '';
      const idMatch = segment.match(/id:\s*'([^']+)'/);
      const id = String(idMatch?.[1] || '').trim();
      if (!id) continue;
      const aliasMatch = segment.match(/suggestedAlias:\s*'([^']+)'/);
      const supportsMatch = segment.match(/supportsImage:\s*(true|false)/);
      models.push({
        id,
        suggestedAlias: aliasMatch ? aliasMatch[1] : undefined,
        supportsImage: supportsMatch?.[1] === 'true' ? true : supportsMatch?.[1] === 'false' ? false : undefined,
      });
    }
    providerMap[providerId] = models;
  }
  return providerMap;
}

function indexTemplateModelsById(templateRows) {
  const map = new Map();
  for (const row of templateRows || []) {
    const normalizedId = normalizeModelId(normalizeProviderId((row.id || '').split('/')[0] || ''), row.id);
    if (normalizedId) map.set(normalizedId, row);
  }
  return map;
}

function normalizeModelId(providerId, modelId) {
  const model = String(modelId || '').trim();
  if (!model) return '';
  if (model.includes('/')) {
    const slashIndex = model.indexOf('/');
    const prefix = normalizeProviderId(model.slice(0, slashIndex));
    const suffix = model.slice(slashIndex + 1);
    return prefix && suffix ? `${prefix}/${suffix}` : '';
  }
  return `${providerId}/${model}`;
}

function normalizeInput(input) {
  if (!Array.isArray(input)) return undefined;
  const normalized = input
    .map((value) => String(value).toLowerCase())
    .filter((value) => value === 'text' || value === 'image' || value === 'audio' || value === 'video');
  return normalized.length > 0 ? normalized : undefined;
}

function getSupportsImage(input) {
  const normalizedInput = normalizeInput(input);
  return normalizedInput ? normalizedInput.includes('image') : undefined;
}

function collectModelsFromProvider(providerId, rows) {
  const normalizedProviderId = normalizeProviderId(providerId);
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const fullId = normalizeModelId(normalizedProviderId, row.id);
    if (!fullId) continue;
    const supportsImage = getSupportsImage(row.input);
    map.set(fullId, {
      id: fullId,
      suggestedAlias: typeof row.suggestedAlias === 'string' ? row.suggestedAlias : undefined,
      supportsImage,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function loadApiModuleModels(providerId) {
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!bundledOpenClawRoot) return [];
  const apiPath = path.join(
    bundledOpenClawRoot,
    'dist',
    'extensions',
    normalizedProviderId,
    'api.js',
  );
  if (!fs.existsSync(apiPath)) return [];
  let mod;
  try {
    mod = await (new Function('url', 'return import(url)'))(pathToFileURL(apiPath).href);
  } catch {
    return [];
  }
  const rows = [];
  const safeBuildProviderIds = new Set([
    'anthropic',
    'openai',
    'google',
    'xai',
    'mistral',
    'openrouter',
    'groq',
    'together',
    'nvidia',
    'minimax',
    'moonshot',
    'deepseek',
    'qianfan',
    'qwen',
    'zai',
    'volcengine',
    'xiaomi',
  ]);
  for (const [key, value] of Object.entries(mod)) {
    if (Array.isArray(value) && /MODEL_CATALOG/.test(key)) {
      for (const item of value) rows.push(item);
      continue;
    }
    if (
      typeof value === 'function' &&
      /^build.*Provider$/.test(key) &&
      safeBuildProviderIds.has(normalizedProviderId)
    ) {
      try {
        const built = await Promise.resolve(value.length > 0 ? value(process.env) : value());
        if (built && Array.isArray(built.models)) {
          for (const item of built.models) rows.push(item);
        }
      } catch {
      }
    }
  }
  return collectModelsFromProvider(providerId, rows);
}

async function enrichModelsWithExtensionMetadata(providerId, models) {
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!bundledOpenClawRoot || !Array.isArray(models) || models.length === 0) return models;
  const apiPath = path.join(
    bundledOpenClawRoot,
    'dist',
    'extensions',
    normalizedProviderId,
    'api.js',
  );
  if (!fs.existsSync(apiPath)) return models;
  let mod;
  try {
    mod = await (new Function('url', 'return import(url)'))(pathToFileURL(apiPath).href);
  } catch {
    return models;
  }

  const withModelMeta = models.map((model) => ({ ...model }));
  const trySetSupportsImage = (index, input) => {
    if (typeof withModelMeta[index].supportsImage === 'boolean') return;
    const normalizedInput = normalizeInput(input);
    if (!normalizedInput) return;
    withModelMeta[index].supportsImage = normalizedInput.includes('image');
  };

  if (typeof mod.buildZaiModelDefinition === 'function' && normalizedProviderId === 'zai') {
    for (let i = 0; i < withModelMeta.length; i += 1) {
      const fullId = withModelMeta[i].id;
      const modelId = fullId.includes('/') ? fullId.split('/').slice(1).join('/') : fullId;
      try {
        const def = mod.buildZaiModelDefinition({ id: modelId });
        trySetSupportsImage(i, def?.input);
      } catch {
      }
    }
  }

  if (typeof mod.buildOpenAIProvider === 'function' && normalizedProviderId === 'openai') {
    try {
      const provider = mod.buildOpenAIProvider();
      if (typeof provider?.resolveDynamicModel === 'function') {
        const modelRegistry = { find: () => undefined };
        for (let i = 0; i < withModelMeta.length; i += 1) {
          const fullId = withModelMeta[i].id;
          const modelId = fullId.includes('/') ? fullId.split('/').slice(1).join('/') : fullId;
          try {
            const resolved = provider.resolveDynamicModel({
              provider: normalizedProviderId,
              modelId,
              modelRegistry,
            });
            trySetSupportsImage(i, resolved?.input);
          } catch {
          }
        }
      }
    } catch {
    }
  }

  return withModelMeta;
}

function mergeTemplateMetadata(providerId, models, templateRows) {
  const byId = indexTemplateModelsById(templateRows);
  return models.map((model) => {
    const tmpl = byId.get(model.id);
    return {
      ...model,
      suggestedAlias: model.suggestedAlias ?? tmpl?.suggestedAlias,
      supportsImage: typeof model.supportsImage === 'boolean' ? model.supportsImage : tmpl?.supportsImage,
    };
  });
}

async function loadMediaCatalog(kind) {
  if (!bundledOpenClawRoot) return [];
  const extensionsRoot = path.join(bundledOpenClawRoot, 'dist', 'extensions');
  if (!fs.existsSync(extensionsRoot)) return [];
  const extensionIds = fs.readdirSync(extensionsRoot).filter((name) =>
    fs.existsSync(path.join(extensionsRoot, name, 'index.js'))
  );
  const modelsMap = new Map();
  for (const extensionId of extensionIds) {
    const indexPath = path.join(extensionsRoot, extensionId, 'index.js');
    let pluginModule;
    try {
      pluginModule = await (new Function('url', 'return import(url)'))(pathToFileURL(indexPath).href);
    } catch {
      continue;
    }
    const plugin = pluginModule?.default;
    if (!plugin || typeof plugin.register !== 'function') continue;
    const imageProviders = [];
    const videoProviders = [];
    const fakeApi = new Proxy(
      { pluginConfig: {} },
      {
        get(_target, prop) {
          if (prop === 'registerImageGenerationProvider') {
            return (provider) => provider && imageProviders.push(provider);
          }
          if (prop === 'registerVideoGenerationProvider') {
            return (provider) => provider && videoProviders.push(provider);
          }
          if (prop === 'pluginConfig') return {};
          return () => undefined;
        },
      }
    );
    try {
      await plugin.register(fakeApi);
    } catch {
      continue;
    }
    const providers = kind === 'image' ? imageProviders : videoProviders;
    for (const provider of providers) {
      try {
        const providerId = normalizeProviderId(provider?.id || extensionId);
        const defaults = [];
        if (typeof provider?.defaultModel === 'string' && provider.defaultModel.trim()) defaults.push(provider.defaultModel.trim());
        if (Array.isArray(provider?.models)) {
          for (const model of provider.models) defaults.push(String(model || '').trim());
        }
        for (const modelId of defaults) {
          if (!modelId) continue;
          const fullId = modelId.includes('/') ? normalizeModelId(providerId, modelId) : `${providerId}/${modelId}`;
          if (!fullId) continue;
          if (!modelsMap.has(fullId)) modelsMap.set(fullId, { id: fullId, provider: providerId });
        }
      } catch {
      }
    }
  }
  return Array.from(modelsMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function generate() {
  if (runIfMissingOnly && fs.existsSync(outputPath) && fs.existsSync(mediaOutputPath)) {
    console.log(`[Catalog] Skip generation (already exists): ${outputPath}`);
    console.log(`[Catalog] Skip generation (already exists): ${mediaOutputPath}`);
    return;
  }

  const fromTemplates = extractTemplates();
  const providerIds = Object.keys(fromTemplates);
  const finalMap = {};
  for (const providerId of providerIds) {
    const templateRows = fromTemplates[providerId] || [];
    const apiModels = await loadApiModuleModels(providerId);
    if (apiModels.length > 0) {
      const enriched = await enrichModelsWithExtensionMetadata(providerId, apiModels);
      finalMap[providerId] = mergeTemplateMetadata(providerId, enriched, templateRows);
      continue;
    }
    const templateModels = collectModelsFromProvider(providerId, templateRows);
    const enriched = await enrichModelsWithExtensionMetadata(providerId, templateModels);
    finalMap[providerId] = mergeTemplateMetadata(providerId, enriched, templateRows);
  }

  const imageModels = await loadMediaCatalog('image');
  const videoModels = await loadMediaCatalog('video');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const content = [
    'export type GeneratedProviderCatalogModel = {',
    '  id: string;',
    '  suggestedAlias?: string;',
    '  supportsImage?: boolean;',
    '};',
    '',
    'export const GENERATED_PROVIDER_CATALOG: Record<string, GeneratedProviderCatalogModel[]> = ' +
      `${JSON.stringify(finalMap, null, 2)} as const;`,
    '',
  ].join('\n');
  fs.writeFileSync(outputPath, content, 'utf8');
  const mediaContent = [
    'export type GeneratedMediaCatalogModel = {',
    '  id: string;',
    '  provider: string;',
    '};',
    '',
    'export const GENERATED_IMAGE_GENERATION_MODELS: GeneratedMediaCatalogModel[] = ' +
      `${JSON.stringify(imageModels, null, 2)} as const;`,
    '',
    'export const GENERATED_VIDEO_GENERATION_MODELS: GeneratedMediaCatalogModel[] = ' +
      `${JSON.stringify(videoModels, null, 2)} as const;`,
    '',
  ].join('\n');
  fs.writeFileSync(mediaOutputPath, mediaContent, 'utf8');
  console.log(`Generated: ${outputPath}`);
  console.log(`Generated: ${mediaOutputPath}`);
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});

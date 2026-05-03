// ═══════════════════════════════════════════════════════════
// Edition / product feature registry (OpenClaw Desktop)
// Mirrors the rcesbot pattern: a fixed registry + feature flags
// that can be overridden at runtime via `window.aegis?.edition`.
// Future: license server or build-time white-label can inject the same shape.
// ═══════════════════════════════════════════════════════════

export type EditionFeatureKey =
  | 'dashboard'
  | 'chat'
  | 'workshop'
  | 'analytics'
  | 'cron'
  | 'agents'
  | 'skills'
  | 'terminal'
  | 'memory'
  | 'configManager'
  | 'sessions'
  | 'logs'
  | 'liveAgents'
  | 'files'
  | 'calendar'
  | 'sandbox'
  | 'tools'
  | 'settings';

export type EditionFeatures = Record<EditionFeatureKey, boolean>;

export type EditionConfig = {
  /** Product-level feature switches (nav + route availability) */
  features: EditionFeatures;
};

/** Runtime override via `window.aegis.edition` (Electron preload or embedder). */
export type EditionConfigPatch = {
  features?: Partial<EditionFeatures>;
};

/** Every module on — used when merged flags are all false (recovery), or as a merge base. */
const allEnabled = (): EditionFeatures => ({
  dashboard: true,
  chat: true,
  workshop: true,
  analytics: true,
  cron: true,
  agents: true,
  skills: true,
  terminal: true,
  memory: true,
  configManager: true,
  sessions: true,
  logs: true,
  liveAgents: true,
  files: true,
  calendar: true,
  sandbox: true,
  tools: true,
  settings: true,
});

/**
 * Default shipped build — modules that are UI-complete but not wired to OpenClaw/Gateway
 * in a way most users benefit from stay off until explicitly enabled via `window.aegis.edition`.
 * See product notes: Workshop = local-only Kanban; Memory = optional external API / local browse.
 */
function defaultProductFeatures(): EditionFeatures {
  return {
    ...allEnabled(),
    workshop: false,
    memory: false,
  };
}

const fallbackEdition: EditionConfig = {
  features: defaultProductFeatures(),
};

function mergeFeatureFlags(
  base: EditionFeatures,
  patch?: Partial<EditionFeatures> | null,
): EditionFeatures {
  if (!patch) return base;
  return { ...base, ...patch };
}

/** If every flag is false, fall back to full defaults to avoid a dead app. */
function applyFeatureInvariants(features: EditionFeatures): EditionFeatures {
  if (!Object.values(features).some(Boolean)) {
    return allEnabled();
  }
  return features;
}

const runtimePatch =
  typeof window !== 'undefined'
    ? (window as Window & { aegis?: { edition?: EditionConfigPatch } }).aegis?.edition
    : undefined;

const resolvedFeatures = applyFeatureInvariants(
  mergeFeatureFlags(fallbackEdition.features, runtimePatch?.features),
);

export const edition: EditionConfig = {
  features: resolvedFeatures,
};

export function isFeatureEnabled(feature: EditionFeatureKey): boolean {
  return Boolean(edition.features[feature]);
}

/**
 * First enabled route, in priority order (used when a feature is off or user hits a disabled URL).
 * Chat and dashboard are preferred “home” targets; settings is the last resort.
 */
const APP_ROUTE_ORDER: { feature: EditionFeatureKey; path: string }[] = [
  { feature: 'chat', path: '/chat' },
  { feature: 'dashboard', path: '/' },
  { feature: 'workshop', path: '/workshop' },
  { feature: 'analytics', path: '/costs' },
  { feature: 'cron', path: '/cron' },
  { feature: 'agents', path: '/agents' },
  { feature: 'skills', path: '/skills' },
  { feature: 'terminal', path: '/terminal' },
  { feature: 'memory', path: '/memory' },
  { feature: 'configManager', path: '/config' },
  { feature: 'sessions', path: '/sessions' },
  { feature: 'logs', path: '/logs' },
  { feature: 'liveAgents', path: '/agents/live' },
  { feature: 'files', path: '/files' },
  { feature: 'calendar', path: '/calendar' },
  { feature: 'sandbox', path: '/sandbox' },
  { feature: 'tools', path: '/tools' },
  { feature: 'settings', path: '/settings' },
];

export function getFirstEnabledAppPath(): string {
  for (const { feature, path } of APP_ROUTE_ORDER) {
    if (isFeatureEnabled(feature)) return path;
  }
  return '/settings';
}

/** Map pathname prefix to feature (longer paths first for /agents/live). */
const PATH_PREFIXES: { prefix: string; feature: EditionFeatureKey }[] = [
  { prefix: '/agents/live', feature: 'liveAgents' },
  { prefix: '/analytics', feature: 'analytics' },
  { prefix: '/costs', feature: 'analytics' },
  { prefix: '/config', feature: 'configManager' },
  { prefix: '/sessions', feature: 'sessions' },
  { prefix: '/logs', feature: 'logs' },
  { prefix: '/files', feature: 'files' },
  { prefix: '/calendar', feature: 'calendar' },
  { prefix: '/sandbox', feature: 'sandbox' },
  { prefix: '/tools', feature: 'tools' },
  { prefix: '/settings', feature: 'settings' },
  { prefix: '/chat', feature: 'chat' },
  { prefix: '/workshop', feature: 'workshop' },
  { prefix: '/cron', feature: 'cron' },
  { prefix: '/agents', feature: 'agents' },
  { prefix: '/skills', feature: 'skills' },
  { prefix: '/terminal', feature: 'terminal' },
  { prefix: '/memory', feature: 'memory' },
  { prefix: '/', feature: 'dashboard' },
];

export function getFeatureKeyForPath(pathname: string): EditionFeatureKey | null {
  const path = pathname.startsWith('#') ? pathname.slice(1) : pathname;
  const normalized = path.split('?')[0] ?? '/';
  for (const { prefix, feature } of PATH_PREFIXES) {
    if (prefix === '/') {
      if (normalized === '/' || normalized === '') return feature;
      continue;
    }
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// Config Manager — TypeScript Types
// Based on actual clawdbot.json structure
// ═══════════════════════════════════════════════════════════

export interface MetaConfig {
  lastTouchedVersion?: string;
  lastTouchedAt?: string;
}

export interface EnvConfig {
  vars?: Record<string, string>;
}

export interface WizardConfig {
  lastRunAt?: string;
  lastRunVersion?: string;
  lastRunCommand?: string;
  lastRunMode?: string;
}

// ── Auth ──

export interface AuthProfile {
  provider: string;
  mode: string;
  token?: string;
  apiKey?: string;
  [key: string]: any;
}

export interface AuthConfig {
  profiles?: Record<string, AuthProfile>;
}

// ── Models ──

export interface ModelConfig {
  primary?: string;
  fallbacks?: string[];
}

export interface ModelEntry {
  alias?: string;
  supportsImage?: boolean;
  input?: string[];
  streaming?: boolean;
  params?: Record<string, any>;
}

// ── Agents ──

export interface HeartbeatConfig {
  every?: string;
  prompt?: string;
}

export interface SubagentConfig {
  maxConcurrent?: number;
  allowAgents?: string[];
}

export interface ContextPruningSoftTrim {
  maxChars?: number;
  headChars?: number;
  tailChars?: number;
}

export interface ContextPruningConfig {
  mode?: string;
  ttl?: string;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  minPrunableToolChars?: number;
  softTrim?: ContextPruningSoftTrim;
}

export interface MemoryFlushConfig {
  enabled?: boolean;
  softThresholdTokens?: number;
  prompt?: string;
  systemPrompt?: string;
}

export interface CompactionConfig {
  mode?: string;
  reserveTokensFloor?: number;
  memoryFlush?: MemoryFlushConfig;
}

export interface AgentDefaults {
  models?: Record<string, ModelEntry>;
  workspace?: string;
  contextPruning?: ContextPruningConfig;
  compaction?: CompactionConfig;
  heartbeat?: HeartbeatConfig;
  maxConcurrent?: number;
  subagents?: SubagentConfig;
  model?: ModelConfig;
  imageModel?: ModelConfig;
  imageGenerationModel?: ModelConfig;
  videoGenerationModel?: ModelConfig;
  thinkingDefault?: string;
}

export interface AgentConfig {
  id: string;
  name?: string;
  model?: ModelConfig;
  imageModel?: ModelConfig;
  imageGenerationModel?: ModelConfig;
  videoGenerationModel?: ModelConfig;
  workspace?: string;
  heartbeat?: HeartbeatConfig;
  subagents?: SubagentConfig;
  [key: string]: any;
}

export interface AgentsSection {
  defaults?: AgentDefaults;
  list?: AgentConfig[];
}

// ── Channels ──

export interface ChannelConfig {
  enabled?: boolean;
  dmPolicy?: string;
  botToken?: string;
  groupPolicy?: string;
  streaming?: string | boolean | Record<string, any>;
  [key: string]: any;
}

// ── Gateway ──

export interface GatewayRateLimit {
  maxAttempts?: number;
  windowMs?: number;
  lockoutMs?: number;
  exemptLoopback?: boolean;
}

export interface GatewayAuth {
  mode: string;
  token?: string;
  password?: string;
  allowTailscale?: boolean;
  rateLimit?: GatewayRateLimit;
}

export interface GatewayControlUi {
  enabled?: boolean;
  basePath?: string;
  allowedOrigins?: string[];
  allowInsecureAuth?: boolean;
  dangerouslyDisableDeviceAuth?: boolean;
}

export interface GatewayTailscale {
  mode?: string;
  resetOnExit?: boolean;
}

export interface GatewayHttpEndpoints {
  chatCompletions?: { enabled?: boolean };
  responses?: { enabled?: boolean };
}

export interface GatewayRemoteConfig {
  url?: string;
  transport?: string;
  token?: string;
  password?: string;
}

export interface GatewayConfig {
  port?: number;
  bind?: string;
  bindCustom?: string;
  mode?: string;
  auth?: GatewayAuth;
  controlUi?: GatewayControlUi;
  tailscale?: GatewayTailscale;
  http?: {
    endpoints?: GatewayHttpEndpoints;
    securityHeaders?: Record<string, any>;
  };
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  remote?: GatewayRemoteConfig;
}

// ── Tools ──

export interface AudioModelEntry {
  provider: string;
  model: string;
  capabilities?: string[];
}

export interface ToolsConfig {
  profile?: string;
  allow?: string[];
  deny?: string[];
  exec?: {
    ask?: string;
    backgroundMs?: number;
    timeoutSec?: number;
  };
  elevated?: {
    enabled?: boolean;
    allowFrom?: Record<string, string[]>;
  };
  web?: {
    search?: {
      enabled?: boolean;
      provider?: string;
      apiKey?: string;
      maxResults?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
      openaiCodex?: {
        enabled?: boolean;
        mode?: string;
        allowedDomains?: string[];
        contextSize?: string;
        userLocation?: {
          country?: string;
          city?: string;
          timezone?: string;
        };
      };
    };
    fetch?: {
      enabled?: boolean;
      provider?: string;
      maxChars?: number;
    };
  };
  loopDetection?: {
    enabled?: boolean;
    historySize?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    globalCircuitBreakerThreshold?: number;
  };
  media?: {
    audio?: {
      enabled?: boolean;
      models?: AudioModelEntry[];
    };
  };
  agentToAgent?: {
    enabled?: boolean;
    allow?: string[];
  };
  sessions?: {
    visibility?: string;
  };
}

// ── Messages / TTS ──

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
}

export interface ElevenLabsConfig {
  voiceId?: string;
  modelId?: string;
  languageCode?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
}

export interface TtsConfig {
  auto?: string;
  provider?: string;
  modelOverrides?: { enabled?: boolean };
  elevenlabs?: ElevenLabsConfig;
  edge?: { enabled?: boolean };
}

export interface MessagesConfig {
  ackReactionScope?: string;
  tts?: TtsConfig;
}

// ── Models Providers ──

export interface ModelProviderModelEntry {
  id: string;
  name?: string;
  supportsImage?: boolean;
  input?: string[];
  // Optional pricing metadata (USD per 1M tokens).
  // Kept in config so future UI can support manual pricing overrides.
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    tieredPricing?: Array<{
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      range?: [number, number];
    }>;
  };
}

export interface ModelProviderConfig {
  baseUrl?: string;
  api?: string;
  models?: ModelProviderModelEntry[];
}

export interface ModelsSection {
  providers?: Record<string, ModelProviderConfig>;
}

// ── Root Config ──

export interface OpenClawConfig {
  meta?: MetaConfig;
  env?: EnvConfig;
  wizard?: WizardConfig;
  auth?: AuthConfig;
  agents?: AgentsSection;
  tools?: ToolsConfig;
  messages?: MessagesConfig;
  commands?: {
    native?: string | boolean;
    nativeSkills?: string | boolean;
    restart?: boolean;
  };
  channels?: Record<string, ChannelConfig>;
  talk?: { apiKey?: string };
  gateway?: GatewayConfig;
  skills?: {
    load?: { extraDirs?: string[] };
  };
  plugins?: {
    entries?: Record<string, {
      enabled?: boolean;
      config?: {
        webSearch?: {
          apiKey?: string;
          baseUrl?: string;
          model?: string;
        };
        webFetch?: {
          apiKey?: string;
          baseUrl?: string;
          timeoutSeconds?: number;
          maxAgeMs?: number;
          onlyMainContent?: boolean;
        };
        xSearch?: {
          apiKey?: string;
        };
      };
    }>;
  };
  models?: ModelsSection;
}

export type GatewayRuntimeConfig = OpenClawConfig;

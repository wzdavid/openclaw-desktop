// ═══════════════════════════════════════════════════════════
// Config Manager — Channel Templates
// Phase 3: Template definitions for supported channels
// ═══════════════════════════════════════════════════════════

export interface ChannelTemplate {
  id: string;               // "telegram", "discord", "whatsapp", etc.
  nameKey: string;          // i18n key: "config.channel.telegram"
  icon: string;             // emoji: "📱", "🎮", etc.
  colorClass: string;       // Tailwind gradient — aegis data colors
  tokenField: string;       // primary token field name — "" if none (bridge)
  tokenEnvKey: string;      // env variable name — "" if none
  supportsStreaming: boolean;
  streamingModes?: string[];   // ["off", "partial", "block", "progress"]
  defaultStreaming?: string;
  supportsDmPolicy: boolean;
  dmPolicyOptions?: string[];  // ["pairing", "allowlist", "open", "disabled"]
  defaultDmPolicy?: string;
  supportsGroupPolicy: boolean;
  groupPolicyOptions?: string[];
  defaultGroupPolicy?: string;
  supportsMultiAccount: boolean;
  defaultMediaMaxMb?: number;
  extraFields?: {
    key: string;
    type: 'string' | 'boolean' | 'number';
    labelKey: string;
    defaultValue?: any;
  }[];
  docsUrl?: string;
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  // ── 1. Feishu (Lark) ──
  {
    id: 'feishu',
    nameKey: 'config.channel.feishu',
    icon: '🪁',
    colorClass: 'from-blue-500 to-teal-500',
    // appId + appSecret are dual credentials handled as channel-specific fields
    tokenField: '',
    tokenEnvKey: '',
    supportsStreaming: true,
    streamingModes: ['off', 'partial', 'block', 'progress'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: true,
    groupPolicyOptions: ['open', 'allowlist', 'disabled'],
    defaultGroupPolicy: 'open',
    supportsMultiAccount: true,
    defaultMediaMaxMb: 30,
    extraFields: [
      {
        key: 'domain',
        type: 'string',
        labelKey: 'config.feishuDomain',
        defaultValue: '',
      },
      {
        key: 'typingIndicator',
        type: 'boolean',
        labelKey: 'config.typingIndicator',
        defaultValue: true,
      },
      {
        key: 'resolveSenderNames',
        type: 'boolean',
        labelKey: 'config.resolveSenderNames',
        defaultValue: true,
      },
    ],
    docsUrl: 'https://docs.openclaw.ai/channels/feishu',
  },

  // ── 2. Telegram ──
  {
    id: 'telegram',
    nameKey: 'config.channel.telegram',
    icon: '✈️',
    colorClass: 'from-sky-500 to-blue-600',
    tokenField: 'botToken',
    tokenEnvKey: 'TELEGRAM_BOT_TOKEN',
    supportsStreaming: true,
    streamingModes: ['partial', 'off', 'block', 'progress'],
    defaultStreaming: 'partial',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: true,
    groupPolicyOptions: ['allowlist', 'open'],
    defaultGroupPolicy: 'allowlist',
    supportsMultiAccount: true,
    defaultMediaMaxMb: 5,
    docsUrl: 'https://core.telegram.org/bots/api',
  },

  // ── 3. Discord ──
  {
    id: 'discord',
    nameKey: 'config.channel.discord',
    icon: '🎮',
    colorClass: 'from-indigo-500 to-violet-600',
    tokenField: 'token',
    tokenEnvKey: 'DISCORD_BOT_TOKEN',
    supportsStreaming: true,
    streamingModes: ['off', 'partial', 'block', 'progress'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: true,
    defaultMediaMaxMb: 8,
    extraFields: [
      {
        key: 'threadBindings',
        type: 'boolean',
        labelKey: 'config.threadBindings',
        defaultValue: false,
      },
    ],
    docsUrl: 'https://discord.com/developers/docs/intro',
  },

  // ── 4. WhatsApp ──
  {
    id: 'whatsapp',
    nameKey: 'config.channel.whatsapp',
    icon: '📱',
    colorClass: 'from-emerald-500 to-green-600',
    tokenField: '',
    tokenEnvKey: '',
    supportsStreaming: false,
    streamingModes: ['off'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: true,
    defaultMediaMaxMb: 50,
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
  },

  // ── 5. Slack ──
  {
    id: 'slack',
    nameKey: 'config.channel.slack',
    icon: '🔧',
    colorClass: 'from-purple-500 to-pink-500',
    tokenField: 'botToken',
    tokenEnvKey: 'SLACK_BOT_TOKEN',
    supportsStreaming: true,
    streamingModes: ['partial', 'off', 'block', 'progress'],
    defaultStreaming: 'partial',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: true,
    defaultMediaMaxMb: 20,
    extraFields: [
      {
        key: 'appToken',
        type: 'string',
        labelKey: 'config.appToken',
        defaultValue: '',
      },
      {
        key: 'signingSecret',
        type: 'string',
        labelKey: 'config.signingSecret',
        defaultValue: '',
      },
      {
        key: 'nativeStreaming',
        type: 'boolean',
        labelKey: 'config.nativeStreaming',
        defaultValue: false,
      },
    ],
    docsUrl: 'https://api.slack.com/',
  },

  // ── 6. Google Chat ──
  {
    id: 'googlechat',
    nameKey: 'config.channel.googlechat',
    icon: '💬',
    colorClass: 'from-blue-500 to-cyan-500',
    tokenField: 'serviceAccountKeyFile',
    tokenEnvKey: '',
    supportsStreaming: false,
    streamingModes: ['off'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: true,
    groupPolicyOptions: ['allowlist', 'open'],
    defaultGroupPolicy: 'allowlist',
    supportsMultiAccount: true,
    defaultMediaMaxMb: 20,
    docsUrl: 'https://developers.google.com/chat',
  },

  // ── 7. Mattermost ──
  {
    id: 'mattermost',
    nameKey: 'config.channel.mattermost',
    icon: '🧩',
    colorClass: 'from-blue-600 to-blue-800',
    tokenField: 'token',
    tokenEnvKey: '',
    supportsStreaming: false,
    streamingModes: ['off'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: false,
    docsUrl: 'https://developers.mattermost.com/',
  },

  // ── 8. Signal ──
  {
    id: 'signal',
    nameKey: 'config.channel.signal',
    icon: '🔒',
    colorClass: 'from-slate-500 to-slate-700',
    tokenField: '',
    tokenEnvKey: '',
    supportsStreaming: false,
    streamingModes: ['off'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist', 'open', 'disabled'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: false,
    defaultMediaMaxMb: 50,
    docsUrl: 'https://signal.org/',
  },

  // ── 9. iMessage ──
  {
    id: 'imessage',
    nameKey: 'config.channel.imessage',
    icon: '🍎',
    colorClass: 'from-gray-500 to-gray-700',
    tokenField: '',
    tokenEnvKey: '',
    supportsStreaming: false,
    streamingModes: ['off'],
    defaultStreaming: 'off',
    supportsDmPolicy: true,
    dmPolicyOptions: ['pairing', 'allowlist'],
    defaultDmPolicy: 'pairing',
    supportsGroupPolicy: false,
    supportsMultiAccount: false,
    docsUrl: 'https://support.apple.com/imessage',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getChannelTemplate(id: string): ChannelTemplate | undefined {
  return CHANNEL_TEMPLATES.find((t) => t.id === id);
}

export function getChannelColor(id: string): string {
  const tmpl = getChannelTemplate(id);
  return tmpl?.colorClass ?? 'from-slate-500 to-gray-600';
}

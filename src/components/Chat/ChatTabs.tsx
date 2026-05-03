import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X, Zap, FilePlus, Bot, ChevronDown, Check, Trash2, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { isWeakSessionTopic, useChatStore, Session } from '@/stores/chatStore';
import { useGatewayDataStore, type AgentInfo } from '@/stores/gatewayDataStore';
import { gateway } from '@/services/gateway';
import { themeHex, dataColor } from '@/utils/theme-colors';
import { getSessionDisplayLabel } from '@/utils/sessionLabel';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// ChatTabs — Browser-style tab bar
// Layout: [Main ●] [Session A ×] [Session B ×]   [↺] [+]
// ═══════════════════════════════════════════════════════════

const MAIN_SESSION = 'agent:main:main';

// ── Helpers ──────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatSessionTimestamp(timestamp?: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  const sameDay = sameYear
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], sameYear
    ? { month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function formatSessionPreview(text?: unknown, max = 48): string {
  if (text == null) return '';

  let source = '';
  if (typeof text === 'string') {
    source = text;
  } else if (Array.isArray(text)) {
    source = text
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join(' ');
  } else if (typeof text === 'object') {
    const candidate = (text as { text?: unknown; content?: unknown }).text
      ?? (text as { text?: unknown; content?: unknown }).content;
    source = typeof candidate === 'string' ? candidate : '';
  } else {
    source = String(text);
  }

  if (!source) return '';

  const normalized = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';

  // Remove common non-semantic boilerplate so tab labels read like topic titles.
  const cleaned = normalized
    .replace(/^\[file attached:\s*[^\]]+\]\s*/gi, '')
    .replace(/^file attached:\s*/gi, '')
    .replace(/^attachment:\s*/gi, '')
    .replace(/^system:\s*/gi, '')
    .replace(/^assistant:\s*/gi, '')
    .replace(/^user:\s*/gi, '')
    .trim();
  if (!cleaned) return '';

  const preview = cleaned.length > max
    ? `${cleaned.slice(0, max - 1).trim()}…`
    : cleaned;
  return preview;
}

function getSessionPreview(
  displayLabel: string,
  session: Session,
  cachedMessages?: Array<{ role: string; content: unknown }>,
): string {
  const normalizedLabel = displayLabel.trim();

  const cachedPreview = [...(cachedMessages ?? [])]
    .reverse()
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .map((message) => formatSessionPreview(message.content))
    .find((preview) => preview && preview !== normalizedLabel);

  if (cachedPreview) return cachedPreview;

  const lastMessagePreview = formatSessionPreview(session.lastMessage);
  if (lastMessagePreview && lastMessagePreview !== normalizedLabel) {
    return lastMessagePreview;
  }

  return '';
}

/** Parse sessionKey: agentId, is main session (agent:X:main), is desktop session (agent:X:desktop-*) */
function parseSessionKey(key: string): { agentId: string; isMainSession: boolean; isDesktopSession: boolean } {
  if (!key.startsWith('agent:')) {
    return { agentId: 'main', isMainSession: false, isDesktopSession: false };
  }
  const parts = key.split(':');
  const agentId = parts[1] ?? 'main';
  const rest = parts.slice(2).join(':');
  const isMainSession = rest === 'main';
  const isDesktopSession = rest.startsWith('desktop-');
  return { agentId, isMainSession, isDesktopSession };
}

function compactTabLabel(label: string, max = 24): string {
  return label.length > max ? `${label.slice(0, max - 1).trim()}…` : label;
}

/** Readable label for a session tab — prioritize topic over generic session ids or timestamps */
function sessionLabel(
  session: Session | undefined,
  key: string,
  agents: AgentInfo[],
  mainAgentName: string = 'Main Agent',
  cachedMessages?: Array<{ role: string; content: unknown }>,
): string {
  const { agentId } = parseSessionKey(key);
  const agent = agents.find((a) => a.id === agentId);
  const agentDisplayName = agent?.name ?? (agentId === 'main' ? mainAgentName : agentId);
  const cachedPreview = [...(cachedMessages ?? [])]
    .reverse()
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .map((message) => formatSessionPreview(message.content, 42))
    .find((preview) => preview && !isWeakSessionTopic(preview));
  const merged = {
    ...(session ?? { key }),
    ...(cachedPreview ? { lastMessage: session?.lastMessage || cachedPreview } : {}),
  };
  const label = getSessionDisplayLabel(merged, {
    mainSessionLabel: agentDisplayName,
    genericSessionLabel: 'Session',
  });
  return compactTabLabel(label, 28);
}

// ═══════════════════════════════════════════════════════════
// Agent Status Tooltip — hover card on main agent tab
// ═══════════════════════════════════════════════════════════

function AgentStatusTooltip({ visible, tokenUsage, connected, mainAgentName, thinkingLevel }: {
  visible: boolean;
  tokenUsage: any;
  connected: boolean;
  mainAgentName: string;
  thinkingLevel: string | null;
}) {
  const { t } = useTranslation();

  // Reuse the same i18n keys as TitleBar's ThinkingPicker
  const thinkingId = thinkingLevel ?? 'auto';
  const thinkingFallback = thinkingId.charAt(0).toUpperCase() + thinkingId.slice(1);
  const thinkingLabel = t(`titlebar.thinking.levels.${thinkingId}`, thinkingFallback);

  const gatewaySessions = useGatewayDataStore((s) => s.sessions);
  const mainSession = gatewaySessions.find((s) =>
    (s.key || '').includes('agent:main:main')
  );

  const contextTokens = tokenUsage?.contextTokens || 0;
  const maxTokens = tokenUsage?.maxTokens || 200000;
  const usagePct = maxTokens > 0 ? Math.round((contextTokens / maxTokens) * 100) : 0;
  const compactions = tokenUsage?.compactions || 0;

  const model = mainSession?.model || '';
  const modelShort = model ? model.split('/').pop()! : '—';

  const sessionStart = mainSession?.createdAt || mainSession?.updatedAt;
  const sessionAge = sessionStart ? formatDuration(Date.now() - new Date(sessionStart).getTime()) : '—';

  const compactAt = Math.round(maxTokens * 0.8);
  const compactPct = maxTokens > 0 ? Math.round((contextTokens / compactAt) * 100) : 0;

  const usageColor = usagePct > 70 ? themeHex('danger') : usagePct > 40 ? themeHex('warning') : themeHex('primary');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute start-0 top-0 mt-2 w-[300px] rounded-2xl border border-[rgb(var(--aegis-overlay)/0.1)] z-[9999] overflow-hidden"
          style={{ background: 'var(--aegis-bg-frosted)', backdropFilter: 'blur(40px)', boxShadow: '0 16px 48px rgb(var(--aegis-overlay) / 0.2)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aegis-primary/20 to-aegis-primary/5 border border-aegis-primary/25 flex items-center justify-center text-lg font-bold text-aegis-primary">
              {mainAgentName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-aegis-primary">{mainAgentName}</div>
              <div className="text-[9px] text-aegis-text-dim font-mono">{modelShort}</div>
            </div>
            <div className={clsx(
              'px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border',
              connected
                ? 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
                : 'bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-muted border-[rgb(var(--aegis-overlay)/0.08)]'
            )}>
              {connected ? t('chat.statusActive', 'Active') : t('chat.statusOffline', 'Offline')}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 p-3">
            <div className="bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.04)] rounded-xl p-2.5 text-center">
              <div className="text-base font-extrabold" style={{ color: 'rgb(var(--aegis-accent))' }}>{compactions}</div>
              <div className="text-[8px] text-aegis-text-dim uppercase tracking-wider mt-0.5">{t('chat.compactions', 'Compactions')}</div>
            </div>
            <div className="bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.04)] rounded-xl p-2.5 text-center">
              <div className="text-base font-extrabold" style={{ color: dataColor(3) }}>{sessionAge}</div>
              <div className="text-[8px] text-aegis-text-dim uppercase tracking-wider mt-0.5">{t('chat.sessionAge', 'Session Age')}</div>
            </div>
          </div>

          {/* Context Usage Bar */}
          <div className="px-4 pb-2">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] text-aegis-text-muted flex items-center gap-1">
                <Zap size={10} /> {t('chat.contextUsage', 'Context Usage')}
              </span>
              <span className="text-[10px] font-semibold font-mono" style={{ color: usageColor }}>
                {formatTokens(contextTokens)} / {formatTokens(maxTokens)}
              </span>
            </div>
            <div className="w-full h-[5px] rounded-full bg-[rgb(var(--aegis-overlay)/0.04)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usagePct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${themeHex('primary')}, ${usageColor})` }}
              />
            </div>
          </div>

          {/* Info Rows */}
          <div className="px-4 pb-3 space-y-0">
            <div className="flex items-center gap-2 py-1.5 border-t border-[rgb(var(--aegis-overlay)/0.03)]">
              <span className="text-xs">🗜️</span>
              <span className="text-[10px] text-aegis-text-muted flex-1">{t('chat.compactsAt', 'Compaction at')}</span>
              <span className={clsx('text-[10px] font-bold font-mono', compactPct > 80 ? 'text-aegis-danger' : compactPct > 50 ? 'text-aegis-warning' : 'text-aegis-primary')}>
                ~{formatTokens(compactAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 py-1.5 border-t border-[rgb(var(--aegis-overlay)/0.03)]">
              <span className="text-xs">💓</span>
              <span className="text-[10px] text-aegis-text-muted flex-1">{t('chat.heartbeat', 'Heartbeat')}</span>
              <span className="text-[10px] font-bold font-mono text-aegis-primary">{t('chat.heartbeatInterval', '15m interval')}</span>
            </div>
            <div className="flex items-center gap-2 py-1.5 border-t border-[rgb(var(--aegis-overlay)/0.03)]">
              <span className="text-xs">🧠</span>
              <span className="text-[10px] text-aegis-text-muted flex-1">{t('chat.thinking', 'Thinking')}</span>
              <span className="text-[10px] font-bold font-mono" style={{ color: dataColor(3) }}>{thinkingLabel}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// New Session Picker — dropdown from + button
// Supports: choose agent → open main session OR new desktop session; open existing session
// ═══════════════════════════════════════════════════════════

function NewSessionPicker({
  open,
  onClose,
  onOpenExisting,
  onOpenMainSession,
  onCreateDesktopSession,
  openTabs,
  loadingNew,
  newSessions,
  messagesPerSession,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  onOpenExisting: (key: string) => void;
  onOpenMainSession: (agentId: string) => void;
  onCreateDesktopSession: (agentId: string) => void;
  openTabs: string[];
  loadingNew: boolean;
  newSessions: Session[];
  messagesPerSession: Record<string, Array<{ role: string; content: string }>>;
  agents: AgentInfo[];
}) {
  const { t } = useTranslation();

  const hasMain = agents.some((a) => a.id === 'main');
  const mainDisplayName = agents.find((a) => a.id === 'main')?.name ?? t('agents.mainAgent', 'Main Agent');
  const agentList: AgentInfo[] =
    agents.length === 0
      ? [{ id: 'main', name: t('agents.mainAgent', 'Main Agent') }]
      : hasMain
        ? agents
        : [{ id: 'main', name: mainDisplayName }, ...agents];
  const [selectedAgentId, setSelectedAgentId] = useState(agentList[0]?.id ?? 'main');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agentList.find((a) => a.id === selectedAgentId) ?? agentList[0];

  useEffect(() => {
    if (!agentDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agentDropdownOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute top-full end-0 mt-1.5 w-72 max-w-[min(24rem,calc(100vw-1rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl overflow-hidden z-[100] bg-aegis-menu-bg border border-aegis-menu-border"
          style={{ boxShadow: 'var(--aegis-menu-shadow)' }}
        >
          <div className="p-2 min-w-0">
            {/* Agent picker — custom dropdown matching TitleBar style */}
            <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider px-2 py-1 mb-1">
              {t('chat.newConversationWith', 'New conversation with')}
            </div>
            <div ref={agentDropdownRef} className="relative mb-2">
              <button
                onClick={() => setAgentDropdownOpen((v) => !v)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150',
                  'text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
                  'border border-[rgb(var(--aegis-overlay)/0.08)]',
                  agentDropdownOpen && 'bg-[rgb(var(--aegis-overlay)/0.06)] border-aegis-primary/20',
                )}
              >
                <Bot size={13} className="text-aegis-text-dim shrink-0" />
                <span className="flex-1 text-start truncate">{selectedAgent?.name || selectedAgent?.id}</span>
                <ChevronDown size={11} className={clsx('text-aegis-text-dim shrink-0 transition-transform duration-150', agentDropdownOpen && 'rotate-180')} />
              </button>

              {agentDropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden bg-aegis-menu-bg border border-aegis-menu-border py-1"
                  style={{ boxShadow: 'var(--aegis-menu-shadow)' }}
                >
                  {agentList.map((a) => {
                    const isActive = a.id === selectedAgentId;
                    return (
                      <button
                        key={a.id}
                        onClick={() => { setSelectedAgentId(a.id); setAgentDropdownOpen(false); }}
                        className={clsx(
                          'w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-start transition-colors',
                          isActive
                            ? 'text-aegis-primary bg-[rgb(var(--aegis-primary)/0.08)]'
                            : 'text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
                        )}
                      >
                        <span className="truncate">{a.name || a.id}</span>
                        {isActive && <Check size={11} className="text-aegis-primary shrink-0 ms-2" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-1 mb-2">
              <button
                onClick={() => { onOpenMainSession(selectedAgentId); onClose(); }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-start transition-colors',
                  'hover:bg-[rgb(var(--aegis-overlay)/0.06)] border border-transparent hover:border-[rgb(var(--aegis-overlay)/0.08)]',
                )}
              >
                <Shield size={13} className="text-aegis-primary shrink-0" />
                <span className="text-[12px] text-aegis-text-secondary font-medium">
                  {t('chat.openMainSession', 'Open main session')}
                </span>
              </button>
              <button
                onClick={() => { onCreateDesktopSession(selectedAgentId); onClose(); }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-start transition-colors',
                  'hover:bg-[rgb(var(--aegis-overlay)/0.06)] border border-transparent hover:border-[rgb(var(--aegis-overlay)/0.08)]',
                )}
              >
                <FilePlus size={13} className="text-aegis-primary shrink-0" />
                <span className="text-[12px] text-aegis-text-secondary font-medium">
                  {t('chat.newDesktopSession', 'New desktop conversation')}
                </span>
              </button>
            </div>

            {/* Existing sessions not yet open */}
            {(loadingNew || newSessions.length > 0) && (
              <div className="mx-1 my-1 border-t border-[rgb(var(--aegis-overlay)/0.06)]" />
            )}
            {newSessions.length > 0 && (
              <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider px-2 py-1 mb-0.5">
                {t('chat.availableSessions', 'Available Sessions')}
              </div>
            )}
            {loadingNew ? (
              <div className="text-center py-2 text-[11px] text-aegis-text-dim">
                {t('common.loading', 'Loading...')}
              </div>
            ) : (
              newSessions.map((session) => {
                const displayLabel = sessionLabel(
                  session,
                  session.key,
                  agents,
                  mainDisplayName,
                  messagesPerSession[session.key],
                );
                const fullLabel = session.topic
                  || (session.lastMessage && !isWeakSessionTopic(session.lastMessage) ? session.lastMessage : '')
                  || session.label
                  || session.key;
                const detailText = getSessionPreview(displayLabel, session, messagesPerSession[session.key]);
                const timeLabel = formatSessionTimestamp(session.lastTimestamp);
                return (
                  <button
                    key={session.key}
                    title={fullLabel}
                    onClick={() => { onOpenExisting(session.key); onClose(); }}
                    className="w-full min-w-0 overflow-hidden flex flex-col gap-1 px-3 py-2 rounded-lg text-start hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  >
                    <span className="block w-full min-w-0 truncate text-[12px] text-aegis-text font-medium">
                      {displayLabel}
                    </span>
                    {(detailText || timeLabel) && (
                      <span className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden text-[10px] text-aegis-text-dim">
                        {detailText && (
                          <span className="block flex-1 basis-0 min-w-0 truncate overflow-hidden">
                            {detailText}
                          </span>
                        )}
                        {timeLabel && (
                          <span className="shrink-0 text-[9px] text-aegis-text-dim/80 tabular-nums">
                            {timeLabel}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// ChatTabs — Main export
// ═══════════════════════════════════════════════════════════

export function ChatTabs() {
  const { t } = useTranslation();
  const {
    openTabs,
    activeSessionKey,
    sessions,
    messagesPerSession,
    openTab,
    closeTab,
    removeSession,
    setActiveSession,
    connected,
    connecting,
    tokenUsage,
    currentThinking,
    currentModel,
    manualModelOverride,
    typingBySession,
    thinkingBySession,
  } = useChatStore();

  // ── New session picker (+ button) ──
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [newSessions, setNewSessions] = useState<Session[]>([]);
  const [loadingNew, setLoadingNew] = useState(false);
  const newPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNewPicker) return;
    const handler = (e: MouseEvent) => {
      if (newPickerRef.current && !newPickerRef.current.contains(e.target as Node)) {
        setShowNewPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNewPicker]);

  const handleOpenNewPicker = useCallback(() => {
    setShowNewPicker((v) => !v);
    if (!showNewPicker) {
      setLoadingNew(true);
      gateway.getSessions()
        .then((result: any) => {
          const existingByKey = new Map(sessions.map((session) => [session.key, session]));
          const list: Session[] = (result?.sessions || []).map((s: any) => {
            const key = s.key || s.sessionKey;
            const previous = existingByKey.get(key);
            const lastMessage = s.lastMessage?.content?.substring?.(0, 80) || previous?.lastMessage;
            return {
              key,
              label: s.label || s.name || previous?.label || key || '',
              topic: previous?.topic,
              lastMessage,
              lastTimestamp: s.lastMessage?.timestamp || s.updatedAt || previous?.lastTimestamp,
              kind: s.kind || previous?.kind,
            };
          });
          setNewSessions(list.filter((s) => !openTabs.includes(s.key)));
        })
        .catch(() => {})
        .finally(() => setLoadingNew(false));
    }
  }, [showNewPicker, openTabs, sessions]);

  useEffect(() => {
    const handler = () => handleOpenNewPicker();
    window.addEventListener('aegis:open-new-session-picker', handler);
    return () => window.removeEventListener('aegis:open-new-session-picker', handler);
  }, [handleOpenNewPicker]);

  const handleOpenMainSession = useCallback((agentId: string) => {
    openTab(`agent:${agentId}:main`);
    setShowNewPicker(false);
  }, [openTab]);

  const handleCreateDesktopSession = useCallback((agentId: string) => {
    const desktopKey = `agent:${agentId}:desktop-${Date.now()}`;
    const sourceMainKey = `agent:${agentId}:main`;
    const sourceMainSession = sessions.find((session) => session.key === sourceMainKey);
    const inheritedModel =
      sourceMainSession?.model
      ?? (sourceMainKey === activeSessionKey ? (manualModelOverride ?? currentModel) : null);

    openTab(desktopKey);
    setShowNewPicker(false);

    if (!inheritedModel) return;

    useChatStore.getState().setManualModelOverride(inheritedModel);
    void gateway.setSessionModel(inheritedModel, desktopKey)
      .then(() => window.dispatchEvent(new Event('aegis:refresh')))
      .catch((err) => {
        console.warn('[ChatTabs] Failed to inherit desktop session model:', err);
      });
  }, [openTab, sessions, activeSessionKey, manualModelOverride, currentModel]);

  const agents = useGatewayDataStore((s) => s.agents);
  const mainAgentName = agents.find((a) => a.id === 'main')?.name || t('agents.mainAgent', 'Main Agent');

  // ── Tooltip (hover on main tab). Rendered in portal so it is not clipped by tab bar overflow-x-auto. ──
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>();
  const mainTabRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const updateTooltipPosition = useCallback(() => {
    if (!mainTabRef.current) return;
    const rect = mainTabRef.current.getBoundingClientRect();
    setTooltipPosition({ left: rect.left, top: rect.bottom + 8 });
  }, []);

  useEffect(() => {
    if (!showTooltip) {
      setTooltipPosition(null);
      return;
    }
    updateTooltipPosition();
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener('scroll', updateTooltipPosition);
      return () => el.removeEventListener('scroll', updateTooltipPosition);
    }
  }, [showTooltip, updateTooltipPosition]);

  const handleMainTabEnter = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => setShowTooltip(true), 400);
  }, []);
  const handleMainTabLeave = useCallback(() => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setShowTooltip(false);
  }, []);

  // ── Status ──
  const statusDotClass = connected
    ? 'bg-aegis-primary'
    : connecting
      ? 'bg-aegis-warning animate-pulse'
      : 'bg-aegis-danger';

  const statusLabel = connected
    ? t('connection.connected', 'Connected')
    : connecting
      ? t('connection.connecting', 'Connecting...')
      : t('connection.disconnected', 'Disconnected');

  // ── Tab close (middle-click support) ──
  const handleTabClose = useCallback((e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    closeTab(key);
  }, [closeTab]);

  const handleTabAuxClick = useCallback((e: React.MouseEvent, key: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(key);
    }
  }, [closeTab]);

  // ── Right-click context menu ──
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    setCtxMenu({ key, x: e.clientX, y: e.clientY });
  }, []);

  const handleDeleteSession = useCallback(async () => {
    if (!ctxMenu) return;
    const key = ctxMenu.key;
    setCtxMenu(null);
    if (!window.confirm(t('chat.deleteSessionConfirm', 'Delete this session and its history? This cannot be undone.'))) return;
    try {
      await gateway.deleteSession(key);
    } catch { /* gateway may 404 if session was already ephemeral */ }
    removeSession(key);
  }, [ctxMenu, t, removeSession]);

  const { clearSessionMessages, clearSessionTokens } = useChatStore();
  const handleResetSession = useCallback(async () => {
    if (!ctxMenu) return;
    const key = ctxMenu.key;
    setCtxMenu(null);
    if (!window.confirm(t('chat.resetSessionConfirm', 'Clear conversation history for this session? The session will be kept.'))) return;
    try {
      await gateway.resetSession(key);
    } catch { /* ignore */ }
    clearSessionMessages(key);
    clearSessionTokens(key);
    // Trigger App-level session refresh so the polled data also resets
    window.dispatchEvent(new CustomEvent('aegis:session-reset'));
  }, [ctxMenu, t, clearSessionMessages, clearSessionTokens]);

  const startRename = useCallback((key: string, currentLabel: string) => {
    setEditingKey(key);
    setEditingLabel(currentLabel);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingKey(null);
    setEditingLabel('');
  }, []);

  const submitRename = useCallback(async (key: string, fallbackLabel: string) => {
    if (renaming) return;
    const next = editingLabel.trim();
    if (!next || next === fallbackLabel) {
      cancelRename();
      return;
    }
    setRenaming(true);
    try {
      await gateway.setSessionLabel(next, key);
      window.dispatchEvent(new Event('aegis:refresh'));
    } catch (err) {
      console.warn('[ChatTabs] Failed to rename session:', err);
    } finally {
      setRenaming(false);
      cancelRename();
    }
  }, [editingLabel, renaming, cancelRename]);

  return (
    <div
      className="shrink-0 flex items-center h-[38px] bg-[var(--aegis-bg-frosted-60)] backdrop-blur-xl border-b border-[rgb(var(--aegis-overlay)/0.06)] relative z-20"
      role="tablist"
      aria-label={t('chat.sessions', 'Chat sessions')}
    >
      {/* ── Scrollable tab strip ── */}
      <div ref={scrollContainerRef} className="flex-1 flex items-end h-full overflow-x-auto scrollbar-none min-w-0 pl-1">
        {openTabs.map((key) => {
          const isActive = key === activeSessionKey;
          const isMain = key === MAIN_SESSION;
          const { isMainSession, isDesktopSession } = parseSessionKey(key);
          const session = sessions.find((s) => s.key === key);
          const label = sessionLabel(session, key, agents, mainAgentName, messagesPerSession[key]);
          const fullLabel = session?.topic
            || (session?.lastMessage && !isWeakSessionTopic(session.lastMessage) ? session.lastMessage : '')
            || session?.label
            || label;
          const unread = session?.unread ?? 0;
          const hasPendingCompletion = Boolean(session?.hasPendingCompletion);
          const hasThinking = Boolean(thinkingBySession[key]?.runId || thinkingBySession[key]?.text);
          const runningState = hasThinking ? 'thinking' : typingBySession[key] ? 'streaming' : null;
          const isRunning = Boolean(runningState);
          const isEditing = editingKey === key;

          return (
            <div
              key={key}
              className="relative shrink-0"
              ref={isMain ? mainTabRef : undefined}
              onMouseEnter={isMain ? handleMainTabEnter : undefined}
              onMouseLeave={isMain ? handleMainTabLeave : undefined}
              onContextMenu={(e) => handleTabContextMenu(e, key)}
            >
              {/* Tab button */}
              <button
                role="tab"
                aria-selected={isActive}
                title={fullLabel}
                onClick={() => isActive ? undefined : setActiveSession(key)}
                onAuxClick={(e) => !isMain && handleTabAuxClick(e, key)}
                className={clsx(
                  'group flex items-center gap-1.5 h-[38px] px-3 text-[12px] font-medium transition-colors select-none relative',
                  'border-b-2 focus-visible:outline-none',
                  isActive
                    ? 'text-aegis-text border-aegis-primary bg-[rgb(var(--aegis-overlay)/0.04)]'
                    : 'text-aegis-text-dim border-transparent hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.03)]',
                )}
              >
                {/* Tab icon: main session (agent:X:main) = Shield+dot; desktop session = FilePlus. Only main tab has tooltip. */}
                {isMainSession ? (
                  <>
                    <div className={clsx('w-[6px] h-[6px] rounded-full shrink-0', statusDotClass)} title={isMain ? statusLabel : undefined} />
                    <Shield size={12} className={clsx('shrink-0', isActive ? 'text-aegis-primary' : 'text-aegis-text-dim')} />
                  </>
                ) : (
                  <FilePlus size={12} className={clsx('shrink-0 opacity-60', isActive ? 'text-aegis-primary' : 'text-aegis-text-dim')} />
                )}

                {/* Label (double-click to rename) */}
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => void submitRename(key, label)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitRename(key, label);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    className="max-w-[180px] min-w-[80px] h-[22px] px-1.5 rounded bg-aegis-bg border border-aegis-primary/40 text-[12px] text-aegis-text outline-none"
                    disabled={renaming}
                  />
                ) : (
                  <span
                    className="max-w-[140px] truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(key, label);
                    }}
                    title={t('chat.renameSessionHint', 'Double-click to rename')}
                  >
                    {label}
                  </span>
                )}
                {runningState && !isActive && (
                  <span
                    className="inline-flex items-center gap-1 shrink-0"
                    title={runningState === 'thinking'
                      ? t('chat.tabThinking', 'Background thinking in progress')
                      : t('chat.tabStreaming', 'Background reply streaming')}
                  >
                    {runningState === 'thinking' ? (
                      <Bot size={11} className="text-aegis-warning animate-pulse-soft" />
                    ) : (
                      <Zap size={11} className="text-aegis-primary animate-pulse-soft" />
                    )}
                  </span>
                )}
                {hasPendingCompletion && !isActive && !isRunning && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 bg-aegis-success/90"
                    title={t('chat.tabCompleted', 'Background reply completed')}
                  />
                )}

                {unread > 0 && !isActive && (
                  <span
                    className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-aegis-primary/15 text-aegis-primary text-[10px] font-semibold leading-[18px] text-center"
                    title={t('chat.tabUnreadCount', {
                      count: unread,
                      defaultValue: '{{count}} unread replies',
                    })}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}

                {/* Close button (non-main tabs only) */}
                {!isMain && (
                  <span
                    onClick={(e) => handleTabClose(e, key)}
                    className={clsx(
                      'ml-0.5 p-0.5 rounded hover:bg-[rgb(var(--aegis-overlay)/0.1)] transition-colors cursor-pointer',
                      isActive ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100',
                    )}
                    title={t('chat.closeTab', 'Close tab')}
                  >
                    <X size={10} />
                  </span>
                )}
              </button>

            </div>
          );
        })}
      </div>

      {/* Tooltip rendered in portal so it is not clipped by overflow-x-auto */}
      {showTooltip && tooltipPosition &&
        createPortal(
          <div style={{ position: 'fixed', left: tooltipPosition.left, top: tooltipPosition.top, zIndex: 9999 }}>
            <AgentStatusTooltip
              visible
              tokenUsage={tokenUsage}
              connected={connected}
              mainAgentName={mainAgentName}
              thinkingLevel={currentThinking}
            />
          </div>,
          document.body,
        )}

      {/* ── Tab context menu (right-click) ── */}
      {ctxMenu && (() => {
        const { isMainSession } = parseSessionKey(ctxMenu.key);
        const isMainTab = ctxMenu.key === MAIN_SESSION;
        return createPortal(
          <div
            ref={ctxMenuRef}
            className="fixed z-[9999] min-w-[180px] py-1 rounded-lg border bg-aegis-menu-bg border-aegis-menu-border text-[12px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y, boxShadow: 'var(--aegis-menu-shadow)' }}
          >
            {/* Close tab — not for agent:main:main (always pinned) */}
            {!isMainTab && (
              <button
                onClick={() => { closeTab(ctxMenu.key); setCtxMenu(null); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
              >
                <X size={13} className="opacity-60" />
                {t('chat.closeTab', 'Close tab')}
              </button>
            )}
            {/* Reset — available for all sessions */}
            <button
              onClick={handleResetSession}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
            >
              <RefreshCw size={13} className="opacity-60" />
              {t('chat.resetSession', 'Reset session')}
            </button>
            {/* Delete — only for non-main sessions (main sessions are auto-recreated by Gateway) */}
            {!isMainSession && (
              <>
                <div className="my-1 border-t border-[rgb(var(--aegis-overlay)/0.06)]" />
                <button
                  onClick={handleDeleteSession}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                  {t('chat.deleteSession', 'Delete session')}
                </button>
              </>
            )}
          </div>,
          document.body,
        );
      })()}

      <div className="relative shrink-0 w-0 h-full" ref={newPickerRef}>
        <NewSessionPicker
          open={showNewPicker}
          onClose={() => setShowNewPicker(false)}
          onOpenExisting={(key) => openTab(key)}
          onOpenMainSession={handleOpenMainSession}
          onCreateDesktopSession={handleCreateDesktopSession}
          openTabs={openTabs}
          loadingNew={loadingNew}
          newSessions={newSessions}
          messagesPerSession={messagesPerSession}
          agents={agents}
        />
      </div>
    </div>
  );
}

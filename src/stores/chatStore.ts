import { create } from 'zustand';
import type { DecisionOption, FileRef, SessionEvent, WorkshopEvent } from '@/types/RenderBlock';
import type { RenderBlock } from '@/types/RenderBlock';
import type { ResponseGroup } from '@/types/ResponseGroup';
import { parseHistory, parseHistoryMessage } from '@/processing/ContentParser';
import { normalizeGatewayMessage } from '@/processing/normalizeGatewayMessage';
import { buildSemanticBlocks, projectSemanticBlocksToRenderBlocks } from '@/processing/buildSemanticBlocks';
import { buildResponseGroups } from '@/processing/buildResponseGroups';
import { useSettingsStore } from './settingsStore';

// ═══════════════════════════════════════════════════════════
// Chat Store — Message, Session, Tabs & Usage State
// ═══════════════════════════════════════════════════════════

const MAIN_SESSION = 'agent:main:main';
const SESSION_TOPIC_PREFS_KEY = 'aegis:session-topic-prefs';

function readSessionTopicPrefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_TOPIC_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1].trim().length > 0
      )),
    );
  } catch {
    return {};
  }
}

function getSessionTopicPref(sessionKey: string): string | undefined {
  const prefs = readSessionTopicPrefs();
  const topic = prefs[sessionKey];
  return typeof topic === 'string' && topic.trim().length > 0 ? topic : undefined;
}

function persistSessionTopicPref(sessionKey: string, topic: string | undefined): void {
  try {
    const prefs = readSessionTopicPrefs();
    if (topic && topic.trim()) {
      prefs[sessionKey] = topic.trim();
    }
    localStorage.setItem(SESSION_TOPIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore persistence errors
  }
}

export type HistoryLoaderOptions = { force?: boolean; background?: boolean };

const WEAK_SESSION_TOPIC_PATTERNS: RegExp[] = [
  /^\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?$/i,
  /^agent[:\s-]/i,
  /^session[:\s-]/i,
  /^new chat$/i,
  /^untitled$/i,
  /^desktop-\d+$/i,
];

const WEAK_SESSION_TOPIC_FRAGMENTS = [
  'assistant',
  'chat',
  'session',
  'conversation',
  'message',
  'reply',
  'new',
  'main',
];

export const isWeakSessionTopic = (topic?: string): boolean => {
  if (!topic) return true;

  const normalized = topic.trim();
  if (!normalized) return true;
  if (normalized.length <= 2) return true;

  if (WEAK_SESSION_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const lowered = normalized.toLowerCase();
  let stripped = lowered;
  for (const fragment of WEAK_SESSION_TOPIC_FRAGMENTS) {
    stripped = stripped.split(fragment).join(' ');
  }

  const meaningful = stripped.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '');
  return meaningful.length < 4;
};

const SESSION_TOPIC_MAX_LENGTH = 40;

const normalizeSessionTopic = (text?: string | null): string | undefined => {
  if (typeof text !== 'string') return undefined;
  const normalized = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return undefined;

  const firstLine = normalized.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? normalized;
  const firstSentence = firstLine
    .split(/[。！？!?]/)
    .map((segment) => segment.trim())
    .find((segment) => segment.length >= 4) ?? firstLine;

  return firstSentence.length > SESSION_TOPIC_MAX_LENGTH
    ? `${firstSentence.slice(0, SESSION_TOPIC_MAX_LENGTH - 1).trim()}…`
    : firstSentence;
};

const deriveSessionTopic = (messages: ChatMessage[], fallbackText?: string): string | undefined => {
  const userTopic = messages
    .filter((message) => message.role === 'user')
    .map((message) => normalizeSessionTopic(message.content))
    .find((topic): topic is string => Boolean(topic) && !isWeakSessionTopic(topic));
  if (userTopic) return userTopic;

  const assistantTopic = messages
    .filter((message) => message.role === 'assistant' || message.role === 'system')
    .map((message) => normalizeSessionTopic(message.content))
    .find((topic): topic is string => Boolean(topic) && !isWeakSessionTopic(topic));
  if (assistantTopic) return assistantTopic;

  const readableFallback = normalizeSessionTopic(fallbackText);
  return readableFallback && !isWeakSessionTopic(readableFallback) ? readableFallback : undefined;
};

const resolveSessionTopic = (
  currentTopic: string | undefined,
  messages: ChatMessage[],
  fallbackText?: string,
): string | undefined => {
  const stableCurrentTopic = isWeakSessionTopic(currentTopic) ? undefined : currentTopic;
  if (messages.length > 0) {
    const derivedFromMessages = deriveSessionTopic(messages, undefined);
    if (derivedFromMessages) return derivedFromMessages;
    if (stableCurrentTopic) return stableCurrentTopic;
  }

  const derivedFromFallback = deriveSessionTopic([], fallbackText);
  if (derivedFromFallback) return derivedFromFallback;
  return stableCurrentTopic;
};

function resolveAndPersistSessionTopic(
  sessionKey: string,
  currentTopic: string | undefined,
  messages: ChatMessage[],
  fallbackText?: string,
): string | undefined {
  const hydratedCurrentTopic = currentTopic ?? getSessionTopicPref(sessionKey);
  const nextTopic = resolveSessionTopic(hydratedCurrentTopic, messages, fallbackText);
  if (nextTopic && !isWeakSessionTopic(nextTopic)) {
    persistSessionTopicPref(sessionKey, nextTopic);
  }
  return nextTopic;
}

const clearSessionAttentionState = (session: Session): Session => ({
  ...session,
  unread: 0,
  hasPendingCompletion: false,
});

const updateSession = (
  sessions: Session[],
  key: string,
  updater: (session: Session) => Session,
): Session[] => sessions.map((session) => (session.key === key ? updater(session) : session));

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'compaction';
  content: string;
  timestamp: string;
  runId?: string | null;
  responseState?: 'streaming' | 'final' | 'error' | 'aborted';
  isStreaming?: boolean;
  mediaUrl?: string;
  mediaType?: string;
  attachments?: Array<{
    mimeType: string;
    content: string;
    fileName: string;
  }>;
  // Tool call metadata (role === 'tool')
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: string;
  toolStatus?: 'running' | 'done' | 'error';
  toolDurationMs?: number;
  // Thinking/reasoning content (saved after streaming completes)
  thinkingContent?: string;
  fileRefs?: FileRef[];
  decisionOptions?: DecisionOption[];
  workshopEvents?: WorkshopEvent[];
  sessionEvents?: SessionEvent[];
}

export interface Session {
  key: string;
  label: string;
  topic?: string;
  lastMessage?: string;
  lastTimestamp?: string;
  unread?: number;
  hasPendingCompletion?: boolean;
  kind?: string;
  // Per-session model/thinking/token data cached from sessions.list
  model?: string | null;
  thinkingLevel?: string | null;
  totalTokens?: number;
  contextTokens?: number;
  compactionCount?: number;
}

export interface TokenUsage {
  contextTokens: number;
  maxTokens: number;
  percentage: number;
  compactions: number;
}

interface ChatState {
  // Messages (active session)
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage, sessionKey?: string) => void;
  updateStreamingMessage: (
    id: string,
    content: string,
    extra?: {
      mediaUrl?: string;
      mediaType?: string;
      runId?: string | null;
      responseState?: 'streaming' | 'final' | 'error' | 'aborted';
    },
    sessionKey?: string
  ) => void;
  finalizeStreamingMessage: (
    id: string,
    content: string,
    extra?: {
      mediaUrl?: string;
      mediaType?: string;
      runId?: string | null;
      responseState?: 'streaming' | 'final' | 'error' | 'aborted';
      fileRefs?: FileRef[];
      decisionOptions?: DecisionOption[];
      workshopEvents?: WorkshopEvent[];
      sessionEvents?: SessionEvent[];
    },
    sessionKey?: string
  ) => void;
  setMessages: (msgs: ChatMessage[], sessionKey?: string) => void;
  clearMessages: (sessionKey?: string) => void;

  // Derived render data (recomputed whenever messages change)
  renderBlocks: RenderBlock[];
  responseGroups: ResponseGroup[];

  // Per-session message cache
  messagesPerSession: Record<string, ChatMessage[]>;
  _blocksCache: Record<string, RenderBlock[]>;
  _groupsCache: Record<string, ResponseGroup[]>;
  cacheMessagesForSession: (key: string, msgs: ChatMessage[]) => void;
  getCachedMessages: (key: string) => ChatMessage[] | undefined;
  clearSessionMessages: (key: string) => void;

  // Sessions
  sessions: Session[];
  activeSessionKey: string;
  setSessions: (sessions: Session[], defaults?: { model: string | null; contextTokens: number | null }) => void;
  setActiveSession: (key: string) => void;
  incrementSessionUnread: (key: string, amount?: number) => void;
  markSessionCompleted: (key: string) => void;
  clearSessionAttention: (key: string) => void;

  // Remove session entirely (after gateway deletion) — closes tab + removes from sessions list + clears cache
  removeSession: (key: string) => void;

  // Zero out a session's token data immediately (after reset) without waiting for next poll
  clearSessionTokens: (key: string) => void;

  // Tabs
  openTabs: string[];
  openTab: (key: string) => void;
  closeTab: (key: string) => void;
  reorderTabs: (keys: string[]) => void;

  // Token Usage
  tokenUsage: TokenUsage | null;
  setTokenUsage: (usage: TokenUsage | null) => void;

  // Current model (live from gateway)
  currentModel: string | null;
  setCurrentModel: (model: string | null) => void;

  // Manual model override — set when user picks manually, prevents polling from overwriting
  manualModelOverride: string | null;
  setManualModelOverride: (model: string | null) => void;
  // Clear only the override flag without touching currentModel (used on tab switch)
  clearManualOverride: () => void;

  // Current thinking level (live from gateway session)
  currentThinking: string | null;
  setCurrentThinking: (level: string | null) => void;

  // Gateway session defaults (default model, contextTokens from config)
  sessionDefaults: { model: string | null; contextTokens: number | null };

  // Available models (fetched from gateway models.list)
  availableModels: Array<{ id: string; label: string; alias?: string }>;
  setAvailableModels: (models: Array<{ id: string; label: string; alias?: string }>) => void;

  // Drafts (per-session)
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  getDraft: (key: string) => string;

  // UI State — `isTyping` mirrors the active session's entry in `typingBySession`
  isTyping: boolean;
  typingBySession: Record<string, boolean>;
  setIsTyping: (typing: boolean, sessionKey?: string) => void;
  isSending: boolean;
  setIsSending: (sending: boolean) => void;
  isLoadingHistory: boolean;
  setIsLoadingHistory: (loading: boolean) => void;
  // Called by MessageInput before first send — loads history if not yet loaded
  historyLoader: ((sessionKey?: string, options?: HistoryLoaderOptions) => Promise<void>) | null;
  setHistoryLoader: (fn: ((sessionKey?: string, options?: HistoryLoaderOptions) => Promise<void>) | null) => void;

  // Quick Replies (from [[button:...]] markers)
  quickReplies: Array<{ text: string; value: string }>;
  quickRepliesBySession: Record<string, Array<{ text: string; value: string }>>;
  setQuickReplies: (buttons: Array<{ text: string; value: string }>, sessionKey?: string) => void;

  // Thinking stream (live reasoning display)
  thinkingText: string;
  thinkingRunId: string | null;
  thinkingBySession: Record<string, { runId: string | null; text: string }>;
  setThinkingStream: (runId: string, text: string, sessionKey?: string) => void;
  clearThinking: (sessionKey?: string) => void;

  // Connection
  connected: boolean;
  connecting: boolean;
  connectionError: string | null;
  restarting: boolean;
  setConnectionStatus: (status: { connected: boolean; connecting: boolean; error?: string }) => void;
  setRestarting: (v: boolean) => void;
}

// ─── Helper: derive TitleBar state from a cached Session ───
// Called synchronously on tab switch — applies session's model/thinking/tokens instantly.
// When session has no model (e.g. brand-new tab), falls back to gateway defaults.
// Always resets manualModelOverride so the new session's own model is shown.
function titleBarStateFromSession(
  session: Session | undefined,
  defaults: { model: string | null; contextTokens: number | null },
): Pick<ChatState, 'currentModel' | 'currentThinking' | 'tokenUsage' | 'manualModelOverride'> {
  const model = session?.model ?? defaults.model;
  const thinkingLevel = session?.thinkingLevel ?? null;
  const used = session?.totalTokens ?? 0;
  const max = session?.contextTokens ?? defaults.contextTokens ?? 0;
  const pct = max > 0 ? Math.round((used / max) * 100) : 0;
  return {
    currentModel: model,
    currentThinking: thinkingLevel,
    tokenUsage: used > 0 || max > 0
      ? { contextTokens: used, maxTokens: max, percentage: pct, compactions: session?.compactionCount ?? 0 }
      : null,
    manualModelOverride: null,
  };
}

// ─── Helpers: session-scoped message / derived caches (rcesbot parity) ───

const getSessionMessages = (state: ChatState, key: string): ChatMessage[] =>
  state.messagesPerSession[key] ?? (key === state.activeSessionKey ? state.messages : []);

const createRawHistoryPayload = (messages: ChatMessage[], sessionKey: string) =>
  messages.map((msg) => ({
    id: msg.id,
    sessionKey,
    runId: msg.runId,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    responseState: msg.responseState,
    toolName: msg.toolName,
    toolInput: msg.toolInput,
    toolOutput: msg.toolOutput,
    toolStatus: msg.toolStatus,
    toolDurationMs: msg.toolDurationMs,
    thinkingContent: msg.thinkingContent,
    mediaUrl: msg.mediaUrl,
    mediaType: msg.mediaType,
    attachments: msg.attachments,
    fileRefs: msg.fileRefs,
    decisionOptions: msg.decisionOptions,
    workshopEvents: msg.workshopEvents,
    sessionEvents: msg.sessionEvents,
    isStreaming: msg.isStreaming,
  }));

const normalizeComparableText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const stripThinkingPrefix = (content: string, thinkingContent?: string): string => {
  if (!content || !thinkingContent) return content;

  const normalizedContent = normalizeComparableText(content);
  const normalizedThinking = normalizeComparableText(thinkingContent);
  if (!normalizedContent || !normalizedThinking) return content;

  if (normalizedContent === normalizedThinking) {
    return '';
  }

  if (normalizedContent.startsWith(normalizedThinking)) {
    const rawLeadingIndex = content.indexOf(thinkingContent.trim());
    if (rawLeadingIndex >= 0) {
      const stripped = content.slice(rawLeadingIndex + thinkingContent.trim().length).trimStart();
      return stripped;
    }

    const strippedNormalized = normalizedContent.slice(normalizedThinking.length).trimStart();
    return strippedNormalized;
  }

  return content;
};

const recomputeBlocks = (messages: ChatMessage[], sessionKey: string): RenderBlock[] => {
  const raw = createRawHistoryPayload(messages, sessionKey);
  const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
  return parseHistory(raw, toolIntentEnabled);
};

const recomputeGroups = (messages: ChatMessage[], sessionKey: string): ResponseGroup[] => {
  const raw = createRawHistoryPayload(messages, sessionKey);
  const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
  const semanticBlocks = raw.flatMap((message) =>
    buildSemanticBlocks(normalizeGatewayMessage(message), { toolIntentEnabled }),
  );
  return buildResponseGroups(semanticBlocks);
};

const recomputeDerived = (messages: ChatMessage[], sessionKey: string): { blocks: RenderBlock[]; groups: ResponseGroup[] } => {
  const raw = createRawHistoryPayload(messages, sessionKey);
  const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
  const semanticBlocks = raw.flatMap((message) =>
    buildSemanticBlocks(normalizeGatewayMessage(message), { toolIntentEnabled }),
  );
  const groups = buildResponseGroups(semanticBlocks);
  const blocks = groups.flatMap((group) => projectSemanticBlocksToRenderBlocks(group.blocks));
  return { blocks, groups };
};

const getSessionBlocks = (state: ChatState, key: string, messages: ChatMessage[]): RenderBlock[] =>
  state._blocksCache[key] ?? (key === state.activeSessionKey ? state.renderBlocks : recomputeBlocks(messages, key));

export const useChatStore = create<ChatState>((set, get) => ({
  // ── Messages (active session) ──
  messages: [],

  // ── Derived render data ──
  renderBlocks: [],
  responseGroups: [],

  addMessage: (msg, sessionKey) => {
    set((state) => {
      const targetKey = sessionKey ?? state.activeSessionKey;
      const currentMessages = getSessionMessages(state, targetKey);
      if (currentMessages.some((m) => m.id === msg.id)) return state;
      const updated = [...currentMessages, msg];

      const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
      const newBlocks = parseHistoryMessage(
        {
          id: msg.id,
          sessionKey: targetKey,
          runId: msg.runId,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          responseState: msg.responseState,
          toolName: msg.toolName,
          toolInput: msg.toolInput,
          toolOutput: msg.toolOutput,
          toolStatus: msg.toolStatus,
          toolDurationMs: msg.toolDurationMs,
          thinkingContent: msg.thinkingContent,
          mediaUrl: msg.mediaUrl,
          mediaType: msg.mediaType,
          attachments: msg.attachments,
          fileRefs: msg.fileRefs,
          decisionOptions: msg.decisionOptions,
          workshopEvents: msg.workshopEvents,
          sessionEvents: msg.sessionEvents,
          isStreaming: msg.isStreaming,
        },
        toolIntentEnabled,
      );

      const updatedBlocks = [...getSessionBlocks(state, targetKey, currentMessages), ...newBlocks];
      const updatedGroups = recomputeGroups(updated, targetKey);
      const isActive = targetKey === state.activeSessionKey;

      return {
        sessions: updateSession(state.sessions, targetKey, (session) => ({
          ...session,
          topic: resolveAndPersistSessionTopic(targetKey, session.topic, updated, session.lastMessage),
        })),
        ...(isActive ? { messages: updated, renderBlocks: updatedBlocks, responseGroups: updatedGroups } : {}),
        messagesPerSession: {
          ...state.messagesPerSession,
          [targetKey]: updated,
        },
        _blocksCache: {
          ...state._blocksCache,
          [targetKey]: updatedBlocks,
        },
        _groupsCache: {
          ...state._groupsCache,
          [targetKey]: updatedGroups,
        },
      };
    });
  },

  updateStreamingMessage: (id, content, extra, sessionKey) => {
    set((state) => {
      const targetKey = sessionKey ?? state.activeSessionKey;
      const currentMessages = getSessionMessages(state, targetKey);
      const existingIdx = currentMessages.findIndex((m) => m.id === id);
      let updated: ChatMessage[];
      if (existingIdx >= 0) {
        updated = [...currentMessages];
        updated[existingIdx] = {
          ...updated[existingIdx],
          content,
          runId: extra?.runId ?? updated[existingIdx].runId ?? null,
          isStreaming: true,
          responseState: extra?.responseState ?? 'streaming',
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
        };
      } else {
        updated = [
          ...currentMessages,
          {
            id,
            role: 'assistant' as const,
            content,
            timestamp: new Date().toISOString(),
            runId: extra?.runId ?? null,
            isStreaming: true,
            responseState: extra?.responseState ?? 'streaming',
            ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          },
        ];
      }

      const blocks = [...getSessionBlocks(state, targetKey, currentMessages)];
      const blockIdx = blocks.findIndex((b) => b.id === id);
      if (blockIdx >= 0) {
        blocks[blockIdx] = {
          ...blocks[blockIdx],
          ...(blocks[blockIdx].type === 'message' ? { markdown: content } : {}),
          isStreaming: true,
        } as RenderBlock;
      } else {
        blocks.push({
          type: 'message' as const,
          id,
          role: 'assistant' as const,
          markdown: content,
          artifacts: [],
          images: [],
          isStreaming: true,
          timestamp: new Date().toISOString(),
        });
      }

      const groups = recomputeGroups(updated, targetKey);
      const isActive = targetKey === state.activeSessionKey;
      return {
        typingBySession: {
          ...state.typingBySession,
          [targetKey]: true,
        },
        ...(isActive ? { messages: updated, renderBlocks: blocks, responseGroups: groups, isTyping: true } : {}),
        messagesPerSession: {
          ...state.messagesPerSession,
          [targetKey]: updated,
        },
        _blocksCache: {
          ...state._blocksCache,
          [targetKey]: blocks,
        },
        _groupsCache: {
          ...state._groupsCache,
          [targetKey]: groups,
        },
      };
    });
  },

  finalizeStreamingMessage: (id, content, extra, sessionKey) => {
    set((state) => {
      const targetKey = sessionKey ?? state.activeSessionKey;
      const currentMessages = getSessionMessages(state, targetKey);
      const existingIdx = currentMessages.findIndex((m) => m.id === id);
      const sessionThinking = state.thinkingBySession[targetKey];
      const thinkingContent = sessionThinking?.text || undefined;
      const finalContent = stripThinkingPrefix(content, thinkingContent);

      if (existingIdx >= 0) {
        const updated = [...currentMessages];

        updated[existingIdx] = {
          ...updated[existingIdx],
          content: finalContent || updated[existingIdx].content,
          runId: extra?.runId ?? updated[existingIdx].runId ?? null,
          isStreaming: false,
          responseState: extra?.responseState ?? 'final',
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          ...(thinkingContent ? { thinkingContent } : {}),
          ...(extra?.fileRefs ? { fileRefs: extra.fileRefs } : {}),
          ...(extra?.decisionOptions ? { decisionOptions: extra.decisionOptions } : {}),
          ...(extra?.workshopEvents ? { workshopEvents: extra.workshopEvents } : {}),
          ...(extra?.sessionEvents ? { sessionEvents: extra.sessionEvents } : {}),
        };

        const derived = recomputeDerived(updated, targetKey);
        return {
          typingBySession: {
            ...state.typingBySession,
            [targetKey]: false,
          },
          thinkingBySession: {
            ...state.thinkingBySession,
            [targetKey]: { runId: null, text: '' },
          },
          messagesPerSession: {
            ...state.messagesPerSession,
            [targetKey]: updated,
          },
          _blocksCache: {
            ...state._blocksCache,
            [targetKey]: derived.blocks,
          },
          _groupsCache: {
            ...state._groupsCache,
            [targetKey]: derived.groups,
          },
          ...(targetKey === state.activeSessionKey
            ? {
                messages: updated,
                renderBlocks: derived.blocks,
                responseGroups: derived.groups,
                isTyping: false,
                thinkingText: '',
                thinkingRunId: null,
              }
            : {}),
        };
      }
      // Message not found — this happens when post-tool-call text arrives
      // with a new runId that had no preceding delta events. Create a new message.
      if (finalContent && finalContent.trim()) {
        const newMsg: ChatMessage = {
          id,
          role: 'assistant',
          content: finalContent,
          timestamp: new Date().toISOString(),
          runId: extra?.runId ?? null,
          isStreaming: false,
          responseState: extra?.responseState ?? 'final',
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          ...(thinkingContent ? { thinkingContent } : {}),
          ...(extra?.fileRefs ? { fileRefs: extra.fileRefs } : {}),
          ...(extra?.decisionOptions ? { decisionOptions: extra.decisionOptions } : {}),
          ...(extra?.workshopEvents ? { workshopEvents: extra.workshopEvents } : {}),
          ...(extra?.sessionEvents ? { sessionEvents: extra.sessionEvents } : {}),
        };
        const updated = [...currentMessages, newMsg];
        const derived = recomputeDerived(updated, targetKey);
        return {
          typingBySession: {
            ...state.typingBySession,
            [targetKey]: false,
          },
          thinkingBySession: {
            ...state.thinkingBySession,
            [targetKey]: { runId: null, text: '' },
          },
          messagesPerSession: {
            ...state.messagesPerSession,
            [targetKey]: updated,
          },
          _blocksCache: {
            ...state._blocksCache,
            [targetKey]: derived.blocks,
          },
          _groupsCache: {
            ...state._groupsCache,
            [targetKey]: derived.groups,
          },
          ...(targetKey === state.activeSessionKey
            ? {
                messages: updated,
                renderBlocks: derived.blocks,
                responseGroups: derived.groups,
                isTyping: false,
                thinkingText: '',
                thinkingRunId: null,
              }
            : {}),
        };
      }
      return {
        typingBySession: {
          ...state.typingBySession,
          [targetKey]: false,
        },
        thinkingBySession: {
          ...state.thinkingBySession,
          [targetKey]: { runId: null, text: '' },
        },
        ...(targetKey === state.activeSessionKey
          ? { isTyping: false, thinkingText: '', thinkingRunId: null }
          : {}),
      };
    });
  },

  setMessages: (msgs, sessionKey) => set((state) => {
    const targetKey = sessionKey ?? state.activeSessionKey;
    const derived = recomputeDerived(msgs, targetKey);
    const isActive = targetKey === state.activeSessionKey;
    const currentSession = state.sessions.find((session) => session.key === targetKey);
    return {
      sessions: updateSession(state.sessions, targetKey, (session) => ({
        ...session,
        topic: resolveAndPersistSessionTopic(targetKey, session.topic, msgs, session.lastMessage),
      })),
      ...(isActive ? { messages: msgs, renderBlocks: derived.blocks, responseGroups: derived.groups } : {}),
      messagesPerSession: {
        ...state.messagesPerSession,
        [targetKey]: msgs,
      },
      _blocksCache: {
        ...state._blocksCache,
        [targetKey]: derived.blocks,
      },
      _groupsCache: {
        ...state._groupsCache,
        [targetKey]: derived.groups,
      },
    };
  }),

  clearMessages: (sessionKey) => set((state) => {
    const targetKey = sessionKey ?? state.activeSessionKey;
    const isActive = targetKey === state.activeSessionKey;
    return {
      typingBySession: {
        ...state.typingBySession,
        [targetKey]: false,
      },
      quickRepliesBySession: {
        ...state.quickRepliesBySession,
        [targetKey]: [],
      },
      thinkingBySession: {
        ...state.thinkingBySession,
        [targetKey]: { runId: null, text: '' },
      },
      messagesPerSession: {
        ...state.messagesPerSession,
        [targetKey]: [],
      },
      _blocksCache: {
        ...state._blocksCache,
        [targetKey]: [],
      },
      _groupsCache: {
        ...state._groupsCache,
        [targetKey]: [],
      },
      ...(isActive
        ? {
            messages: [],
            renderBlocks: [],
            responseGroups: [],
            isTyping: false,
            quickReplies: [],
            thinkingText: '',
            thinkingRunId: null,
          }
        : {}),
    };
  }),

  // ── Per-session cache ──
  messagesPerSession: {},
  _blocksCache: {},
  _groupsCache: {},

  cacheMessagesForSession: (key, msgs) => set((state) => {
    const derived = recomputeDerived(msgs, key);
    return {
      sessions: updateSession(state.sessions, key, (session) => ({
        ...session,
        topic: resolveAndPersistSessionTopic(key, session.topic, msgs, session.lastMessage),
      })),
      messagesPerSession: { ...state.messagesPerSession, [key]: msgs },
      _blocksCache: { ...state._blocksCache, [key]: derived.blocks },
      _groupsCache: { ...state._groupsCache, [key]: derived.groups },
    };
  }),

  getCachedMessages: (key) => get().messagesPerSession[key],

  clearSessionMessages: (key) => set((state) => {
    const isActive = state.activeSessionKey === key;
    return {
      messagesPerSession: { ...state.messagesPerSession, [key]: [] },
      _blocksCache: { ...state._blocksCache, [key]: [] },
      _groupsCache: { ...state._groupsCache, [key]: [] },
      typingBySession: { ...state.typingBySession, [key]: false },
      quickRepliesBySession: { ...state.quickRepliesBySession, [key]: [] },
      thinkingBySession: {
        ...state.thinkingBySession,
        [key]: { runId: null, text: '' },
      },
      ...(isActive
        ? {
            messages: [],
            renderBlocks: [],
            responseGroups: [],
            isTyping: false,
            quickReplies: [],
            thinkingText: '',
            thinkingRunId: null,
          }
        : {}),
    };
  }),

  // ── Sessions ──
  sessions: [{ key: MAIN_SESSION, label: 'Main Session' }],
  activeSessionKey: MAIN_SESSION,

  setSessions: (sessions, defaults) => {
    const {
      activeSessionKey,
      manualModelOverride,
      sessionDefaults: prev,
      sessions: previousSessions,
      messagesPerSession,
    } = get();
    const defs = defaults ?? prev;
    const previousByKey = new Map(previousSessions.map((session) => [session.key, session]));
    const mergedSessions = sessions.map((session) => {
      const previous = previousByKey.get(session.key);
      const hasCachedMessages = Object.prototype.hasOwnProperty.call(messagesPerSession, session.key);
      const cachedMessages = hasCachedMessages ? messagesPerSession[session.key] ?? [] : [];
      const hydratedTopic = previous?.topic ?? getSessionTopicPref(session.key);
      const merged: Session = {
        ...session,
        topic: hasCachedMessages
          ? resolveAndPersistSessionTopic(session.key, hydratedTopic, cachedMessages, session.lastMessage)
          : resolveAndPersistSessionTopic(session.key, hydratedTopic, [], session.lastMessage),
        unread: previous?.unread ?? session.unread ?? 0,
        hasPendingCompletion: previous?.hasPendingCompletion ?? session.hasPendingCompletion ?? false,
      };
      return session.key === activeSessionKey ? clearSessionAttentionState(merged) : merged;
    });
    const active = mergedSessions.find((s) => s.key === activeSessionKey);
    const titleBar = titleBarStateFromSession(active, defs);
    set({
      sessions: mergedSessions,
      ...(defaults ? { sessionDefaults: defs } : {}),
      currentThinking: titleBar.currentThinking,
      tokenUsage: titleBar.tokenUsage,
      // Only update currentModel if there is no manual override in effect.
      ...(manualModelOverride ? {} : { currentModel: titleBar.currentModel }),
    });
  },

  setActiveSession: (key) => {
    const state = get();
    const msgs = state.messagesPerSession[key] || [];
    const blocks = state._blocksCache[key];
    const groups = state._groupsCache[key];
    const clearedSessions = updateSession(state.sessions, key, clearSessionAttentionState);
    const session = clearedSessions.find((s) => s.key === key) ?? state.sessions.find((s) => s.key === key);
    const titleBar = titleBarStateFromSession(session, state.sessionDefaults);
    set({
      sessions: clearedSessions,
      activeSessionKey: key,
      messages: msgs,
      renderBlocks: blocks ?? recomputeBlocks(msgs, key),
      responseGroups: groups ?? recomputeGroups(msgs, key),
      isTyping: state.typingBySession[key] || false,
      quickReplies: state.quickRepliesBySession[key] || [],
      thinkingText: state.thinkingBySession[key]?.text || '',
      thinkingRunId: state.thinkingBySession[key]?.runId || null,
      ...titleBar,
    });
  },

  incrementSessionUnread: (key, amount = 1) => set((state) => {
    if (key === state.activeSessionKey) {
      return { sessions: updateSession(state.sessions, key, clearSessionAttentionState) };
    }
    return {
      sessions: updateSession(state.sessions, key, (session) => ({
        ...session,
        unread: Math.max(0, (session.unread ?? 0) + amount),
      })),
    };
  }),

  markSessionCompleted: (key) => set((state) => {
    if (key === state.activeSessionKey) {
      return { sessions: updateSession(state.sessions, key, clearSessionAttentionState) };
    }
    return {
      sessions: updateSession(state.sessions, key, (session) => ({
        ...session,
        hasPendingCompletion: true,
      })),
    };
  }),

  clearSessionAttention: (key) => set((state) => ({
    sessions: updateSession(state.sessions, key, clearSessionAttentionState),
  })),

  // ── Tabs ──
  openTabs: [MAIN_SESSION],

  openTab: (key) => set((state) => {
    const clearedSessions = updateSession(state.sessions, key, clearSessionAttentionState);
    const session = clearedSessions.find((s) => s.key === key) ?? state.sessions.find((s) => s.key === key);
    const titleBar = titleBarStateFromSession(session, state.sessionDefaults);
    if (state.openTabs.includes(key)) {
      const cached = state.messagesPerSession[key] || [];
      const blocks = state._blocksCache[key];
      const groups = state._groupsCache[key];
      return {
        sessions: clearedSessions,
        activeSessionKey: key,
        messages: cached,
        renderBlocks: blocks ?? recomputeBlocks(cached, key),
        responseGroups: groups ?? recomputeGroups(cached, key),
        isTyping: state.typingBySession[key] || false,
        quickReplies: state.quickRepliesBySession[key] || [],
        thinkingText: state.thinkingBySession[key]?.text || '',
        thinkingRunId: state.thinkingBySession[key]?.runId || null,
        ...titleBar,
      };
    }
    const msgs = state.messagesPerSession[key] || [];
    const blocks = state._blocksCache[key];
    const groups = state._groupsCache[key];
    return {
      sessions: clearedSessions,
      openTabs: [...state.openTabs, key],
      activeSessionKey: key,
      messages: msgs,
      renderBlocks: blocks ?? recomputeBlocks(msgs, key),
      responseGroups: groups ?? recomputeGroups(msgs, key),
      isTyping: state.typingBySession[key] || false,
      quickReplies: state.quickRepliesBySession[key] || [],
      thinkingText: state.thinkingBySession[key]?.text || '',
      thinkingRunId: state.thinkingBySession[key]?.runId || null,
      ...titleBar,
    };
  }),

  closeTab: (key) => set((state) => {
    if (key === MAIN_SESSION) return state;
    const newTabs = state.openTabs.filter((t) => t !== key);
    if (newTabs.length === 0) newTabs.push(MAIN_SESSION);
    const newActive = state.activeSessionKey === key
      ? newTabs[newTabs.length - 1]
      : state.activeSessionKey;
    const clearedSessions = updateSession(state.sessions, newActive, clearSessionAttentionState);
    const msgs = state.messagesPerSession[newActive] || [];
    const blocks = state._blocksCache[newActive];
    const groups = state._groupsCache[newActive];
    const session = clearedSessions.find((s) => s.key === newActive) ?? state.sessions.find((s) => s.key === newActive);
    const titleBar = titleBarStateFromSession(session, state.sessionDefaults);
    return {
      sessions: clearedSessions,
      openTabs: newTabs,
      activeSessionKey: newActive,
      messages: msgs,
      renderBlocks: blocks ?? recomputeBlocks(msgs, newActive),
      responseGroups: groups ?? recomputeGroups(msgs, newActive),
      isTyping: state.typingBySession[newActive] || false,
      quickReplies: state.quickRepliesBySession[newActive] || [],
      thinkingText: state.thinkingBySession[newActive]?.text || '',
      thinkingRunId: state.thinkingBySession[newActive]?.runId || null,
      ...titleBar,
    };
  }),

  reorderTabs: (keys) => set({ openTabs: keys }),

  removeSession: (key) => set((state) => {
    if (key === MAIN_SESSION) return state;
    const newTabs = state.openTabs.filter((t) => t !== key);
    if (newTabs.length === 0) newTabs.push(MAIN_SESSION);
    const newActive = state.activeSessionKey === key
      ? newTabs[newTabs.length - 1]
      : state.activeSessionKey;
    const newSessions = updateSession(
      state.sessions.filter((s) => s.key !== key),
      newActive,
      clearSessionAttentionState,
    );
    const { [key]: _msgs, ...restMessages } = state.messagesPerSession;
    const { [key]: _blocks, ...restBlocks } = state._blocksCache;
    const { [key]: _groupsRm, ...restGroupsCache } = state._groupsCache;
    const { [key]: _typingRm, ...restTyping } = state.typingBySession;
    const { [key]: _qr, ...restQuickReplies } = state.quickRepliesBySession;
    const { [key]: _thinking, ...restThinking } = state.thinkingBySession;
    const msgs = restMessages[newActive] || [];
    const blocks = restBlocks[newActive];
    const groups = restGroupsCache[newActive];
    const session = newSessions.find((s) => s.key === newActive);
    const titleBar = titleBarStateFromSession(session, state.sessionDefaults);
    return {
      openTabs: newTabs,
      activeSessionKey: newActive,
      sessions: newSessions,
      messagesPerSession: restMessages,
      _blocksCache: restBlocks,
      _groupsCache: restGroupsCache,
      typingBySession: restTyping,
      quickRepliesBySession: restQuickReplies,
      thinkingBySession: restThinking,
      quickReplies: restQuickReplies[newActive] || [],
      thinkingText: restThinking[newActive]?.text || '',
      thinkingRunId: restThinking[newActive]?.runId || null,
      messages: msgs,
      renderBlocks: blocks ?? recomputeBlocks(msgs, newActive),
      responseGroups: groups ?? recomputeGroups(msgs, newActive),
      isTyping: restTyping[newActive] || false,
      ...titleBar,
    };
  }),

  clearSessionTokens: (key) => set((state) => {
    const updatedSessions = state.sessions.map((s) =>
      s.key === key
        ? { ...s, totalTokens: 0, contextTokens: 0, compactionCount: 0 }
        : s,
    );
    const isActive = state.activeSessionKey === key;
    return {
      sessions: updatedSessions,
      ...(isActive ? { tokenUsage: null } : {}),
    };
  }),

  // ── Session Defaults (from gateway sessions.list response) ──
  sessionDefaults: { model: null, contextTokens: null },

  // ── Token Usage ──
  tokenUsage: null,
  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  currentModel: null,
  setCurrentModel: (model) => set({ currentModel: model }),
  manualModelOverride: null,
  setManualModelOverride: (model) => set({ manualModelOverride: model, currentModel: model }),
  clearManualOverride: () => set({ manualModelOverride: null }),
  currentThinking: null,
  setCurrentThinking: (level) => set({ currentThinking: level }),

  // ── Available Models ──
  availableModels: [],
  setAvailableModels: (models) => set({ availableModels: models }),

  // ── UI State ──
  isTyping: false,
  typingBySession: {},
  setIsTyping: (typing, sessionKey) =>
    set((state) => {
      const targetKey = sessionKey ?? state.activeSessionKey;
      return {
        typingBySession: {
          ...state.typingBySession,
          [targetKey]: typing,
        },
        ...(targetKey === state.activeSessionKey ? { isTyping: typing } : {}),
      };
    }),
  isSending: false,
  setIsSending: (sending) => set({ isSending: sending }),
  isLoadingHistory: false,
  setIsLoadingHistory: (loading) => set({ isLoadingHistory: loading }),
  historyLoader: null,
  setHistoryLoader: (fn) => set({ historyLoader: fn }),

  // ── Drafts ──
  drafts: {},
  setDraft: (key, text) => set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
  getDraft: (key) => get().drafts[key] || '',

  // ── Quick Replies ──
  quickReplies: [],
  quickRepliesBySession: {},
  setQuickReplies: (buttons, sessionKey) => set((state) => {
    const targetKey = sessionKey ?? state.activeSessionKey;
    return {
      quickRepliesBySession: {
        ...state.quickRepliesBySession,
        [targetKey]: buttons,
      },
      ...(targetKey === state.activeSessionKey ? { quickReplies: buttons } : {}),
    };
  }),

  // ── Thinking Stream ──
  thinkingText: '',
  thinkingRunId: null,
  thinkingBySession: {},
  setThinkingStream: (runId, text, sessionKey) => set((state) => {
    const targetKey = sessionKey ?? state.activeSessionKey;
    return {
      thinkingBySession: {
        ...state.thinkingBySession,
        [targetKey]: { runId, text },
      },
      ...(targetKey === state.activeSessionKey ? { thinkingRunId: runId, thinkingText: text } : {}),
    };
  }),
  clearThinking: (sessionKey) => set((state) => {
    const targetKey = sessionKey ?? state.activeSessionKey;
    return {
      thinkingBySession: {
        ...state.thinkingBySession,
        [targetKey]: { runId: null, text: '' },
      },
      ...(targetKey === state.activeSessionKey ? { thinkingText: '', thinkingRunId: null } : {}),
    };
  }),

  // ── Connection ──
  connected: false,
  connecting: false,
  connectionError: null,
  restarting: false,

  setConnectionStatus: (status) =>
    set((state) => ({
      connected: status.connected,
      connecting: status.connecting,
      connectionError: status.error || null,
      // Clear restarting once we (re)connect
      restarting: status.connected ? false : state.restarting,
    })),

  setRestarting: (v) => set({ restarting: v }),
}));

import { useEffect, useCallback, useState, useRef, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PairingScreen } from '@/components/PairingScreen';
import { GatewayErrorScreen } from '@/components/GatewayErrorScreen';
import { ToastContainer } from '@/components/Toast/ToastContainer';

// Lazy-loaded pages
const DashboardPage = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.DashboardPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then(m => ({ default: m.ChatPage })));
const WorkshopPage = lazy(() => import('@/pages/Workshop').then(m => ({ default: m.WorkshopPage })));
const FullAnalyticsPage = lazy(() => import('@/pages/FullAnalytics').then(m => ({ default: m.FullAnalyticsPage })));
const CronMonitorPage = lazy(() => import('@/pages/CronMonitor').then(m => ({ default: m.CronMonitorPage })));
const AgentHubPage = lazy(() => import('@/pages/AgentHub').then(m => ({ default: m.AgentHubPage })));
const MemoryExplorerPage = lazy(() => import('@/pages/MemoryExplorer').then(m => ({ default: m.MemoryExplorerPage })));
const SkillsPageFull = lazy(() => import('@/pages/SkillsPage').then(m => ({ default: m.SkillsPage })));
const TerminalPage = lazy(() => import('@/pages/TerminalPage').then(m => ({ default: m.TerminalPage })));
const SettingsPageFull = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPageFull })));
const ConfigManagerPage = lazy(() => import('@/pages/ConfigManager').then(m => ({ default: m.ConfigManagerPage })));
const SessionManagerPage = lazy(() => import('@/pages/SessionManager').then(m => ({ default: m.SessionManagerPage })));
const LogsViewerPage = lazy(() => import('@/pages/LogsViewer').then(m => ({ default: m.LogsViewerPage })));
const MultiAgentViewPage = lazy(() => import('@/pages/MultiAgentView').then(m => ({ default: m.MultiAgentViewPage })));
const FileManagerPage = lazy(() => import('@/pages/FileManager').then(m => ({ default: m.FileManagerPage })));
const CalendarPage = lazy(() => import('@/pages/Calendar'));
const CodeInterpreterPage = lazy(() => import('@/pages/CodeInterpreter').then(m => ({ default: m.CodeInterpreterPage })));
const McpToolsPage = lazy(() => import('@/pages/McpTools').then(m => ({ default: m.McpToolsPage })));
import { FeatureRoute } from '@/components/FeatureRoute';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gateway } from '@/services/gateway';
import { notifications } from '@/services/notifications';
import { changeLanguage } from '@/i18n';

const SESSION_MODEL_PREFS_KEY = 'aegis:session-model-prefs';

function readSessionModelPrefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_MODEL_PREFS_KEY);
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

function getSessionModelPref(sessionKey: string): string | null {
  const prefs = readSessionModelPrefs();
  const model = prefs[sessionKey];
  return typeof model === 'string' && model.trim().length > 0 ? model : null;
}

function setSessionModelPref(sessionKey: string, model: string | null): void {
  try {
    const prefs = readSessionModelPrefs();
    if (model && model.trim()) {
      prefs[sessionKey] = model.trim();
    } else {
      delete prefs[sessionKey];
    }
    localStorage.setItem(SESSION_MODEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore persistence errors
  }
}

// ═══════════════════════════════════════════════════════════
// OpenClaw Desktop — Mission Control
// ═══════════════════════════════════════════════════════════

export default function App() {
  const { t } = useTranslation();
  const { theme } = useSettingsStore();
  const {
    addMessage,
    updateStreamingMessage,
    finalizeStreamingMessage,
    setConnectionStatus,
    setIsTyping,
    incrementSessionUnread,
    markSessionCompleted,
    setSessions,
    setAvailableModels,
  } = useChatStore();

  // ── Auto-Pairing State ──
  const [needsPairing, setNeedsPairing] = useState(false);
  const [scopeError, setScopeError] = useState<string>('');
  const [gatewayHttpUrl, setGatewayHttpUrl] = useState('http://127.0.0.1:18789');
  const pairingTriggeredRef = useRef(false);

  // ── Gateway process boot error state ──
  // Tracks whether the gateway *process* failed to start (distinct from WebSocket connection issues).
  // When set, the GatewayErrorScreen overlay is shown so users can diagnose and recover.
  const [gatewayBootError, setGatewayBootError] = useState<string | null>(null);
  const [gatewayBootLogs, setGatewayBootLogs] = useState<{ stdout: string; stderr: string } | undefined>();
  const [gatewayRetrying, setGatewayRetrying] = useState(false);

  // ── Load Sessions from Gateway (also updates per-session model/thinking/token data) ──
  // This is the single polling call for all session metadata. The store's setSessions
  // synchronously applies the active session's data to the TitleBar state — no separate
  // loadTokenUsage needed.
  const loadSessions = useCallback(async () => {
    try {
      const result = await gateway.getSessions();
      const rawSessions = Array.isArray(result?.sessions) ? result.sessions : [];
      // Gateway-level defaults (configured model, context window)
      const defaults = result?.defaults
        ? { model: result.defaults.model ?? null, contextTokens: result.defaults.contextTokens ?? null }
        : undefined;
      const sessions = rawSessions.map((s: any) => {
        const key = s.key || s.sessionKey || 'unknown';
        let label = s.label || s.name || key;
        if (key === 'agent:main:main') label = t('dashboard.mainSession');
        else if (key.startsWith('agent:main:')) label = key.split(':').pop() || key;
        const persistedModel = getSessionModelPref(key);
        const resolvedModel = s.model ?? persistedModel ?? null;
        if (typeof s.model === 'string' && s.model.trim().length > 0) {
          setSessionModelPref(key, s.model);
        }
        return {
          key, label,
          topic: typeof s.topic === 'string' ? s.topic : undefined,
          lastMessage: s.lastMessage?.content?.substring?.(0, 60),
          lastTimestamp: s.lastMessage?.timestamp || s.updatedAt,
          kind: s.kind,
          // Per-session metadata for TitleBar
          model: resolvedModel,
          thinkingLevel: s.thinkingLevel ?? null,
          totalTokens: s.totalTokens,
          contextTokens: s.contextTokens,
          compactionCount: s.compactionCount,
        };
      });
      // Always sync sessions/defaults, even when the session list is currently empty.
      // This keeps TitleBar model in sync from gateway defaults after config changes.
      setSessions(sessions, defaults);
    } catch { /* silent */ }
  }, [setSessions, t]);

  // ── Load Available Models from Gateway ──
  // Multi-strategy: config.get → agents.list + session → fallback
  // Labels are formatted in TitleBar via formatModelName(), so we just store IDs.
  const loadAvailableModels = useCallback(async () => {
    const applyModels = async (models: Array<{ id: string; label: string; alias?: string }>) => {
      const state = useChatStore.getState();
      const sessionKey = state.activeSessionKey || 'agent:main:main';
      const activeSession = state.sessions.find((s) => s.key === sessionKey);
      const persistedModel = activeSession?.model ?? getSessionModelPref(sessionKey) ?? state.currentModel;
      const persistedStillAvailable = persistedModel
        ? models.some((m) => m.id === persistedModel)
        : false;

      setAvailableModels(models);

      // Auto-select guardrails:
      // 1) Preserve per-session model when present and still available.
      // 2) For first-run/no persisted model, auto-select only if exactly one choice exists.
      //    (Do NOT auto-fallback when list temporarily mismatches during startup.)
      const shouldAutoSelect = models.length > 0 && (
        (!persistedModel && models.length === 1)
      );

      if (!shouldAutoSelect) return;

      const targetModel = models[0].id;
      if (targetModel === persistedModel) return; // already set, skip the round-trip

      // Use setManualModelOverride so subsequent setSessions() calls (which run during
      // gateway reconnect) cannot overwrite currentModel back to null before the
      // gateway has persisted the new model in the session.
      state.setManualModelOverride(targetModel);
      try {
        await gateway.setSessionModel(targetModel, sessionKey);
        setSessionModelPref(sessionKey, targetModel);
        setTimeout(() => void loadSessions(), 500);
      } catch (err) {
        console.warn('[Models] Failed to auto-select model:', err);
      }
    };

    // ── Strategy 1: config.get → agents.defaults.models (most reliable) ──
    let hasConfiguredProvider = false;
    try {
      const raw = await gateway.call('config.get', {});
      // Response may be config directly OR wrapped: { config: {...} }
      const config = raw?.agents?.defaults?.models ? raw : raw?.config;
      const authProfiles = config?.auth?.profiles ?? {};
      const modelProviders = config?.models?.providers ?? {};
      const envVars = config?.env?.vars ?? {};

      const hasAuthProfiles = Object.keys(authProfiles).length > 0;
      const hasModelProviders = Object.keys(modelProviders).length > 0;
      const hasEnvVars = Object.keys(envVars).length > 0;
      hasConfiguredProvider = hasAuthProfiles || hasModelProviders || hasEnvVars;

      const modelsSection: Record<string, any> = config?.agents?.defaults?.models ?? {};
      const fromConfig = Object.entries(modelsSection)
        .filter(([, cfg]: [string, any]) => cfg?.alias)
        .map(([id, cfg]: [string, any]) => ({
          id,
          label: id,           // Raw — formatted in TitleBar
          alias: cfg.alias as string,
        }));
      if (fromConfig.length > 0) {
        console.log('[Models] Loaded from config.get:', fromConfig.length);
        await applyModels(fromConfig);
        return;
      }
      if (!hasConfiguredProvider) {
        setAvailableModels([]);
        console.log('[Models] No provider configured in config.get; skip gateway model fallback');
        return;
      }
    } catch (e) {
      console.warn('[Models] config.get failed, trying agents.list:', e);
    }

    // ── Strategy 2: Collect unique models from agents + session ──
    // Guard: this fallback is only valid after at least one provider is configured.
    if (!hasConfiguredProvider) {
      setAvailableModels([]);
      return;
    }
    try {
      const modelMap = new Map<string, { id: string; label: string; alias?: string }>();

      // Main session model
      const sessionsResult = await gateway.getSessions();
      const sessions = Array.isArray(sessionsResult?.sessions) ? sessionsResult.sessions : [];
      const main = sessions.find((s: any) => (s.key || '') === 'agent:main:main');
      if (main?.model) modelMap.set(main.model, { id: main.model, label: main.model });

      // Agent models
      const agentsResult = await gateway.getAgents();
      const agents = Array.isArray(agentsResult?.agents) ? agentsResult.agents : [];
      for (const agent of agents) {
        const modelId = agent?.model?.primary;
        if (modelId && !modelMap.has(modelId)) {
          modelMap.set(modelId, { id: modelId, label: modelId });
        }
      }

      if (modelMap.size > 0) {
        const fromAgents = [...modelMap.values()];
        console.log('[Models] Loaded from agents/sessions:', fromAgents.length);
        await applyModels(fromAgents);
        return;
      }
    } catch (e) {
      console.warn('[Models] agents.list failed:', e);
    }

    // No configured models: explicitly clear stale list so UI doesn't keep showing old models.
    setAvailableModels([]);
    console.warn('[Models] No configured models from config or gateway');
  }, [setAvailableModels, loadSessions]);

  // ── Apply theme to document root ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Request notification permission (Web Notification API) ──
  useEffect(() => { notifications.requestPermission(); }, []);

  // ── Gateway Setup ──
  useEffect(() => {
    gateway.setCallbacks({
      onMessage: (msg) => {
        const rawSk = (msg as { sessionKey?: string }).sessionKey;
        const sessionKey =
          typeof rawSk === 'string' && rawSk.trim() ? rawSk : useChatStore.getState().activeSessionKey;
        const { activeSessionKey: currentSessionKey } = useChatStore.getState();
        setIsTyping(false, sessionKey);
        addMessage(msg, sessionKey);
        if (sessionKey !== currentSessionKey) {
          incrementSessionUnread(sessionKey);
        }
        // Notify when app is minimized/background OR user is on a different page
        const isOnChat = window.location.hash === '#/chat' || window.location.hash.startsWith('#/chat?');
        if (!document.hasFocus() || !isOnChat) {
          notifications.notify({
            type: 'message',
            title: t('notifications.newMessage'),
            body: msg.content.substring(0, 120),
          });
        }
      },
      onStreamChunk: (sessionKey, messageId, content, media, runId) => {
        updateStreamingMessage(
          messageId,
          content,
          {
            ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
            ...(runId ? { runId } : {}),
            responseState: 'streaming',
          },
          sessionKey,
        );
      },
      onStreamEnd: (sessionKey, messageId, content, media, meta) => {
        finalizeStreamingMessage(
          messageId,
          content,
          {
            ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
            ...(meta?.runId ? { runId: meta.runId } : {}),
            responseState: meta?.state ?? 'final',
            ...(meta?.fileRefs ? { fileRefs: meta.fileRefs } : {}),
            ...(meta?.decisionOptions ? { decisionOptions: meta.decisionOptions } : {}),
            ...(meta?.workshopEvents ? { workshopEvents: meta.workshopEvents } : {}),
            ...(meta?.sessionEvents ? { sessionEvents: meta.sessionEvents } : {}),
          },
          sessionKey,
        );
        const { activeSessionKey: currentSessionKey, historyLoader } = useChatStore.getState();
        if (sessionKey !== currentSessionKey) {
          markSessionCompleted(sessionKey);
        }
        if (meta?.refreshHistory && historyLoader) {
          void historyLoader(sessionKey === currentSessionKey ? undefined : sessionKey, {
            force: true,
            background: sessionKey !== currentSessionKey,
          });
        }
        // Refresh session metadata (token usage, model) after a stream completes.
        void loadSessions();
        // Notify (sound + toast) when app is minimized/background OR user is on a different page
        const isOnChat = window.location.hash === '#/chat' || window.location.hash.startsWith('#/chat?');
        if (!document.hasFocus() || !isOnChat) {
          notifications.notify({
            type: 'task_complete',
            title: t('notifications.replyComplete'),
            body: content.substring(0, 120),
          });
        }
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status.connected) {
          // Successfully connected — dismiss pairing screen if showing
          if (needsPairing) {
            setNeedsPairing(false);
            pairingTriggeredRef.current = false;
          }
          void (async () => {
            await loadSessions();
            await loadAvailableModels();
          })();
        }
      },
      onScopeError: (error) => {
        console.warn('[App] 🔑 Scope error — triggering pairing flow:', error);
        // Only trigger pairing once per connection attempt
        if (!pairingTriggeredRef.current) {
          pairingTriggeredRef.current = true;
          setScopeError(error);
          setNeedsPairing(true);
        }
      },
    });

    // ── Check gateway boot status (main-process gateway *process* health) ──
    // Must run before initConnection so we know whether to attempt a WS connection
    // or immediately show the recovery UI.
    let gatewayStatusUnsub: (() => void) | undefined;
    if (window.aegis?.gateway) {
      // Subscribe to real-time status events from the main process (retry / recovery)
      gatewayStatusUnsub = window.aegis.gateway.onStatusChanged((status) => {
        if (status.logs) setGatewayBootLogs(status.logs);
        if (status.retrying) {
          setGatewayRetrying(true);
          setConnectionStatus({ connected: false, connecting: true });
          return;
        }
        setGatewayRetrying(false);
        if (status.error) {
          setGatewayBootError(status.error);
          if (status.logs) setGatewayBootLogs(status.logs);
          setConnectionStatus({ connected: false, connecting: false, error: status.error });
          return;
        }

        // Gate first WS connect until the gateway process is fully ready.
        // This avoids startup-time connection churn while the process is still booting.
        if (status.running && status.ready) {
          // Gateway recovered — clear error and reconnect
          setGatewayBootError(null);
          setGatewayBootLogs(undefined);
          // Clear any stale "disconnected" status while transitioning to actual WS connect.
          setConnectionStatus({ connected: false, connecting: true });
          initConnection();
        } else {
          // Gateway process is still booting: surface as "connecting" instead of
          // a misleading disconnected error on the main chat screen.
          setConnectionStatus({ connected: false, connecting: true });
        }
      });

      // Initial status check (catches errors that happened before the renderer mounted)
      void window.aegis.gateway.getStatus().then((status) => {
        if (status.logs) setGatewayBootLogs(status.logs);
        if (status.error) {
          setGatewayBootError(status.error);
          setGatewayBootLogs(status.logs);
          setConnectionStatus({ connected: false, connecting: false, error: status.error });
          return; // Don't attempt WS connection when gateway process is down
        }
        if (status.running && status.ready) {
          setConnectionStatus({ connected: false, connecting: true });
          initConnection();
        } else {
          setConnectionStatus({ connected: false, connecting: true });
        }
      });
    } else {
      initConnection();
    }

    // Listen for model changes → refresh session metadata (contextTokens for new model)
    const handleModelChanged = () => void loadSessions();
    window.addEventListener('aegis:model-changed', handleModelChanged);

    // Listen for config saved (e.g. from Config Manager) → refresh available models after a short delay so gateway can restart/reload
    const handleConfigSaved = () => {
      setTimeout(() => loadAvailableModels(), 1500);
    };
    window.addEventListener('aegis:config-saved', handleConfigSaved);

    // Listen for session reset → re-fetch sessions so token counts reflect cleared state
    const handleSessionReset = () => {
      // Short delay to allow gateway to complete the reset before we poll
      setTimeout(() => void loadSessions(), 400);
    };
    window.addEventListener('aegis:session-reset', handleSessionReset);

    // Cleanup — prevent orphan WebSocket connections on remount
    return () => {
      gatewayStatusUnsub?.();
      window.removeEventListener('aegis:model-changed', handleModelChanged);
      window.removeEventListener('aegis:config-saved', handleConfigSaved);
      window.removeEventListener('aegis:session-reset', handleSessionReset);
      gateway.disconnect();
    };
  }, [loadAvailableModels]);

  const initConnection = async () => {
    const DEFAULT_URL = 'ws://127.0.0.1:18789';
    const wsStatus = gateway.getStatus();
    if (wsStatus.connected || wsStatus.connecting) return;

    // Priority: Settings Store (user override) → Electron config → fallback
    // Settings fields are empty by default — only override when user explicitly fills them
    const settings = useSettingsStore.getState();
    const userUrl = settings.gatewayUrl?.trim() || '';
    const userToken = settings.gatewayToken?.trim() || '';

    try {
      if (window.aegis?.config) {
        const config = await window.aegis.config.get();
        const configUrl = config.gatewayUrl || config.gatewayWsUrl || DEFAULT_URL;
        const configToken = config.gatewayToken || '';

        // User settings override ONLY if non-empty (otherwise use config as before)
        const wsUrl = userUrl || configUrl;
        const token = userToken || configToken;

        // Store HTTP URL for pairing flow + media resolution
        const httpUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
        setGatewayHttpUrl(httpUrl);
        localStorage.setItem('aegis-gateway-http', httpUrl);
        if (!localStorage.getItem('aegis-language') && config.installerLanguage) {
          const lang = config.installerLanguage as 'ar' | 'en';
          changeLanguage(lang);
          useSettingsStore.getState().setLanguage(lang);
        }
        gateway.connect(wsUrl, token);
      } else {
        gateway.connect(userUrl || DEFAULT_URL, userToken || '');
      }
    } catch {
      gateway.connect(userUrl || DEFAULT_URL, userToken || '');
    }
  };

  // ── Pairing Handlers ──
  const handlePairingComplete = useCallback(async (token: string) => {
    console.log('[App] 🔑 Pairing complete — reconnecting with new token');
    // Save token to config via IPC
    if (window.aegis?.pairing?.saveToken) {
      await window.aegis.pairing.saveToken(token);
    }
    // Also update config via the existing config:save IPC
    if (window.aegis?.config?.save) {
      await window.aegis.config.save({ gatewayToken: token });
    }
    // Reconnect gateway with new token
    gateway.reconnectWithToken(token);
    setNeedsPairing(false);
    pairingTriggeredRef.current = false;
  }, []);

  const handlePairingCancel = useCallback(() => {
    console.log('[App] Pairing cancelled by user');
    setNeedsPairing(false);
    pairingTriggeredRef.current = false;
    // Stop gateway pairing retry loop — user chose to dismiss
    gateway.stopPairingRetry();
  }, []);

  const handleGatewayRetry = useCallback(() => {
    if (!window.aegis?.gateway?.retry) return;
    setGatewayRetrying(true);
    void window.aegis.gateway.retry();
  }, []);

  const handleGatewayRecovered = useCallback(() => {
    setGatewayBootError(null);
    setGatewayBootLogs(undefined);
    setGatewayRetrying(false);
    // Reconnect WebSocket now that the gateway process is up
    initConnection();
  }, []);

  return (
    <>
      {/* Gateway process error overlay — shown when the gateway failed to start.
          Takes priority over everything; user must recover before using the app. */}
      {gatewayBootError && (
        <GatewayErrorScreen
          error={gatewayBootError}
          logs={gatewayBootLogs}
          retrying={gatewayRetrying}
          onRetry={handleGatewayRetry}
          onRecovered={handleGatewayRecovered}
        />
      )}

      {/* Pairing overlay — shown when Gateway rejects due to missing scopes */}
      {needsPairing && !gatewayBootError && (
        <PairingScreen
          gatewayHttpUrl={gatewayHttpUrl}
          onPaired={handlePairingComplete}
          onCancel={handlePairingCancel}
          errorMessage={scopeError}
        />
      )}

      <HashRouter>
        {/* In-app toast notifications — always visible, above all routes */}
        <ToastContainer />
        <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<FeatureRoute feature="dashboard"><DashboardPage /></FeatureRoute>} />
              <Route path="/chat" element={<FeatureRoute feature="chat"><ChatPage /></FeatureRoute>} />
              <Route path="/workshop" element={<FeatureRoute feature="workshop"><WorkshopPage /></FeatureRoute>} />
              <Route path="/costs" element={<FeatureRoute feature="analytics"><FullAnalyticsPage /></FeatureRoute>} />
              <Route path="/analytics" element={<FeatureRoute feature="analytics"><FullAnalyticsPage /></FeatureRoute>} />
              <Route path="/cron" element={<FeatureRoute feature="cron"><CronMonitorPage /></FeatureRoute>} />
              <Route path="/agents" element={<FeatureRoute feature="agents"><AgentHubPage /></FeatureRoute>} />
              <Route path="/skills" element={<FeatureRoute feature="skills"><SkillsPageFull /></FeatureRoute>} />
              <Route path="/terminal" element={<FeatureRoute feature="terminal"><TerminalPage /></FeatureRoute>} />
              <Route path="/memory" element={<FeatureRoute feature="memory"><MemoryExplorerPage /></FeatureRoute>} />
              <Route path="/config" element={<FeatureRoute feature="configManager"><ConfigManagerPage /></FeatureRoute>} />
              <Route path="/sessions" element={<FeatureRoute feature="sessions"><SessionManagerPage /></FeatureRoute>} />
              <Route path="/logs" element={<FeatureRoute feature="logs"><LogsViewerPage /></FeatureRoute>} />
              <Route path="/agents/live" element={<FeatureRoute feature="liveAgents"><MultiAgentViewPage /></FeatureRoute>} />
              <Route path="/files" element={<FeatureRoute feature="files"><FileManagerPage /></FeatureRoute>} />
              <Route path="/calendar" element={<FeatureRoute feature="calendar"><CalendarPage /></FeatureRoute>} />
              <Route path="/sandbox" element={<FeatureRoute feature="sandbox"><CodeInterpreterPage /></FeatureRoute>} />
              <Route path="/tools" element={<FeatureRoute feature="tools"><McpToolsPage /></FeatureRoute>} />
              <Route path="/settings" element={<FeatureRoute feature="settings"><SettingsPageFull /></FeatureRoute>} />
            </Route>
          </Routes>
      </HashRouter>
    </>
  );
}

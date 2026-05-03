import { contextBridge, ipcRenderer } from 'electron';

// ═══════════════════════════════════════════════════════════
// OpenClaw Desktop — Preload Bridge
// ═══════════════════════════════════════════════════════════

// Read installer language from process.argv (passed via additionalArguments in main.ts)
// This works in sandbox mode — no fs/path needed
const langArg = process.argv.find(a => a.startsWith('--installer-lang='));
const installerLanguage: string | null = langArg ? langArg.split('=')[1] : null;

const api = {
  // ── Platform (sync, available immediately) ──
  platform: process.platform,

  // ── App / Runtime Versions ──
  app: {
    versions: (): Promise<{ desktop: string; openclaw: string | null }> =>
      ipcRenderer.invoke('app:versions'),
  },

  // ── Installer Language (sync, available immediately) ──
  installerLanguage,

  // ── Window Controls ──
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // ── Config ──
  config: {
    // OpenClaw Desktop settings (aegis-config.json — legacy filename)
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: any) => ipcRenderer.invoke('config:save', config),
    // OpenClaw config (clawdbot.json) management
    detect: () => ipcRenderer.invoke('config:detect'),
    read: (filePath?: string) => ipcRenderer.invoke('config:read', filePath),
    write: (filePath: string, data: object) => ipcRenderer.invoke('config:write', { path: filePath, data }),
    restart: () => ipcRenderer.invoke('config:restart'),
    // openclaw.json validation + recovery
    validateOpenclawJson: (): Promise<{ valid: boolean; path: string; exists: boolean; error?: string }> =>
      ipcRenderer.invoke('config:validate-openclaw'),
    backupAndResetOpenclaw: (): Promise<{ success: boolean; backupPath?: string | null; error?: string }> =>
      ipcRenderer.invoke('config:backup-reset-openclaw'),
  },

  // ── Gateway boot status + retry ──
  // Distinct from the WebSocket connection (gateway.ts) — this tracks whether the
  // gateway *process* started successfully at all.
  gateway: {
    getStatus: (): Promise<{
      running: boolean;
      ready?: boolean;
      error: string | null;
      logs: { stdout: string; stderr: string };
    }> => ipcRenderer.invoke('gateway:status'),

    retry: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('gateway:retry'),

    onStatusChanged: (
      cb: (status: {
        running: boolean;
        ready?: boolean;
        error: string | null;
        retrying?: boolean;
        logs?: { stdout: string; stderr: string };
      }) => void
    ) => {
      const handler = (_e: any, status: any) => cb(status);
      ipcRenderer.on('gateway:status-changed', handler);
      return () => ipcRenderer.removeListener('gateway:status-changed', handler);
    },
  },

  // ── Settings (sync to aegis-config.json) ──
  settings: {
    save: (key: string, value: any) => ipcRenderer.invoke('settings:save', key, value),
  },

  // ── Main Agent Auth Sync ──
  agentAuth: {
    syncMain: (
      entries: { provider: string; profileKey: string; apiKey: string; mode?: string }[]
    ) => ipcRenderer.invoke('agentAuth:syncMain', entries),
    rehydrateMainRuntime: () => ipcRenderer.invoke('agentAuth:rehydrateMainRuntime'),
  },

  // Gateway IPC removed — all WS communication handled by src/services/gateway.ts (renderer-side)

  // ── Screenshot ──
  memory: {
    browse: () => ipcRenderer.invoke('memory:browse'),
    readLocal: (dirPath: string) => ipcRenderer.invoke('memory:readLocal', dirPath),
  },
  screenshot: {
    capture: () => ipcRenderer.invoke('screenshot:capture'),
    getWindows: () => ipcRenderer.invoke('screenshot:windows'),
    captureWindow: (id: string) => ipcRenderer.invoke('screenshot:captureWindow', id),
    // Real capture using Screen Capture API (MediaStream)
    captureSourceStream: async (sourceId: string): Promise<string | null> => {
      try {
        const stream = await (navigator.mediaDevices as any).getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
            },
          },
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        // Wait a frame for the video to render
        await new Promise((r) => setTimeout(r, 100));
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0);
        // Cleanup
        stream.getTracks().forEach((t: any) => t.stop());
        video.remove();
        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('[Screenshot] MediaStream capture failed:', err);
        return null;
      }
    },
    // getSources via main process IPC (desktopCapturer not available in preload)
    getSources: () => ipcRenderer.invoke('screenshot:windows'),
  },

  // ── Files ──
  file: {
    openDialog: () => ipcRenderer.invoke('file:openDialog'),
    read: (path: string) => ipcRenderer.invoke('file:read', path),
    openSharedFolder: () => ipcRenderer.invoke('file:openSharedFolder'),
  },

  attachments: {
    stage: (payload: {
      sessionKey?: string;
      agentId?: string;
      files?: Array<{
        name?: string;
        mimeType?: string;
        base64?: string;
        sourcePath?: string;
        size?: number;
        isImage?: boolean;
      }>;
    }) => ipcRenderer.invoke('attachments:stage', payload),
    cleanup: (payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) =>
      ipcRenderer.invoke('attachments:cleanup', payload),
    cleanupSession: (payload?: { sessionKey?: string; agentId?: string }) =>
      ipcRenderer.invoke('attachments:cleanupSession', payload),
  },

  uploads: {
    list: (payload?: { sessionKey?: string; agentId?: string; query?: string; limit?: number; offset?: number }) =>
      ipcRenderer.invoke('uploads:list', payload),
    open: (filePath: string) => ipcRenderer.invoke('uploads:open', filePath),
    reveal: (filePath: string) => ipcRenderer.invoke('uploads:reveal', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('uploads:exists', filePath),
    read: (payload?: { path?: string }) => ipcRenderer.invoke('uploads:read', payload),
    delete: (payload?: { path?: string }) => ipcRenderer.invoke('uploads:delete', payload),
    saveAs: (payload?: { path?: string }) => ipcRenderer.invoke('uploads:saveAs', payload),
    cleanup: (payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) =>
      ipcRenderer.invoke('uploads:cleanup', payload),
    cleanupSession: (payload?: { sessionKey?: string; agentId?: string }) =>
      ipcRenderer.invoke('uploads:cleanupSession', payload),
  },

  managedFiles: {
    list: (payload?: { sessionKey?: string; agentId?: string; query?: string; kind?: 'uploads' | 'outputs' | 'voice'; limit?: number; offset?: number; syncExists?: boolean }) =>
      ipcRenderer.invoke('managedFiles:list', payload),
    open: (filePath: string) => ipcRenderer.invoke('managedFiles:open', filePath),
    reveal: (filePath: string) => ipcRenderer.invoke('managedFiles:reveal', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('managedFiles:exists', filePath),
    read: (payload?: { path?: string }) => ipcRenderer.invoke('managedFiles:read', payload),
    delete: (payload?: { path?: string }) => ipcRenderer.invoke('managedFiles:delete', payload),
    removeRef: (payload?: { path?: string; kind?: 'uploads' | 'outputs' | 'voice' }) =>
      ipcRenderer.invoke('managedFiles:removeRef', payload),
    saveAs: (payload?: { path?: string }) => ipcRenderer.invoke('managedFiles:saveAs', payload),
    captureOutputs: (payload?: { sessionKey?: string; agentId?: string; text?: string; runId?: string | null }) =>
      ipcRenderer.invoke('managedFiles:captureOutputs', payload),
    cleanupSessionRefs: (payload?: { sessionKey?: string; agentId?: string; kind?: 'uploads' | 'outputs' | 'voice' }) =>
      ipcRenderer.invoke('managedFiles:cleanupSessionRefs', payload),
  },

  // ── Voice ──
  voice: {
    save: (filename: string, base64: string, sessionKey?: string, agentId?: string) =>
      ipcRenderer.invoke('voice:save', filename, base64, sessionKey, agentId),
    read: (filePath: string) =>
      ipcRenderer.invoke('voice:read', filePath),
    cleanupSession: (payload?: { sessionKey?: string; agentId?: string }) =>
      ipcRenderer.invoke('voice:cleanupSession', payload),
    cleanupExpired: (payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) =>
      ipcRenderer.invoke('voice:cleanupExpired', payload),
  },

  // ── Pairing (Auto-Pair with Gateway) ──
  pairing: {
    getToken: () => ipcRenderer.invoke('pairing:get-token'),
    saveToken: (token: string) => ipcRenderer.invoke('pairing:save-token', token),
    requestPairing: (httpBaseUrl: string) => ipcRenderer.invoke('pairing:request', httpBaseUrl),
    poll: (httpBaseUrl: string, deviceId: string) => ipcRenderer.invoke('pairing:poll', httpBaseUrl, deviceId),
  },

  // ── Artifacts Preview ──
  artifact: {
    open: (data: { type: string; title: string; content: string }) =>
      ipcRenderer.invoke('artifact:open', data),
  },

  // ── Image Save ──
  image: {
    save: (src: string, suggestedName: string) =>
      ipcRenderer.invoke('image:save', src, suggestedName),
  },

  // ── Integrated Terminal (PTY) ──
  terminal: {
    create: (opts?: { cols?: number; rows?: number; cwd?: string }) =>
      ipcRenderer.invoke('pty:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) =>
      ipcRenderer.invoke('pty:kill', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_e: any, id: string, data: string) => callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => { ipcRenderer.removeListener('pty:data', handler); };
    },
    onExit: (callback: (id: string, exitCode: number, signal?: number) => void) => {
      const handler = (_e: any, id: string, exitCode: number, signal?: number) => callback(id, exitCode, signal);
      ipcRenderer.on('pty:exit', handler);
      return () => { ipcRenderer.removeListener('pty:exit', handler); };
    },
  },

  // ── Auto-Update ──
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: (info: any) => void) => {
      const handler = (_e: any, info: any) => cb(info);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    onUpToDate: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on('update:up-to-date', handler);
      return () => ipcRenderer.removeListener('update:up-to-date', handler);
    },
    onProgress: (cb: (progress: any) => void) => {
      const handler = (_e: any, p: any) => cb(p);
      ipcRenderer.on('update:progress', handler);
      return () => ipcRenderer.removeListener('update:progress', handler);
    },
    onDownloaded: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on('update:downloaded', handler);
      return () => ipcRenderer.removeListener('update:downloaded', handler);
    },
    onError: (cb: (msg: string) => void) => {
      const handler = (_e: any, msg: string) => cb(msg);
      ipcRenderer.on('update:error', handler);
      return () => ipcRenderer.removeListener('update:error', handler);
    },
  },

  // ── Native Notifications ──
  notify: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', title, body),

  // ── Secrets ──
  secrets: {
    audit: () => ipcRenderer.invoke('secrets:audit'),
    reload: () => ipcRenderer.invoke('secrets:reload'),
  },

  // ── Device Identity (Ed25519 for Gateway auth) ──
  device: {
    getIdentity: () => ipcRenderer.invoke('device:getIdentity'),
    sign: (params: {
      nonce?: string;
      clientId: string;
      clientMode: string;
      role: string;
      scopes: string[];
      token: string;
    }) => ipcRenderer.invoke('device:sign', params),
  },

  // ── Console UI (Gateway Web UI in a new window) ──
  consoleUi: {
    open: (url?: string) => ipcRenderer.invoke('consoleUi:open', url),
  },

  // ── Logs ──
  logs: {
    openGatewayLogFile: () => ipcRenderer.invoke('logs:openGatewayLogFile'),
    openDesktopLogFile: () => ipcRenderer.invoke('logs:openDesktopLogFile'),
    openElectronLogFile: () => ipcRenderer.invoke('logs:openElectronLogFile'),
  },

  // ── Skills: local import + delete ──
  skills: {
    listManaged: (): Promise<{ success: boolean; skills: Array<{ dirName: string; slug: string; name: string; description: string; version: string; path: string }>; error?: string }> =>
      ipcRenderer.invoke('skills:listManaged'),
    importFolder: (): Promise<{ success: boolean; skillName?: string; path?: string; error?: string }> =>
      ipcRenderer.invoke('skills:importFolder'),
    importZip: (): Promise<{ success: boolean; skillName?: string; path?: string; error?: string }> =>
      ipcRenderer.invoke('skills:importZip'),
    delete: (skillKey: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('skills:delete', skillKey),
  },

  // ── SkillsHub (Tencent CN mirror): CLI check + install ──
  skillshub: {
    check: (): Promise<{ installed: boolean; path: string | null }> =>
      ipcRenderer.invoke('skills:skillshub:check'),
    install: (slug: string): Promise<{ success: boolean; error?: string; needsSetup?: boolean }> =>
      ipcRenderer.invoke('skills:skillshub:install', slug),
    installCli: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('skills:skillshub:installCli'),
  },

  clawhub: {
    openLogin: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('clawhub:openLogin'),
    loginCli: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('clawhub:loginCli'),
    authStatus: (): Promise<{ available: boolean; loggedIn: boolean; source: 'clawhub' | 'npx' | null; displayName: string | null; error: string | null }> =>
      ipcRenderer.invoke('clawhub:authStatus'),
    searchCli: (query: string, limit = 30): Promise<{ success: boolean; error?: string | null; items: Array<{ slug: string; name: string; score: number | null }> }> =>
      ipcRenderer.invoke('clawhub:searchCli', { query, limit }),
    fetchJson: (url: string): Promise<{ ok: boolean; status: number; retryAfter: string | null; data?: any }> =>
      ipcRenderer.invoke('clawhub:fetchJson', { url }),
    install: (slug: string): Promise<{ success: boolean; error?: string; needsLogin?: boolean; authStatus?: { available: boolean; loggedIn: boolean; source: 'clawhub' | 'npx' | null; displayName: string | null; error: string | null } }> =>
      ipcRenderer.invoke('skills:clawhub:install', slug),
  },
};

contextBridge.exposeInMainWorld('aegis', api);

// Type declaration for renderer
export type AegisAPI = typeof api;

// OpenClaw Desktop — Global Type Declarations

interface AegisAPI {
  platform: string;
  app: {
    versions: () => Promise<{ desktop: string; openclaw: string | null }>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  config: {
    // OpenClaw Desktop app settings (aegis-config.json)
    get: () => Promise<any>;
    save: (config: any) => Promise<{ success: boolean }>;
    // OpenClaw config (clawdbot.json) management
    detect: () => Promise<{ path: string; exists: boolean }>;
    read: (path?: string) => Promise<{ data: any; path: string }>;
    write: (path: string, data: any) => Promise<{ success: boolean; backupPath?: string; error?: string }>;
    restart: () => Promise<{
      success: boolean;
      error?: string;
      method?: 'node-manager' | 'gateway-restart';
      requiresAppRestart?: boolean;
      changedPaths?: string[];
    }>;
    // openclaw.json validation + recovery
    validateOpenclawJson: () => Promise<{ valid: boolean; path: string; exists: boolean; error?: string }>;
    backupAndResetOpenclaw: () => Promise<{ success: boolean; backupPath?: string | null; error?: string }>;
  };
  // Gateway boot status (process-level, distinct from WebSocket connection)
  gateway?: {
    getStatus: () => Promise<{
      running: boolean;
      ready?: boolean;
      error: string | null;
      logs: { stdout: string; stderr: string };
    }>;
    retry: () => Promise<{ success: boolean; error?: string }>;
    onStatusChanged: (cb: (status: {
      running: boolean;
      ready?: boolean;
      error: string | null;
      retrying?: boolean;
      logs?: { stdout: string; stderr: string };
    }) => void) => () => void;
  };
  settings?: {
    save: (key: string, value: any) => Promise<{ success: boolean }>;
  };
  agentAuth?: {
    syncMain: (
      entries: { provider: string; profileKey: string; apiKey: string; mode?: string }[]
    ) => Promise<{ success: boolean; error?: string }>;
    rehydrateMainRuntime: () => Promise<{ success: boolean; error?: string }>;
  };
  // Gateway IPC removed — all WS handled by src/services/gateway.ts
  artifact: {
    open: (data: { type: string; title: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  };
  device: {
    getIdentity: () => Promise<{ deviceId: string; publicKey: string }>;
    sign: (params: {
      nonce?: string;
      clientId: string;
      clientMode: string;
      role: string;
      scopes: string[];
      token: string;
    }) => Promise<{
      deviceId: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce?: string;
    }>;
  };
  image: {
    save: (src: string, suggestedName: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
  };
  screenshot: {
    capture: () => Promise<{ success: boolean; data?: string; error?: string }>;
    getWindows: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
    captureWindow: (id: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    captureSourceStream?: (sourceId: string) => Promise<string | null>;
    getSources?: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
  };
  file: {
    openDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    read: (path: string) => Promise<{
      name: string;
      path: string;
      base64: string;
      mimeType: string;
      isImage: boolean;
      size: number;
    } | null>;
    openSharedFolder: () => Promise<void>;
  };
  managedFiles?: {
    open: (filePath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    reveal: (filePath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    exists: (filePath: string) => Promise<{ success: boolean; exists: boolean; path?: string; error?: string }>;
    list: (payload?: {
      sessionKey?: string;
      agentId?: string;
      query?: string;
      kind?: 'uploads' | 'outputs' | 'voice';
      limit?: number;
      offset?: number;
      syncExists?: boolean;
    }) => Promise<{
      success: boolean;
      error?: string;
      total: number;
      root: string;
      rows: Array<{
        name: string;
        path: string;
        size: number;
        modified: string;
        ext: string;
        mimeType: string;
        kind: string;
        content: string;
        exists?: boolean;
        sessionKey?: string;
        agentId?: string;
        workspaceRoot?: string;
        relativePath?: string;
        isCanonicalOutput?: boolean;
        visibility?: 'user-output' | 'noncanonical-output' | 'internal';
      }>;
    }>;
    delete: (payload?: { path?: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
    removeRef?: (payload?: { path?: string; kind?: 'uploads' | 'outputs' | 'voice' }) => Promise<{ success: boolean; path?: string; error?: string }>;
    saveAs?: (payload?: { path?: string }) => Promise<{ success: boolean; canceled?: boolean; error?: string; path?: string; sourcePath?: string }>;
    captureOutputs?: (payload?: { sessionKey?: string; agentId?: string; text?: string; runId?: string | null }) => Promise<{
      success: boolean;
      error?: string;
      refs: Array<{
        path?: string;
        originalPath?: string;
        managedPath?: string;
        sessionKey?: string;
        agentId?: string;
        createdAt?: string;
        kind?: string;
        mimeType?: string;
        size?: number;
        workspaceRoot?: string;
        relativePath?: string;
        isCanonicalOutput?: boolean;
        visibility?: 'user-output' | 'noncanonical-output' | 'internal';
      }>;
    }>;
    read?: (payload?: { path?: string }) => Promise<{ success: boolean; data?: string; mimeType?: string; error?: string; size?: number }>;
    cleanupSessionRefs?: (payload?: { sessionKey?: string; agentId?: string; kind?: 'uploads' | 'outputs' | 'voice' }) => Promise<
      | { success: true; removed: boolean; sessionKey: string }
      | { success: false; error?: string; removed: boolean; sessionKey: string }
    >;
  };
  attachments?: {
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
    }) => Promise<
      | {
          success: true;
          staged: Array<{
            name: string;
            path: string;
            mimeType: string;
            size: number;
            isImage: boolean;
            marker: string;
          }>;
        }
      | { success: false; error?: string; staged: [] }
    >;
    cleanup: (payload?: {
      ttlMs?: number;
      maxTotalBytes?: number;
      dryRun?: boolean;
    }) => Promise<
      | {
          success: true;
          removedFiles: number;
          removedBytes: number;
          scannedFiles: number;
          totalBytes: number;
          root: string;
          wouldRemoveFiles: number;
          wouldRemoveBytes: number;
        }
      | { success: false; error?: string }
    >;
    cleanupSession: (payload?: {
      sessionKey?: string;
      agentId?: string;
    }) => Promise<
      | { success: true; removed: boolean; sessionKey: string }
      | { success: false; error?: string; removed: boolean; sessionKey: string }
    >;
  };
  uploads?: {
    list: (payload?: {
      sessionKey?: string;
      agentId?: string;
      query?: string;
      limit?: number;
      offset?: number;
    }) => Promise<
      | {
          success: true;
          rows: Array<{
            path: string;
            name: string;
            size: number;
            modified: string;
            ext: string;
            mimeType: string;
            kind: 'uploads';
            exists: boolean;
            sessionKey?: string;
            agentId?: string;
            content?: string;
          }>;
          total: number;
          root: string;
        }
      | { success: false; error?: string; rows?: any[]; total?: number }
    >;
    open: (filePath: string) => Promise<{ success: boolean; error?: string; path?: string }>;
    reveal: (filePath: string) => Promise<{ success: boolean; error?: string; path?: string }>;
    exists: (filePath: string) => Promise<{ success: boolean; exists: boolean; error?: string; path?: string }>;
    read: (payload?: { path?: string }) => Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }>;
    delete: (payload?: { path?: string }) => Promise<{ success: boolean; error?: string; path?: string }>;
    saveAs: (payload?: { path?: string }) => Promise<{ success: boolean; canceled?: boolean; error?: string; path?: string; sourcePath?: string }>;
    cleanup: (payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) => Promise<
      | ({ success: true } & {
          removedFiles: number;
          removedBytes: number;
          scannedFiles: number;
          totalBytes: number;
          root: string;
          wouldRemoveFiles: number;
          wouldRemoveBytes: number;
        })
      | { success: false; error?: string }
    >;
    cleanupSession: (payload?: { sessionKey?: string; agentId?: string }) => Promise<
      | { success: true; removed: boolean; sessionKey: string }
      | { success: false; error?: string; removed: boolean; sessionKey: string }
    >;
  };
  voice: {
    save: (filename: string, base64: string, sessionKey?: string, agentId?: string) => Promise<string | null>;
    read: (filePath: string) => Promise<string | null>;
    cleanupSession?: (payload?: { sessionKey?: string; agentId?: string }) => Promise<
      | { success: true; removed: boolean; sessionKey: string }
      | { success: false; error?: string; removed: boolean; sessionKey: string }
    >;
    cleanupExpired?: (payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) => Promise<
      | ({ success: true } & {
          removedFiles: number;
          removedBytes: number;
          scannedFiles: number;
          totalBytes: number;
          root: string;
          wouldRemoveFiles: number;
          wouldRemoveBytes: number;
        })
      | { success: false; error?: string }
    >;
  };
  calendar?: {
    getEvents: () => Promise<any[]>;
    addEvent: (event: any) => Promise<{ success: boolean; id?: string }>;
    updateEvent: (id: string, updates: any) => Promise<{ success: boolean }>;
    deleteEvent: (id: string) => Promise<{ success: boolean }>;
  };
  memory: {
    browse: () => Promise<string | null>;
    readLocal: (dirPath: string) => Promise<{ success: boolean; files: any[]; error?: string }>;
  };
  pairing: {
    getToken: () => Promise<string | null>;
    saveToken: (token: string) => Promise<{ success: boolean }>;
    requestPairing: (httpBaseUrl: string) => Promise<{ code: string; deviceId: string }>;
    poll: (httpBaseUrl: string, deviceId: string) => Promise<{ status: string; token?: string }>;
  };
  terminal: {
    create: (opts?: { cols?: number; rows?: number; cwd?: string }) => Promise<{ id: string; pid: number; error?: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (callback: (id: string, data: string) => void) => () => void;
    onExit: (callback: (id: string, exitCode: number, signal?: number) => void) => () => void;
  };
  secrets: {
    audit: () => Promise<{ success: boolean; data?: SecretsAuditResult; error?: string }>;
    reload: () => Promise<{ success: boolean; error?: string }>;
  };
  notify: (title: string, body: string) => Promise<void>;
  // Console UI — open Gateway web interface in a dedicated window
  consoleUi?: {
    open: (url?: string) => Promise<{ success: boolean; error?: string }>;
  };
  // Logs — open Electron log file in system viewer
  logs?: {
    openGatewayLogFile?: () => Promise<{ success: boolean; path?: string; error?: string }>;
    openDesktopLogFile?: () => Promise<{ success: boolean; path?: string; error?: string }>;
    openElectronLogFile: () => Promise<{ success: boolean; path?: string; error?: string }>;
  };
  // Skills — local skill import + delete
  skills?: {
    listManaged: () => Promise<{ success: boolean; skills: Array<{ dirName: string; slug: string; name: string; description: string; version: string; path: string }>; error?: string }>;
    importFolder: () => Promise<{ success: boolean; skillName?: string; path?: string; error?: string }>;
    importZip: () => Promise<{ success: boolean; skillName?: string; path?: string; error?: string }>;
    delete: (skillKey: string) => Promise<{ success: boolean; error?: string }>;
  };
  // SkillsHub — Tencent CN mirror CLI integration
  skillshub?: {
    check: () => Promise<{ installed: boolean; path: string | null }>;
    install: (slug: string) => Promise<{ success: boolean; error?: string; needsSetup?: boolean }>;
    installCli: () => Promise<{ success: boolean; error?: string }>;
  };
  clawhub?: {
    openLogin: () => Promise<{ success: boolean; error?: string }>;
    loginCli: () => Promise<{ success: boolean; error?: string }>;
    authStatus: () => Promise<{ available: boolean; loggedIn: boolean; source: 'clawhub' | 'npx' | null; displayName: string | null; error: string | null }>;
    searchCli: (query: string, limit?: number) => Promise<{ success: boolean; error?: string | null; items: Array<{ slug: string; name: string; score: number | null }> }>;
    fetchJson: (url: string) => Promise<{ ok: boolean; status: number; retryAfter: string | null; data?: any }>;
    install: (slug: string) => Promise<{ success: boolean; error?: string; needsLogin?: boolean; authStatus?: { available: boolean; loggedIn: boolean; source: 'clawhub' | 'npx' | null; displayName: string | null; error: string | null } }>;
  };
  update: {
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<void>;
    onAvailable: (cb: (info: any) => void) => () => void;
    onUpToDate: (cb: () => void) => () => void;
    onProgress: (cb: (progress: any) => void) => () => void;
    onDownloaded: (cb: () => void) => () => void;
    onError: (cb: (msg: string) => void) => () => void;
  };
  /**
   * Optional product/edition override (e.g. white-label build or preload-injected config).
   * Merged with defaults in `src/config/edition.ts` at startup.
   */
  edition?: import('@/config/edition').EditionConfigPatch;
}

declare global {
  interface Window {
    aegis: AegisAPI;
  }

  interface SecretsAuditResult {
    status: 'clean' | 'findings' | 'unresolved' | 'unknown';
    rawOutput: string;
    exitCode: number;
  }
}

export {};

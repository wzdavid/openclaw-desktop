/**
 * Cleans on-disk conversation temp files under the desktop shared folder:
 * - `<shared>/voice/` (voice recordings from the gateway)
 * - `<shared>/.openclaw-desktop/uploads/` (session-staged uploads; optional)
 *
 * Mirrors the TTL + total-size budget behavior used in RCESBot's managed-files cleanup,
 * without depending on workspace output indexing.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const UPLOAD_METADATA_SUFFIX = '.openclaw-desktop-upload.json';

type WorkspaceEntry = { agentId: string; workspaceRoot: string };

function getOpenClawHomeDir(): string {
  return path.join(os.homedir(), '.openclaw');
}

function expandHome(value: string): string {
  return value.replace(/^~(?=\/|\\)/, os.homedir());
}

function getWorkspaceEntries(): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  const addEntry = (agentId: string, workspaceRoot: string) => {
    const normalizedAgent = sanitizeAgentId(agentId);
    const root = path.resolve(expandHome(String(workspaceRoot || '').trim()));
    if (!root) return;
    if (entries.some((item) => item.agentId === normalizedAgent && item.workspaceRoot === root)) return;
    entries.push({ agentId: normalizedAgent, workspaceRoot: root });
  };

  const home = getOpenClawHomeDir();
  const defaultWorkspace = path.join(home, 'workspace');
  addEntry('main', defaultWorkspace);

  try {
    const configPath = path.join(home, 'openclaw.json');
    if (!fs.existsSync(configPath)) return entries;
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const defaultsWorkspace = String(parsed?.agents?.defaults?.workspace || '').trim();
    if (defaultsWorkspace) {
      addEntry('main', defaultsWorkspace);
    }
    const agents = Array.isArray(parsed?.agents?.list) ? parsed.agents.list : [];
    for (const item of agents) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as any).id || '').trim();
      if (!id) continue;
      const workspace = String((item as any).workspace || '').trim();
      if (workspace) {
        addEntry(id, workspace);
      } else if (defaultsWorkspace) {
        const isDefault = Boolean((item as any).default);
        addEntry(id, isDefault ? defaultsWorkspace : path.join(defaultsWorkspace, id));
      } else {
        addEntry(id, path.join(defaultWorkspace, id));
      }
    }
  } catch {
    // best-effort: keep fallback entries only
  }

  return entries;
}

function resolveWorkspaceForAgent(agentId: string): string {
  const safeAgent = sanitizeAgentId(agentId);
  const entries = getWorkspaceEntries();
  const direct = entries.find((item) => item.agentId === safeAgent);
  if (direct) return direct.workspaceRoot;
  const main = entries.find((item) => item.agentId === 'main');
  if (safeAgent === 'main' || !main) return path.join(getOpenClawHomeDir(), 'workspace');
  return path.join(main.workspaceRoot, safeAgent);
}

export type ConversationCleanupResult = {
  removedFiles: number;
  removedBytes: number;
  scannedFiles: number;
  totalBytes: number;
  root: string;
  wouldRemoveFiles: number;
  wouldRemoveBytes: number;
};

function isUploadMetadataFile(filePath: string): boolean {
  return path.basename(filePath).endsWith(UPLOAD_METADATA_SUFFIX);
}

function deleteUploadMetadataIfExists(filePath: string): void {
  const metaPath = `${filePath}${UPLOAD_METADATA_SUFFIX}`;
  if (!fs.existsSync(metaPath)) return;
  try {
    fs.unlinkSync(metaPath);
  } catch {
    /* best-effort */
  }
}

function collectManagedDirs(sharedRoot: string): string[] {
  const dirs = new Set<string>();
  for (const entry of getWorkspaceEntries()) {
    dirs.add(path.join(entry.workspaceRoot, 'voice'));
    dirs.add(path.join(entry.workspaceRoot, 'uploads'));
  }
  return Array.from(dirs).filter((d) => fs.existsSync(d));
}

function cleanupTempForRoots(
  sharedRoot: string,
  managedRoots: string[],
  opts?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean },
): ConversationCleanupResult {
  const ttlMs =
    typeof opts?.ttlMs === 'number' && opts.ttlMs > 0 ? opts.ttlMs : 7 * 24 * 60 * 60 * 1000;
  const maxTotalBytes =
    typeof opts?.maxTotalBytes === 'number' && opts.maxTotalBytes > 0
      ? opts.maxTotalBytes
      : 2 * 1024 * 1024 * 1024;
  const dryRun = opts?.dryRun === true;

  if (managedRoots.length === 0) {
    return {
      removedFiles: 0,
      removedBytes: 0,
      scannedFiles: 0,
      totalBytes: 0,
      root: path.normalize(sharedRoot),
      wouldRemoveFiles: 0,
      wouldRemoveBytes: 0,
    };
  }

  const files: Array<{ path: string; size: number; mtimeMs: number }> = [];
  const dirs: string[] = [];

  const walk = (dirPath: string) => {
    dirs.push(dirPath);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (isUploadMetadataFile(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        files.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  };

  for (const managedDir of managedRoots) {
    walk(managedDir);
  }

  const uploadsRoot = path.join(sharedRoot, '.openclaw-desktop', 'uploads');

  let removedFiles = 0;
  let removedBytes = 0;
  let wouldRemoveFiles = 0;
  let wouldRemoveBytes = 0;
  const nowMs = Date.now();

  for (const file of files) {
    if (nowMs - file.mtimeMs > ttlMs) {
      wouldRemoveFiles += 1;
      wouldRemoveBytes += file.size;
      if (dryRun) continue;
      try {
        fs.unlinkSync(file.path);
        if (file.path.startsWith(uploadsRoot)) {
          deleteUploadMetadataIfExists(file.path);
        }
        removedFiles += 1;
        removedBytes += file.size;
      } catch {
        /* ignore per-file failures */
      }
    }
  }

  const remaining = files
    .filter((file) => fs.existsSync(file.path))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalBytes = remaining.reduce((acc, file) => acc + file.size, 0);

  for (const file of remaining) {
    if (totalBytes <= maxTotalBytes) break;
    wouldRemoveFiles += 1;
    wouldRemoveBytes += file.size;
    if (dryRun) {
      totalBytes -= file.size;
      continue;
    }
    try {
      fs.unlinkSync(file.path);
      if (file.path.startsWith(uploadsRoot)) {
        deleteUploadMetadataIfExists(file.path);
      }
      removedFiles += 1;
      removedBytes += file.size;
      totalBytes -= file.size;
    } catch {
      /* ignore */
    }
  }

  if (!dryRun) {
    dirs
      .sort((a, b) => b.length - a.length)
      .forEach((dirPath) => {
        if (managedRoots.includes(dirPath)) return;
        try {
          const left = fs.readdirSync(dirPath);
          if (left.length === 0) fs.rmdirSync(dirPath);
        } catch {
          /* ignore */
        }
      });
  }

  return {
    removedFiles,
    removedBytes,
    scannedFiles: files.length,
    totalBytes,
    root: path.normalize(sharedRoot),
    wouldRemoveFiles,
    wouldRemoveBytes,
  };
}

export function cleanupConversationAttachmentTemp(
  sharedRoot: string,
  opts?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean },
): ConversationCleanupResult {
  return cleanupTempForRoots(sharedRoot, collectManagedDirs(sharedRoot), opts);
}

export function cleanupUploadsTemp(
  sharedRoot: string,
  opts?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean },
): ConversationCleanupResult {
  const roots = Array.from(new Set(getWorkspaceEntries().map((entry) => path.join(entry.workspaceRoot, 'uploads'))))
    .filter((dir) => fs.existsSync(dir));
  return cleanupTempForRoots(sharedRoot, roots, opts);
}

export function cleanupVoiceTemp(
  sharedRoot: string,
  opts?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean },
): ConversationCleanupResult {
  const roots = Array.from(new Set(getWorkspaceEntries().map((entry) => path.join(entry.workspaceRoot, 'voice'))))
    .filter((dir) => fs.existsSync(dir));
  return cleanupTempForRoots(sharedRoot, roots, opts);
}

export function sanitizeAttachmentSessionKey(sessionKey?: string | null): string {
  return (
    String(sessionKey || 'default')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120) || 'default'
  );
}

export function sanitizeAgentId(agentId?: string | null): string {
  return (
    String(agentId || 'main')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80) || 'main'
  );
}

export function parseAgentIdFromSessionKey(sessionKey?: string | null): string {
  if (!sessionKey) return 'main';
  const match = String(sessionKey).match(/^agent:([^:]+):/);
  return match?.[1] || 'main';
}

let lastAttachmentBackgroundCleanupMs = 0;

/** Best-effort periodic cleanup (same policy as Settings → clean), throttled to every 5 minutes. */
export function maybeRunAttachmentBackgroundCleanup(sharedRoot: string): void {
  const now = Date.now();
  if (now - lastAttachmentBackgroundCleanupMs < 5 * 60 * 1000) return;
  lastAttachmentBackgroundCleanupMs = now;
  try {
    cleanupConversationAttachmentTemp(sharedRoot, {});
  } catch {
    /* ignore */
  }
}

export function getDateBucket(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function sanitizeManagedUploadFilename(rawName: string, fallbackExt = ''): string {
  const normalized = path
    .basename(String(rawName || 'file'))
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const parsed = path.parse(normalized || 'file');
  let base = (parsed.name || 'file').replace(/[. ]+$/g, '').trim();
  if (!base || base === '.' || base === '..') {
    base = 'file';
  }
  let ext = parsed.ext;
  if (!ext && fallbackExt) {
    ext = fallbackExt;
  }
  if (ext) {
    ext = ext
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[<>:"/\\|?*\s]/g, '');
    if (!ext.startsWith('.')) {
      ext = `.${ext.replace(/^\.+/, '')}`;
    }
  }
  return `${base}${ext || ''}`;
}

function writeUploadMetadata(filePath: string, originalName: string): void {
  const safeOriginalName = sanitizeManagedUploadFilename(originalName);
  if (!safeOriginalName) return;
  const metaPath = `${filePath}${UPLOAD_METADATA_SUFFIX}`;
  fs.writeFileSync(metaPath, JSON.stringify({ originalName: safeOriginalName }) + '\n', 'utf8');
}

export type StagedAttachment = {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  marker: string;
};

export type StageAttachmentsPayload = {
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
};

export function stageConversationAttachments(
  _sharedRoot: string,
  payload?: StageAttachmentsPayload,
): { success: true; staged: StagedAttachment[] } | { success: false; error: string; staged: StagedAttachment[] } {
  try {
    const safeAgentId = sanitizeAgentId(payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey));
    const workspaceRoot = resolveWorkspaceForAgent(safeAgentId);
    maybeRunAttachmentBackgroundCleanup(workspaceRoot);

    const extFromMime = (mimeType: string): string => {
      const table: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'text/markdown': '.md',
        'text/csv': '.csv',
        'application/json': '.json',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/mp4': '.m4a',
        'video/mp4': '.mp4',
      };
      return table[mimeType] || '';
    };

    const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
    const day = getDateBucket();
    const inboxDir = path.join(
      workspaceRoot,
      'uploads',
      safeSessionKey,
      day,
    );
    fs.mkdirSync(inboxDir, { recursive: true });

    const rows = Array.isArray(payload?.files) ? payload.files : [];
    if (rows.length === 0) {
      return { success: true, staged: [] };
    }

    const staged: StagedAttachment[] = rows.map((file, idx) => {
      const sourcePath = typeof file?.sourcePath === 'string' ? file.sourcePath.trim() : '';
      const sourceName = sourcePath ? path.basename(sourcePath) : '';
      const rawName = String(file?.name || sourceName || `file-${Date.now()}-${idx}`);
      const normalizedMime = String(file?.mimeType || '').trim().toLowerCase();
      const safeBaseName = sanitizeManagedUploadFilename(rawName);
      const hasExt = path.extname(safeBaseName).length > 0;
      const fallbackExt = !hasExt ? extFromMime(normalizedMime) : '';
      const finalName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeManagedUploadFilename(safeBaseName, fallbackExt)}`;
      const absolutePath = path.join(inboxDir, finalName);

      if (sourcePath) {
        fs.copyFileSync(sourcePath, absolutePath);
      } else {
        const base64 = String(file?.base64 || '');
        if (!base64) {
          throw new Error(`attachment missing content: ${rawName}`);
        }
        fs.writeFileSync(absolutePath, Buffer.from(base64, 'base64'));
      }

      writeUploadMetadata(absolutePath, rawName);

      const stat = fs.statSync(absolutePath);
      const isImage =
        typeof file?.isImage === 'boolean' ? file.isImage : normalizedMime.startsWith('image/');
      const marker = isImage
        ? `[media attached: ${absolutePath}]`
        : `[file attached: ${absolutePath}]`;
      return {
        name: rawName,
        path: absolutePath,
        mimeType: normalizedMime || 'application/octet-stream',
        size: stat.size,
        isImage,
        marker,
      };
    });

    return { success: true, staged };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error), staged: [] };
  }
}

export function cleanupSessionAttachmentStaging(
  _sharedRoot: string,
  payload?: { sessionKey?: string; agentId?: string },
): { success: boolean; removed: boolean; sessionKey: string } {
  const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
  const safeAgentId = sanitizeAgentId(
    payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey),
  );
  const workspaceRoot = resolveWorkspaceForAgent(safeAgentId);
  const uploadsBase = path.join(workspaceRoot, 'uploads');
  const voiceBase = path.join(workspaceRoot, 'voice');
  let removed = false;
  const sessionDirs = [
    path.join(uploadsBase, safeSessionKey),
    path.join(voiceBase, safeSessionKey),
  ];
  for (const sessionDir of sessionDirs) {
    if (!fs.existsSync(sessionDir)) continue;
    fs.rmSync(sessionDir, { recursive: true, force: true });
    removed = true;
  }
  return { success: true, removed, sessionKey: safeSessionKey };
}

export function cleanupSessionUploadsOnly(
  _sharedRoot: string,
  payload?: { sessionKey?: string; agentId?: string },
): { success: boolean; removed: boolean; sessionKey: string } {
  const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
  const safeAgentId = sanitizeAgentId(
    payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey),
  );
  const workspaceRoot = resolveWorkspaceForAgent(safeAgentId);
  const uploadsBase = path.join(workspaceRoot, 'uploads');
  let removed = false;
  const sessionDirs = [path.join(uploadsBase, safeSessionKey)];
  for (const sessionDir of sessionDirs) {
    if (!fs.existsSync(sessionDir)) continue;
    fs.rmSync(sessionDir, { recursive: true, force: true });
    removed = true;
  }
  return { success: true, removed, sessionKey: safeSessionKey };
}

export function cleanupSessionVoiceOnly(
  _sharedRoot: string,
  payload?: { sessionKey?: string; agentId?: string },
): { success: boolean; removed: boolean; sessionKey: string } {
  const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
  const safeAgentId = sanitizeAgentId(
    payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey),
  );
  const workspaceRoot = resolveWorkspaceForAgent(safeAgentId);
  const voiceBase = path.join(workspaceRoot, 'voice');
  let removed = false;
  const sessionDirs = [path.join(voiceBase, safeSessionKey)];
  for (const sessionDir of sessionDirs) {
    if (!fs.existsSync(sessionDir)) continue;
    fs.rmSync(sessionDir, { recursive: true, force: true });
    removed = true;
  }
  return { success: true, removed, sessionKey: safeSessionKey };
}

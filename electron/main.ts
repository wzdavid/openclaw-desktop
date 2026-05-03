import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  Notification,
  Tray,
  Menu,
  nativeImage,
  shell,
  globalShortcut,
  clipboard,
} from 'electron';
import { setupUpdater } from './updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFileSync, spawnSync, execSync, ExecFileSyncOptions } from 'child_process';
import { NodeManager, OpenclawConfigValidation } from './node-manager';
import { createTray } from './tray';
import { initI18n, setLanguage, t } from './i18n';
import {
  cleanupConversationAttachmentTemp,
  cleanupSessionUploadsOnly,
  cleanupSessionVoiceOnly,
  cleanupUploadsTemp,
  cleanupSessionAttachmentStaging,
  cleanupVoiceTemp,
  stageConversationAttachments,
  sanitizeAgentId,
  sanitizeAttachmentSessionKey,
  parseAgentIdFromSessionKey,
  getDateBucket,
} from './conversation-files-cleanup';
import {
  extractOutputPathCandidates,
  normalizeCandidatePath,
} from './output-files-index';
import {
  upsertManagedFileRefs,
  listManagedFileRefs,
  removeManagedFileRefByPath,
  pruneMissingManagedFileRefs,
  type ManagedFileKind,
} from './managed-files-index';

// ── Logging setup ─────────────────────────────────────────────────────────────
// Hook electron-log early so all console.log/warn/error from main process go
// to the log file (app.getPath('logs')/main.log) as well as the terminal.
// Must be done before any other imports that may log.
import log from 'electron-log/main';
log.initialize();
// Route native console to electron-log so [Config], [Gateway], [Console], etc.
// messages appear in the log file, not only in dev terminal output.
log.transports.console.level = 'debug';
log.transports.file.level = 'info';
Object.assign(console, log.functions);
// ─────────────────────────────────────────────────────────────────────────────

const CLAWHUB_SITE_URL = 'https://clawhub.ai';
const CLAWHUB_REGISTRY_URL = 'https://clawhub.ai';
const SKILLSHUB_INSTALL_BASE_URL = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install';
const SKILLSHUB_INSTALL_SH_URL = `${SKILLSHUB_INSTALL_BASE_URL}/install.sh`;
const SKILLSHUB_INSTALL_LATEST_TAR_URL = `${SKILLSHUB_INSTALL_BASE_URL}/latest.tar.gz`;
const SKILLSHUB_CLI_INSTALL_CMD_UNIX = `curl -fsSL ${SKILLSHUB_INSTALL_SH_URL} | bash -s -- --cli-only`;
const SKILLSHUB_CLI_INSTALL_CMD_WIN_PWSH =
  `$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';` +
  `if(-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)){throw 'Python not found. Please install Python 3 first.'};` +
  `$u='${SKILLSHUB_INSTALL_LATEST_TAR_URL}';$base=Join-Path $env:USERPROFILE '.skillhub';$bin=Join-Path $env:APPDATA 'npm';$tmp=Join-Path $env:TEMP ('skillhub-'+[guid]::NewGuid().ToString('N'));` +
  `New-Item -ItemType Directory -Force -Path $tmp|Out-Null;Invoke-WebRequest -Uri $u -OutFile (Join-Path $tmp 'latest.tar.gz');` +
  `if(-not (Get-Command tar -ErrorAction SilentlyContinue)){throw 'tar command not found.'};tar -xzf (Join-Path $tmp 'latest.tar.gz') -C $tmp;` +
  `$cliDir=if(Test-Path (Join-Path $tmp 'cli/skills_store_cli.py')){Join-Path $tmp 'cli'}else{$tmp};New-Item -ItemType Directory -Force -Path $base,$bin|Out-Null;` +
  `Copy-Item (Join-Path $cliDir 'skills_store_cli.py') (Join-Path $base 'skills_store_cli.py') -Force;Copy-Item (Join-Path $cliDir 'skills_upgrade.py') (Join-Path $base 'skills_upgrade.py') -Force;` +
  `Copy-Item (Join-Path $cliDir 'version.json') (Join-Path $base 'version.json') -Force;Copy-Item (Join-Path $cliDir 'metadata.json') (Join-Path $base 'metadata.json') -Force;` +
  `if(Test-Path (Join-Path $cliDir 'skills_index.local.json')){Copy-Item (Join-Path $cliDir 'skills_index.local.json') (Join-Path $base 'skills_index.local.json') -Force;};` +
  `$cfg=Join-Path $base 'config.json';if(-not (Test-Path $cfg)){'{\"self_update_url\":\"https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/version.json\"}'|Set-Content -Encoding UTF8 -Path $cfg;};` +
  `$wrapper=@'` +
`@echo off
setlocal
if exist "%SystemRoot%\py.exe" (
  py -3 "%USERPROFILE%\.skillhub\skills_store_cli.py" %*
) else (
  python "%USERPROFILE%\.skillhub\skills_store_cli.py" %*
)
'@;` +
  `Set-Content -Encoding ASCII -Path (Join-Path $bin 'skillhub.cmd') -Value $wrapper;`;

function getOpenClawHomeDir() {
  return path.join(os.homedir(), '.openclaw');
}

function getManagedSkillsDir() {
  return path.join(getOpenClawHomeDir(), 'skills');
}

function getLegacyWorkspaceSkillsDirs() {
  const openclawHome = getOpenClawHomeDir();
  return [
    path.join(openclawHome, '.openclaw', 'workspace', 'skills'),
    path.join(openclawHome, 'workspace', 'skills'),
  ];
}

function moveSkillIntoManagedDir(skillDirName: string, candidates: Array<string | null | undefined>) {
  const managedSkillsDir = getManagedSkillsDir();
  fs.mkdirSync(managedSkillsDir, { recursive: true });
  const managedSkillPath = path.join(managedSkillsDir, skillDirName);
  if (fs.existsSync(path.join(managedSkillPath, 'SKILL.md'))) {
    return managedSkillPath;
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!fs.existsSync(path.join(candidate, 'SKILL.md'))) continue;
    if (fs.existsSync(managedSkillPath)) fs.rmSync(managedSkillPath, { recursive: true, force: true });
    try {
      fs.renameSync(candidate, managedSkillPath);
    } catch {
      fs.cpSync(candidate, managedSkillPath, { recursive: true });
      fs.rmSync(candidate, { recursive: true, force: true });
    }
    return managedSkillPath;
  }

  return null;
}

function readSkillFrontmatter(skillFilePath: string) {
  try {
    const content = fs.readFileSync(skillFilePath, 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const fields = Object.fromEntries(
      match[1]
        .split(/\r?\n/)
        .map(line => line.match(/^([A-Za-z0-9_-]+):\s*(.+)\s*$/))
        .filter((entry): entry is RegExpMatchArray => Boolean(entry))
        .map(entry => [entry[1], entry[2]])
    );
    return {
      name: typeof fields.name === 'string' ? fields.name : '',
      description: typeof fields.description === 'string' ? fields.description : '',
      version: typeof fields.version === 'string' ? fields.version : '',
    };
  } catch {
    return {};
  }
}

function listManagedSkills() {
  const skillsDir = getManagedSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dirName = entry.name;
      const skillDir = path.join(skillsDir, dirName);
      const skillFilePath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillFilePath)) return null;

      let meta: Record<string, any> = {};
      const metaPath = path.join(skillDir, '_meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {}
      }

      const frontmatter = readSkillFrontmatter(skillFilePath);
      return {
        dirName,
        slug: String(meta.slug || frontmatter.name || dirName),
        name: String(frontmatter.name || meta.slug || dirName),
        description: String(frontmatter.description || ''),
        version: String(meta.version || frontmatter.version || ''),
        path: skillDir,
      };
    })
    .filter((skill): skill is {
      dirName: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      path: string;
    } => Boolean(skill));
}

// node-pty: dynamic require — graceful fallback if native module unavailable
let pty: typeof import('node-pty') | null = null;
try {
  pty = require('node-pty');
} catch (err: any) {
  console.warn('[PTY] node-pty not available — Terminal disabled:', err.message);
}

const OPENCLAW_PORT = parseInt(process.env.OPENCLAW_PORT || '18789', 10);
const isDev = !app.isPackaged;

// Dock / About / dev `electron .` — keep visible app name aligned with packaged productName.
app.setName('OpenClaw Desktop');

// ── Resource path helper (dev vs packaged) ──
// In dev: __dirname = dist-electron/, one level up reaches project root.
// In production: use process.resourcesPath set by electron-builder.
function getResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../resources');
  return path.join(base, ...segments);
}

function getSkillHubEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const existingPath = env[pathKey] || process.env[pathKey] || '';
  const pathEntries = existingPath.split(path.delimiter).filter(Boolean);
  const pushPath = (p: string | null | undefined) => {
    if (!p) return;
    if (!pathEntries.includes(p)) pathEntries.push(p);
  };

  const nm = new NodeManager(OPENCLAW_PORT);
  const bundledPaths = nm.getBundledOpenclawPaths();
  const bundledNode = bundledPaths.node;
  if (bundledNode) pushPath(path.dirname(bundledNode));
  if (bundledPaths.node && bundledPaths.openclawMjs) {
    const wrapperBinDir = ensureOpenclawWrapper(app.getPath('userData'), bundledPaths.node, bundledPaths.openclawMjs);
    pushPath(wrapperBinDir);
  }

  if (process.platform !== 'win32') {
    pushPath(path.join(os.homedir(), '.local', 'bin'));
    pushPath('/opt/homebrew/bin');
    pushPath('/usr/local/bin');
    pushPath('/usr/bin');
    pushPath('/bin');
  } else {
    pushPath(path.join(os.homedir(), '.local', 'bin'));
    pushPath(path.join(os.homedir(), '.local', 'bin', 'windows_amd64'));
    pushPath(path.join(process.env.APPDATA || '', 'npm'));
  }

  env[pathKey] = pathEntries.join(path.delimiter);
  if (!env.OPENCLAW_HOME) {
    env.OPENCLAW_HOME = getOpenClawHomeDir();
  }
  return env;
}

function resolveSkillHubBinary(env: NodeJS.ProcessEnv): string | null {
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['skillhub'], {
    encoding: 'utf8',
    timeout: 5_000,
    env,
  });
  const firstHit = lookup.stdout
    ?.split(/\r?\n/)
    .map(s => s.trim())
    .find(Boolean);
  if (lookup.status === 0 && firstHit) return firstHit;

  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'skillhub.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'skillhub.exe'),
        path.join(os.homedir(), '.local', 'bin', 'skillhub.exe'),
        path.join(os.homedir(), '.local', 'bin', 'skillhub'),
        path.join(os.homedir(), '.local', 'bin', 'windows_amd64', 'skillhub.exe'),
        path.join(os.homedir(), '.local', 'bin', 'windows_amd64', 'skillhub'),
      ]
    : [
        path.join(os.homedir(), '.local', 'bin', 'skillhub'),
        '/opt/homebrew/bin/skillhub',
        '/usr/local/bin/skillhub',
      ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolvePythonBinary(env: NodeJS.ProcessEnv): { command: string; argsPrefix: string[] } | null {
  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', argsPrefix: ['-3'] },
        { command: 'python', argsPrefix: [] },
      ]
    : [
        { command: 'python3', argsPrefix: [] },
        { command: 'python', argsPrefix: [] },
      ];
  for (const candidate of candidates) {
    const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate.command], {
      encoding: 'utf8',
      timeout: 5_000,
      env,
    });
    const firstHit = lookup.stdout
      ?.split(/\r?\n/)
      .map(s => s.trim())
      .find(Boolean);
    if (lookup.status === 0 && firstHit) {
      return { command: firstHit, argsPrefix: candidate.argsPrefix };
    }
  }
  return null;
}

function getSkillHubCliSpec(env: NodeJS.ProcessEnv): { command: string; argsPrefix: string[] } | null {
  if (process.platform === 'win32') {
    const cliScript = path.join(os.homedir(), '.skillhub', 'skills_store_cli.py');
    if (fs.existsSync(cliScript)) {
      const python = resolvePythonBinary(env);
      if (python) {
        return {
          command: python.command,
          argsPrefix: [...python.argsPrefix, cliScript],
        };
      }
    }
  }
  const skillHubBinary = resolveSkillHubBinary(env);
  if (!skillHubBinary) return null;
  return { command: skillHubBinary, argsPrefix: [] };
}

function resolveOpenclawBinary(env: NodeJS.ProcessEnv): string | null {
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['openclaw'], {
    encoding: 'utf8',
    timeout: 5_000,
    env,
  });
  const firstHit = lookup.stdout
    ?.split(/\r?\n/)
    .map(s => s.trim())
    .find(Boolean);
  if (lookup.status === 0 && firstHit) return firstHit;

  const candidates = process.platform === 'win32'
    ? [
        path.join(app.getPath('userData'), 'bin', 'openclaw.cmd'),
      ]
    : [
        path.join(app.getPath('userData'), 'bin', 'openclaw'),
      ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolveNpxBinary(env: NodeJS.ProcessEnv): string | null {
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['npx'], {
    encoding: 'utf8',
    timeout: 5_000,
    env,
  });
  const firstHit = lookup.stdout
    ?.split(/\r?\n/)
    .map(s => s.trim())
    .find(Boolean);
  if (lookup.status === 0 && firstHit) return firstHit;

  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'npx.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'npx.exe'),
      ]
    : [
        path.join(os.homedir(), '.local', 'bin', 'npx'),
        '/opt/homebrew/bin/npx',
        '/usr/local/bin/npx',
        '/usr/bin/npx',
        '/bin/npx',
      ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolveClawHubBinary(env: NodeJS.ProcessEnv): string | null {
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['clawhub'], {
    encoding: 'utf8',
    timeout: 5_000,
    env,
  });
  const firstHit = lookup.stdout
    ?.split(/\r?\n/)
    .map(s => s.trim())
    .find(Boolean);
  if (lookup.status === 0 && firstHit) return firstHit;

  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'clawhub.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'clawhub.exe'),
      ]
    : [
        path.join(os.homedir(), '.local', 'bin', 'clawhub'),
        '/opt/homebrew/bin/clawhub',
        '/usr/local/bin/clawhub',
        '/usr/bin/clawhub',
        '/bin/clawhub',
      ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function runExternalCommandSync(command: string, args: string[], options: ExecFileSyncOptions = {}) {
  return execFileSync(command, args, {
    ...options,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    windowsHide: true,
  });
}

function formatExecError(err: any): string {
  return [
    err?.message,
    typeof err?.stdout === 'string' ? err.stdout.trim() : '',
    typeof err?.stderr === 'string' ? err.stderr.trim() : '',
  ].filter(Boolean).join('\n');
}

function getClawHubCliSpec(env: NodeJS.ProcessEnv): { command: string; argsPrefix: string[]; source: 'clawhub' | 'npx' } | null {
  const clawhubBinary = resolveClawHubBinary(env);
  if (clawhubBinary) {
    return { command: clawhubBinary, argsPrefix: [], source: 'clawhub' };
  }
  const npxBinary = resolveNpxBinary(env);
  if (npxBinary) {
    return { command: npxBinary, argsPrefix: ['--yes', 'clawhub@latest'], source: 'npx' };
  }
  return null;
}

function getClawHubCliEnv(env: NodeJS.ProcessEnv) {
  const openclawHome = getOpenClawHomeDir();
  fs.mkdirSync(openclawHome, { recursive: true });
  return {
    cwd: openclawHome,
    env: {
      ...env,
      CLAWHUB_WORKDIR: openclawHome,
      CLAWHUB_SITE: CLAWHUB_SITE_URL,
      CLAWHUB_REGISTRY: CLAWHUB_REGISTRY_URL,
    },
  };
}

function getClawHubAuthStatus(env: NodeJS.ProcessEnv) {
  const spec = getClawHubCliSpec(env);
  if (!spec) {
    return {
      available: false,
      loggedIn: false,
      source: null,
      displayName: null,
      error: 'ClawHub CLI not found',
    };
  }

  const cliEnv = getClawHubCliEnv(env);
  try {
    const output = String(runExternalCommandSync(spec.command, [
      ...spec.argsPrefix,
      'whoami',
      '--site',
      CLAWHUB_SITE_URL,
      '--registry',
      CLAWHUB_REGISTRY_URL,
    ], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      env: cliEnv.env,
      cwd: cliEnv.cwd,
    })).trim();
    return {
      available: true,
      loggedIn: true,
      source: spec.source,
      displayName: output || null,
      error: null,
    };
  } catch (err: any) {
    const message = formatExecError(err);
    if (/not logged in|login required|unauthorized|401/i.test(message)) {
      return {
        available: true,
        loggedIn: false,
        source: spec.source,
        displayName: null,
        error: null,
      };
    }
    return {
      available: true,
      loggedIn: false,
      source: spec.source,
      displayName: null,
      error: message || 'Failed to check ClawHub auth status',
    };
  }
}

function searchClawHubViaCli(env: NodeJS.ProcessEnv, query: string, limit: number) {
  const spec = getClawHubCliSpec(env);
  if (!spec) {
    return { success: false, error: 'ClawHub CLI not found', items: [] as Array<{ slug: string; name: string; score: number | null }> };
  }

  const cliEnv = getClawHubCliEnv(env);
  try {
    const output = String(runExternalCommandSync(spec.command, [
      ...spec.argsPrefix,
      'search',
      query,
      '--limit',
      String(limit),
      '--site',
      CLAWHUB_SITE_URL,
      '--registry',
      CLAWHUB_REGISTRY_URL,
    ], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      env: cliEnv.env,
      cwd: cliEnv.cwd,
    })).trim();

    const items = output
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith('- '))
      .map((line: string) => {
        const match = line.match(/^(\S+)\s{2,}(.+?)\s{2,}\(([\d.]+)\)$/);
        if (!match) return null;
        return {
          slug: match[1],
          name: match[2],
          score: Number.isFinite(Number(match[3])) ? Number(match[3]) : null,
        };
      })
      .filter((item: { slug: string; name: string; score: number | null } | null): item is { slug: string; name: string; score: number | null } => Boolean(item));

    return { success: true, error: null, items };
  } catch (err: any) {
    const message = formatExecError(err);
    return {
      success: false,
      error: message || 'Failed to search ClawHub',
      items: [] as Array<{ slug: string; name: string; score: number | null }>,
    };
  }
}

function migrateLegacyClawHubWorkspaceSkills() {
  let moved = 0;
  for (const legacySkillsDir of getLegacyWorkspaceSkillsDirs()) {
    if (!fs.existsSync(legacySkillsDir)) continue;
    for (const entry of fs.readdirSync(legacySkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceDir = path.join(legacySkillsDir, entry.name);
      const sourceSkillFile = path.join(sourceDir, 'SKILL.md');
      if (!fs.existsSync(sourceSkillFile)) continue;
      const movedPath = moveSkillIntoManagedDir(entry.name, [sourceDir]);
      if (movedPath) moved++;
    }
  }

  if (moved > 0) {
    log.info('[Skills] Migrated workspace skills into managed directory:', moved);
  }
  return moved;
}

// ═══════════════════════════════════════════════════════════
// Device Identity (Ed25519) — Required for Gateway operator scopes
// ═══════════════════════════════════════════════════════════

interface DeviceIdentity {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyRawB64Url: string;
  deviceId: string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getOrCreateDeviceIdentity(appPath: string): DeviceIdentity {
  const identityPath = path.join(appPath, 'device-identity.json');
  try {
    if (fs.existsSync(identityPath)) {
      const data = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
      if (data.privateKeyPem && data.publicKeyPem && data.deviceId && data.publicKeyRawB64Url) {
        return data;
      }
    }
  } catch (e) {
    console.error('[Device] Failed to load identity:', e);
  }

  console.log('[Device] Generating new Ed25519 keypair...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const spkiDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const rawKey = spkiDer.subarray(spkiDer.length - 32);
  const identity: DeviceIdentity = {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    publicKeyRawB64Url: base64UrlEncode(rawKey),
    deviceId: crypto.createHash('sha256').update(rawKey).digest('hex'),
  };
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });
  console.log('[Device] Identity created:', identity.deviceId.substring(0, 16) + '...');
  return identity;
}

let _deviceIdentity: DeviceIdentity | null = null;
function getDeviceIdentity(): DeviceIdentity {
  if (!_deviceIdentity) {
    _deviceIdentity = getOrCreateDeviceIdentity(app.getPath('userData'));
  }
  return _deviceIdentity;
}

// ═══════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════

const CONFIG_PATH = path.join(app.getPath('userData'), 'aegis-config.json');

interface AegisConfig {
  gatewayUrl: string;
  gatewayToken: string;
  sharedFolder: string;
  compressImages: boolean;
  maxImageSize: number;
  startWithWindows: boolean;
  theme: 'dark' | 'light' | 'system';
  globalHotkey: string;
  fontSize: number;
  openclawConfigPath?: string;
}

let config: AegisConfig = {
  gatewayUrl: `ws://127.0.0.1:${OPENCLAW_PORT}`,
  gatewayToken: '',
  sharedFolder: path.join(os.homedir(), '.openclaw', 'shared'),
  compressImages: true,
  maxImageSize: 1920,
  startWithWindows: false,
  theme: 'dark',
  globalHotkey: 'Alt+Space',
  fontSize: 14,
};

function readOpenclawGatewayToken(): string | null {
  try {
    const openclawConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(openclawConfigPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
    const token = parsed?.gateway?.auth?.token;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function loadConfig(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = { ...config, ...data };
      if (data.gatewayWsUrl && !data.gatewayUrl) config.gatewayUrl = data.gatewayWsUrl;
      if (data.controlUiUrl && !data.gatewayUrl) config.gatewayUrl = data.controlUiUrl.replace('http', 'ws');
    }
    // Prevent stale Desktop token after OpenClaw regenerates gateway token.
    const openclawToken = readOpenclawGatewayToken();
    if (openclawToken && openclawToken !== config.gatewayToken) {
      config.gatewayToken = openclawToken;
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      console.log('[Config] Synced gatewayToken from ~/.openclaw/openclaw.json');
    }
    console.log('[Config] Loaded:', CONFIG_PATH);
    console.log('[Config] Gateway URL:', config.gatewayUrl);
    console.log('[Config] Token:', config.gatewayToken ? '***set***' : '***empty***');
  } catch (e) {
    console.error('[Config] Load error:', e);
  }
}

function saveConfig(newConfig: Partial<AegisConfig>): void {
  config = { ...config, ...newConfig };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Resolved shared folder root (voice + staged uploads live under here). */
function getSharedFolderRoot(): string {
  const configuredRoot =
    typeof config.sharedFolder === 'string' && config.sharedFolder.trim()
      ? config.sharedFolder.trim()
      : path.join(os.homedir(), '.openclaw', 'shared');
  return path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(configuredRoot);
}

function getUploadsRoot(sharedRoot: string): string {
  return path.resolve(path.join(sharedRoot, '.openclaw-desktop', 'uploads'));
}

function resolveUploadsPath(sharedRoot: string, inputPath: string): string | null {
  const uploadsRoot = getUploadsRoot(sharedRoot);
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(path.join(uploadsRoot, inputPath));
  const rel = path.relative(uploadsRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

function getWorkspaceRootsByAgent(): Array<{ agentId: string; workspaceRoot: string }> {
  const roots = new Map<string, string>();
  const add = (agentId: string, value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const expanded = raw.replace(/^~(?=\/|\\)/, os.homedir());
    const resolved = path.resolve(expanded);
    roots.set(sanitizeAgentId(agentId), resolved);
  };

  const openclawHome = getOpenClawHomeDir();
  const defaultWorkspace = path.join(openclawHome, 'workspace');
  add('main', defaultWorkspace);

  try {
    const configPath = path.join(openclawHome, 'openclaw.json');
    if (!fs.existsSync(configPath)) {
      return Array.from(roots.entries()).map(([agentId, workspaceRoot]) => ({ agentId, workspaceRoot }));
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const defaultsWorkspace = String(parsed?.agents?.defaults?.workspace || '').trim();
    if (defaultsWorkspace) {
      add('main', defaultsWorkspace);
    }
    const agents = Array.isArray(parsed?.agents?.list) ? parsed.agents.list : [];
    for (const entry of agents) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String((entry as any).id || '').trim();
      if (!id) continue;
      const workspace = String((entry as any).workspace || '').trim();
      if (workspace) {
        add(id, workspace);
      } else if (defaultsWorkspace) {
        const isDefault = Boolean((entry as any).default);
        add(id, isDefault ? defaultsWorkspace : path.join(defaultsWorkspace, id));
      }
    }
  } catch {
    // Best-effort only.
  }

  return Array.from(roots.entries()).map(([agentId, workspaceRoot]) => ({ agentId, workspaceRoot }));
}

function resolveAgentWorkspaceDir(agentId?: string): string {
  const safeAgent = sanitizeAgentId(agentId || 'main');
  const entries = getWorkspaceRootsByAgent();
  const direct = entries.find((entry) => entry.agentId === safeAgent);
  if (direct) return direct.workspaceRoot;
  const mainRoot = entries.find((entry) => entry.agentId === 'main')?.workspaceRoot || path.join(getOpenClawHomeDir(), 'workspace');
  return safeAgent === 'main' ? mainRoot : path.join(mainRoot, safeAgent);
}

function getUploadsRootsByAgent(agentId?: string): Array<{ agentId: string; uploadsRoot: string }> {
  if (agentId && agentId.trim()) {
    const safe = sanitizeAgentId(agentId);
    return [{ agentId: safe, uploadsRoot: path.join(resolveAgentWorkspaceDir(safe), 'uploads') }];
  }
  return getWorkspaceRootsByAgent().map((entry) => ({
    agentId: entry.agentId,
    uploadsRoot: path.join(entry.workspaceRoot, 'uploads'),
  }));
}

function resolveUploadsPathAny(inputPath: string, agentId?: string): string | null {
  const candidate = String(inputPath || '').trim();
  if (!candidate) return null;
  if (path.isAbsolute(candidate) || candidate.startsWith('~/')) {
    const resolved = candidate.startsWith('~/')
      ? path.resolve(candidate.replace(/^~(?=\/|\\)/, os.homedir()))
      : path.resolve(candidate);
    return fs.existsSync(resolved) ? resolved : resolved;
  }
  for (const entry of getUploadsRootsByAgent(agentId)) {
    const resolved = path.resolve(path.join(entry.uploadsRoot, candidate));
    if (fs.existsSync(resolved)) return resolved;
  }
  const primaryRoot = getUploadsRootsByAgent(agentId)[0]?.uploadsRoot;
  return primaryRoot ? path.resolve(path.join(primaryRoot, candidate)) : null;
}

function getKnownWorkspaceRoots(agentId?: string): string[] {
  const roots = new Set<string>();
  const addRoot = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const expanded = raw.replace(/^~(?=\/|\\)/, os.homedir());
    const resolved = path.resolve(expanded);
    roots.add(resolved);
  };

  const openclawHome = getOpenClawHomeDir();
  const defaultWorkspace = path.join(openclawHome, 'workspace');
  addRoot(defaultWorkspace);
  if (agentId && agentId !== 'main') {
    addRoot(path.join(defaultWorkspace, agentId));
  }

  try {
    const configPath = path.join(openclawHome, 'openclaw.json');
    if (!fs.existsSync(configPath)) return Array.from(roots);
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const defaultsWorkspace = parsed?.agents?.defaults?.workspace;
    addRoot(defaultsWorkspace);
    if (agentId && agentId !== 'main' && defaultsWorkspace) {
      addRoot(path.join(String(defaultsWorkspace), agentId));
    }

    const agents = Array.isArray(parsed?.agents?.list) ? parsed.agents.list : [];
    for (const entry of agents) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String((entry as any).id || '').trim();
      const workspace = String((entry as any).workspace || '').trim();
      if (!id) continue;
      if (workspace) addRoot(workspace);
      if (agentId && id === agentId && workspace) addRoot(workspace);
    }
  } catch {
    // Best-effort: keep fallback roots only.
  }

  return Array.from(roots);
}

function toManagedListKind(kind: ManagedFileKind): 'outputs' | 'uploads' | 'voice' {
  if (kind === 'output') return 'outputs';
  if (kind === 'upload') return 'uploads';
  return 'voice';
}

async function captureOutputsToManagedIndex(payload?: { sessionKey?: string; agentId?: string; text?: string; runId?: string | null }) {
  const guessOutputMimeType = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
      '.csv': 'text/csv', '.json': 'application/json', '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
      '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
      '.html': 'text/html',
    };
    return mimeMap[ext] || 'application/octet-stream';
  };

  const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
  const safeAgentId = sanitizeAgentId(payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey));
  const text = String(payload?.text || '');
  const pathMatches = extractOutputPathCandidates(text);
  const now = new Date().toISOString();
  const workspaceRoots = getKnownWorkspaceRoots(safeAgentId);
  const candidateRefs: Array<{
    kind: ManagedFileKind;
    path: string;
    agentId: string;
    sessionKey: string;
    workspaceRoot: string;
    relativePath?: string;
    mimeType?: string;
    size?: number;
    createdAt: string;
  }> = [];

  for (const candidate of pathMatches) {
    const rawCandidate = String(candidate || '').trim();
    if (!rawCandidate) continue;
    const resolvedCandidates: string[] = [];
    if (path.isAbsolute(rawCandidate) || rawCandidate.startsWith('~/')) {
      resolvedCandidates.push(normalizeCandidatePath(rawCandidate));
    } else {
      const normalizedRel = rawCandidate.replace(/^["'`]|["'`]$/g, '');
      for (const root of workspaceRoots) {
        resolvedCandidates.push(path.resolve(root, normalizedRel));
      }
      resolvedCandidates.push(path.resolve(process.cwd(), normalizedRel));
    }
    const resolved = resolvedCandidates.find((candidatePath) => fs.existsSync(candidatePath));
    if (!resolved) continue;
    const matchedWorkspace = workspaceRoots.find((root) => {
      const rel = path.relative(root, resolved);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    const relativePath = matchedWorkspace ? path.relative(matchedWorkspace, resolved) : undefined;
    const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
    candidateRefs.push({
      kind: 'output',
      path: resolved,
      agentId: safeAgentId,
      sessionKey: safeSessionKey,
      workspaceRoot: matchedWorkspace || path.dirname(resolved),
      relativePath,
      mimeType: guessOutputMimeType(resolved),
      size: stat?.size,
      createdAt: now,
    });
  }

  const added = upsertManagedFileRefs(candidateRefs);
  return {
    success: true as const,
    refs: added.map((row) => ({
      path: row.path,
      sessionKey: row.sessionKey,
      agentId: row.agentId,
      createdAt: row.createdAt,
      kind: row.kind,
      workspaceRoot: row.workspaceRoot,
      relativePath: row.relativePath,
      mimeType: row.mimeType,
      size: row.size,
    })),
  };
}

/**
 * Returns true when the configured gateway URL points to the bundled local gateway
 * (127.0.0.1 / localhost at OPENCLAW_PORT).  When false the user has explicitly set
 * a remote or non-default URL — the main process should not start a local gateway.
 */
function isLocalBundledGatewayUrl(wsUrl: string): boolean {
  if (!wsUrl) return true; // empty → fall back to local bundled
  try {
    const u = new URL(wsUrl);
    const isLoopback =
      u.hostname === '127.0.0.1' ||
      u.hostname === 'localhost' ||
      u.hostname === '::1';
    const defaultPort = u.protocol === 'wss:' ? 443 : 80;
    const port = u.port ? parseInt(u.port, 10) : defaultPort;
    return isLoopback && port === OPENCLAW_PORT;
  } catch {
    return true; // malformed URL → assume local (safe default)
  }
}

// ═══════════════════════════════════════════════════════════
// NodeManager — Start / manage OpenClaw Gateway process
// ═══════════════════════════════════════════════════════════

let nodeManager: NodeManager | null = null;

// Tracks gateway boot failure so the renderer can show a recovery UI instead of quitting
let gatewayBootError: string | null = null;
let gatewayBootLogs: { stdout: string; stderr: string } = { stdout: '', stderr: '' };

function getGatewayStatusPayload(overrides: Partial<{
  running: boolean;
  ready: boolean;
  retrying: boolean;
  error: string | null;
  logs: { stdout: string; stderr: string };
}> = {}) {
  const running = nodeManager?.isRunning() ?? false;
  const ready = nodeManager?.isGatewayReady() ?? false;
  return {
    running,
    ready,
    error: gatewayBootError,
    logs: gatewayBootLogs,
    ...overrides,
  };
}

function emitGatewayStatusChanged(
  overrides: Partial<{
    running: boolean;
    ready: boolean;
    retrying: boolean;
    error: string | null;
    logs: { stdout: string; stderr: string };
  }> = {}
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('gateway:status-changed', getGatewayStatusPayload(overrides));
}

/**
 * Attempts to automatically recover a broken openclaw.json by:
 *   1. Moving the broken file to a timestamped .broken-<ts>.json backup
 *   2. Restoring from openclaw.json.bak if it exists and is valid JSON
 *   3. Otherwise removing the broken file so the gateway starts fresh with defaults
 *
 * Returns whether recovery succeeded and which strategy was used.
 */
function autoRecoverOpenclawConfig(): {
  recovered: boolean;
  method: 'restored-from-backup' | 'removed-for-fresh-start' | 'failed';
  brokenPath: string | null;
} {
  const homeDir = os.homedir();
  const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
  const bakPath = configPath + '.bak';

  // Preserve the broken file for post-mortem debugging
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const brokenPath = configPath.replace('.json', `.broken-${ts}.json`);
  try {
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, brokenPath);
      console.log(`[Gateway] Saved broken config to: ${brokenPath}`);
    }
  } catch { /* non-fatal */ }

  // Strategy 1: restore from the .bak file (created by config:write IPC before each save)
  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf-8');
      JSON.parse(bakContent); // Only restore if the backup is at least valid JSON
      fs.copyFileSync(bakPath, configPath);
      console.log('[Gateway] Auto-recovered: restored config from .bak');
      return { recovered: true, method: 'restored-from-backup', brokenPath };
    } catch {
      console.warn('[Gateway] .bak file is also invalid — falling back to fresh start');
    }
  }

  // Strategy 2: remove the broken config so the gateway starts with its built-in defaults
  try {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    console.log('[Gateway] Auto-recovered: removed broken config for fresh start');
    return { recovered: true, method: 'removed-for-fresh-start', brokenPath };
  } catch (err: any) {
    console.error('[Gateway] Auto-recovery failed:', err.message);
    return { recovered: false, method: 'failed', brokenPath: null };
  }
}

/**
 * Starts the OpenClaw gateway.
 * When isRecoveryAttempt=false and a config error is detected, auto-recovery is tried
 * once before falling through to the error screen.
 */
async function startGateway(
  isRecoveryAttempt: boolean = false,
  startupRetryAttempted: boolean = false,
  reportRetryingStatus: boolean = false
): Promise<void> {
  gatewayBootError = null;
  gatewayBootLogs = { stdout: '', stderr: '' };

  // ── External gateway check ────────────────────────────────────────────────
  // If the user has configured a non-local gateway URL (remote host, or a
  // different port such as when the OpenClaw CLI is running on a custom port),
  // skip the bundled gateway entirely.  The renderer connects to that URL
  // directly via its existing initConnection() / WebSocket logic.
  const configuredUrl = config.gatewayUrl || `ws://127.0.0.1:${OPENCLAW_PORT}`;
  if (!isLocalBundledGatewayUrl(configuredUrl)) {
    console.log(
      `[Gateway] Configured URL is external (${configuredUrl}) — skipping bundled gateway. Renderer will connect directly.`
    );
    // Stop any previously running bundled gateway (e.g. user switched from local → remote in settings).
    nodeManager?.forceStop();
    nodeManager = null;
    return;
  }

  // Pre-flight: catch JSON syntax errors before spawning (saves spawn overhead)
  const configCheck = NodeManager.validateOpenclawConfig(os.homedir());
  if (!configCheck.valid) {
    if (!isRecoveryAttempt) {
      console.warn('[Gateway] Config JSON invalid, attempting auto-recovery...');
      const recovery = autoRecoverOpenclawConfig();
      if (recovery.recovered) {
        console.log(`[Gateway] Auto-recovery (${recovery.method}) — retrying gateway start`);
        return startGateway(true, startupRetryAttempted, reportRetryingStatus);
      }
    }
    throw new Error(
      `CONFIG_INVALID\nYour OpenClaw config file contains invalid JSON and cannot be loaded.\n\n` +
      `File: ${configCheck.path}\n` +
      `Parse error: ${configCheck.error}\n\n` +
      `Auto-recovery was attempted but failed. Use the "Reset Config" button to remove\n` +
      `the corrupted file manually, then restart.`
    );
  }

  nodeManager = new NodeManager(OPENCLAW_PORT);
  let startupLogTimer: NodeJS.Timeout | null = null;
  try {
    await nodeManager.start();
    startupLogTimer = setInterval(() => {
      if (!nodeManager) return;
      gatewayBootLogs = nodeManager.getRecentLogs(120);
      emitGatewayStatusChanged({
        running: nodeManager.isRunning(),
        ready: nodeManager.isGatewayReady(),
        retrying: reportRetryingStatus,
        error: null,
        logs: gatewayBootLogs,
      });
    }, 700);
    await nodeManager.waitForReady();
  } catch (err: any) {
    if (startupLogTimer) {
      clearInterval(startupLogTimer);
      startupLogTimer = null;
    }
    gatewayBootLogs = nodeManager.getRecentLogs(100);
    const errStr = String(err);
    const startupStalled = errStr.includes('GATEWAY_STARTUP_STALLED');
    const startupTimedOut = errStr.includes('Timeout waiting for');
    if ((startupStalled || startupTimedOut) && !startupRetryAttempted) {
      console.warn('[Gateway] Startup stalled/timed out, forcing one automatic restart before showing error...');
      try {
        nodeManager.forceStop();
      } catch {
        /* best-effort */
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
      return startGateway(isRecoveryAttempt, true, reportRetryingStatus);
    }

    // Auto-recover from schema-level config errors (gateway exits with code 1 + "Config invalid")
    if (!isRecoveryAttempt && errStr.includes('CONFIG_SCHEMA_INVALID')) {
      console.warn('[Gateway] Config schema error — attempting auto-recovery...');
      const recovery = autoRecoverOpenclawConfig();
      if (recovery.recovered) {
        console.log(`[Gateway] Auto-recovery (${recovery.method}) — retrying gateway start`);
        return startGateway(true, startupRetryAttempted, reportRetryingStatus);
      }
      console.error('[Gateway] Auto-recovery failed — showing error screen');
    }
    throw err;
  }
  if (startupLogTimer) {
    clearInterval(startupLogTimer);
    startupLogTimer = null;
  }

  gatewayBootLogs = nodeManager.getRecentLogs(100);
  if (nodeManager.isAdoptedGateway()) {
    console.log('[Gateway] Using existing OpenClaw CLI gateway — bundled gateway not started.');
  }
  const token = nodeManager.getToken();
  if (token) {
    saveConfig({ gatewayToken: token, gatewayUrl: `ws://127.0.0.1:${OPENCLAW_PORT}` });
    console.log('[Gateway] Token injected into config');
  } else {
    console.warn('[Gateway] No token found — renderer will need to pair manually');
  }
}

// ═══════════════════════════════════════════════════════════
// Windows
// ═══════════════════════════════════════════════════════════

let mainWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let clawHubLoginWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

let installerLangGlobal: string | null = null;
function detectInstallerLanguage(): void {
  try {
    const langFile = path.join(process.resourcesPath, 'language.txt');
    if (fs.existsSync(langFile)) {
      const lang = fs.readFileSync(langFile, 'utf-8').trim();
      if (lang === 'ar' || lang === 'en') installerLangGlobal = lang;
    }
  } catch { /* dev mode — no resources dir */ }
}

const ptyProcesses = new Map<string, any>();
let ptyCounter = 0;

/** Ensures userData/bin/openclaw (or openclaw.cmd on Windows) exists; returns bin dir to prepend to PATH or null. */
function ensureOpenclawWrapper(userDataPath: string, nodePath: string, openclawMjsPath: string): string | null {
  const binDir = path.join(userDataPath, 'bin');
  try {
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    if (process.platform === 'win32') {
      const cmdPath = path.join(binDir, 'openclaw.cmd');
      const content = `@echo off\r\n"${nodePath.replace(/\//g, '\\')}" "${openclawMjsPath.replace(/\//g, '\\')}" %*\r\n`;
      if (!fs.existsSync(cmdPath) || fs.readFileSync(cmdPath, 'utf8') !== content) {
        fs.writeFileSync(cmdPath, content);
      }
      return binDir;
    }
    const scriptPath = path.join(binDir, 'openclaw');
    const content = `#!/bin/sh\nexec "${nodePath}" "${openclawMjsPath}" "$@"\n`;
    if (!fs.existsSync(scriptPath) || fs.readFileSync(scriptPath, 'utf8') !== content) {
      fs.writeFileSync(scriptPath, content);
      fs.chmodSync(scriptPath, 0o755);
    }
    return binDir;
  } catch {
    return null;
  }
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const splashHTML = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        background: rgba(10,10,20,0.95);
        border-radius: 20px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        -webkit-app-region: drag;
        overflow: hidden;
      }
      .logo {
        width: 72px; height: 72px; border-radius: 18px;
        background: linear-gradient(135deg, #4EC9B0, #6C9FFF);
        display: flex; align-items: center; justify-content: center;
        font-size: 32px; font-weight: 700; color: white;
        box-shadow: 0 8px 32px rgba(78,201,176,0.3);
        animation: float 2s ease-in-out infinite;
      }
      @keyframes float {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
      .title { color: #e0e0e0; font-size: 18px; font-weight: 600; margin-top: 20px; letter-spacing: 1px; }
      .subtitle { color: #5a6370; font-size: 11px; margin-top: 6px; }
      .spinner {
        margin-top: 28px; width: 24px; height: 24px;
        border: 2px solid rgba(78,201,176,0.15);
        border-top-color: #4EC9B0;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    </head>
    <body>
      <div class="logo">O</div>
      <div class="title">OpenClaw Desktop</div>
      <div class="subtitle">Starting gateway...</div>
      <div class="spinner"></div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

/**
 * Only inject our renderer CSP on normal app navigations. Applying it to
 * chrome-extension:/chrome:/data:/blob: responses breaks Chromium's built-in
 * PDF viewer (iframe data: URLs) and other internal pages.
 */
function shouldInjectSessionCspForUrl(url: string): boolean {
  try {
    const proto = new URL(url).protocol;
    return !(
      proto === 'chrome-extension:' ||
      proto === 'chrome:' ||
      proto === 'devtools:' ||
      proto === 'about:' ||
      proto === 'data:' ||
      proto === 'blob:'
    );
  } catch {
    return true;
  }
}

function createWindow(): void {
  // BrowserWindow.setIcon() does not support .icns on macOS; use .png for all platforms
  const windowIcon = process.platform === 'win32'
    ? getResourcePath('icons', 'icon.ico')
    : getResourcePath('icons', 'icon.png');

  const isMac     = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    // Match the Control UI default window footprint.
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(windowIcon) ? windowIcon : undefined,
    // ── Title bar strategy per platform ──────────────────────────────────────
    // macOS   : hiddenInset keeps native traffic lights (●●●) in top-left;
    //           the renderer draws its own content to the right of them.
    // Windows : frameless + titleBarOverlay renders native Win11 snap/control
    //           buttons in the theme colour, overlaid on the right of our bar.
    // Linux   : frameless — draggable via CSS drag-region; WM adds decorations.
    frame:          isMac,           // true on macOS (needed for hiddenInset), false on Win/Linux
    titleBarStyle:  isMac ? 'hiddenInset' : 'hidden',
    ...(isMac     ? { trafficLightPosition: { x: 12, y: 10 } } : {}),
    ...(isWindows ? { titleBarOverlay: { color: '#0a0a14', symbolColor: '#94a3b8', height: 38 } } : {}),
    transparent: false,
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      ...(installerLangGlobal ? { additionalArguments: [`--installer-lang=${installerLangGlobal}`] } : {}),
    },
    show: false,
  });

  // Rewrite Origin header: file:// → localhost (for packaged app WebSocket connections)
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['ws://*/*', 'wss://*/*', 'http://*/*', 'https://*/*'] },
    (details, callback) => {
      const origin = details.requestHeaders['Origin'];
      if (!origin || origin === 'null' || origin.startsWith('file://')) {
        try {
          const url = new URL(details.url);
          details.requestHeaders['Origin'] = `http://${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
        } catch {
          details.requestHeaders['Origin'] = `http://127.0.0.1:${OPENCLAW_PORT}`;
        }
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = { ...details.responseHeaders };
    if (shouldInjectSessionCspForUrl(details.url)) {
      headers['Content-Security-Policy'] = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
        "style-src-elem 'self' 'unsafe-inline' https:; " +
        "img-src 'self' data: blob: https: http:; " +
        "media-src 'self' data: blob: https: http:; " +
        "connect-src 'self' ws: wss: http: https:; " +
        "font-src 'self' data: https:;",
      ];
    }
    // Inject CORS headers for APIs that don't send them (e.g. SkillsHub backend)
    if (details.url.includes('lightmake.site')) {
      headers['access-control-allow-origin'] = ['*'];
      headers['access-control-allow-methods'] = ['GET, POST, OPTIONS'];
      headers['access-control-allow-headers'] = ['Content-Type'];
    }
    callback({ responseHeaders: headers });
  });

  if (isDev) {
    console.log('[Window] Loading dev server: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    // DevTools can be opened manually via Cmd+Option+I; auto-opening a detached
    // DevTools window interferes with tray-icon window restore on macOS.
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[Window] Loading:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Right-click context menu
  // Open normal web URLs in the system browser. In-app BrowserWindow popups often white-screen
  // modern SPAs (SkillHub, etc.). Leave blob:/file:/etc. to the default handler so chat/media keeps working.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText, linkURL } = params;
    const menuItems: Electron.MenuItemConstructorOptions[] = [];
    if (linkURL) {
      menuItems.push({ label: t('contextMenu.openLink'), click: () => shell.openExternal(linkURL) });
      menuItems.push({ label: t('contextMenu.copyLink'), click: () => clipboard.writeText(linkURL) });
      menuItems.push({ type: 'separator' });
    }
    if (isEditable) {
      menuItems.push({ label: t('contextMenu.cut'), accelerator: 'CmdOrCtrl+X', enabled: editFlags.canCut, role: 'cut' });
    }
    if (selectionText || isEditable) {
      menuItems.push({ label: t('contextMenu.copy'), accelerator: 'CmdOrCtrl+C', enabled: editFlags.canCopy, role: 'copy' });
    }
    if (isEditable) {
      menuItems.push({ label: t('contextMenu.paste'), accelerator: 'CmdOrCtrl+V', enabled: editFlags.canPaste, role: 'paste' });
    }
    if (isEditable || selectionText) {
      menuItems.push({ type: 'separator' });
      menuItems.push({ label: t('contextMenu.selectAll'), accelerator: 'CmdOrCtrl+A', role: 'selectAll' });
    }
    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow! });
    }
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[Window] Ready to show');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Window] Failed to load:', code, desc);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] Loaded successfully');
  });

  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      // On Windows, hide the taskbar button so the tray icon is the only entry point.
      if (process.platform === 'win32') mainWindow?.setSkipTaskbar(true);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// IPC Handlers
// ═══════════════════════════════════════════════════════════

function setupIPC(): void {
  ipcMain.handle('app:versions', () => ({
    desktop: app.getVersion(),
    openclaw: nodeManager?.getBundledOpenclawVersion() ?? null,
  }));

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize(); } else { mainWindow?.maximize(); }
    return mainWindow?.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

  ipcMain.handle('config:get', () => {
    let installerLang: string | undefined;
    try {
      const langFile = path.join(process.resourcesPath, 'language.txt');
      if (fs.existsSync(langFile)) installerLang = fs.readFileSync(langFile, 'utf-8').trim();
    } catch { /* ignore */ }
    return { ...config, configPath: CONFIG_PATH, ...(installerLang ? { installerLanguage: installerLang } : {}) };
  });
  ipcMain.handle('config:save', (_e, newConfig: Partial<AegisConfig>) => {
    saveConfig(newConfig);
    return { success: true };
  });
  ipcMain.handle('settings:save', (_e, key: string, value: any) => {
    const configKeyMap: Partial<Record<string, keyof AegisConfig>> = {
      gatewayUrl: 'gatewayUrl', gatewayToken: 'gatewayToken', theme: 'theme',
      fontSize: 'fontSize', openclawConfigPath: 'openclawConfigPath',
    };
    const configKey = configKeyMap[key];
    if (configKey) {
      saveConfig({ [configKey]: value } as Partial<AegisConfig>);
      console.log(`[Settings] Synced: ${key} =`, configKey === 'gatewayToken' ? '***' : value);
    }
    return { success: true };
  });

  const detectOpenClawConfigPath = (): string => {
    if (config.openclawConfigPath) return config.openclawConfigPath;
    const homeDir = app.getPath('home');
    const configDir = path.join(homeDir, '.openclaw');
    const candidates = [
      path.join(configDir, 'clawdbot.json'),
      path.join(configDir, 'openclaw.json'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return candidates[0];
  };

  ipcMain.handle('config:detect', () => {
    const configPath = detectOpenClawConfigPath();
    return { path: configPath, exists: fs.existsSync(configPath) };
  });

  ipcMain.handle('config:read', (_e, inputPath?: string) => {
    try {
      const configPath = inputPath || detectOpenClawConfigPath();
      const raw = fs.readFileSync(configPath, 'utf-8');
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        const cleaned = raw
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        data = JSON.parse(cleaned);
      }
      return { data, path: configPath };
    } catch (err: any) {
      throw new Error(`Failed to read config: ${err.message}`);
    }
  });

  ipcMain.handle('config:write', (_e, { path: configPath, data }: { path?: string; data: object }) => {
    try {
      const targetPath = configPath || detectOpenClawConfigPath();
      if (fs.existsSync(targetPath)) fs.copyFileSync(targetPath, `${targetPath}.bak`);
      const dir = path.dirname(targetPath);
      const base = path.basename(targetPath);
      const hostBackupPath = path.join(dir, `.${base}.host-backup`);
      if (fs.existsSync(hostBackupPath)) fs.unlinkSync(hostBackupPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('config:restart', async () => {
    if (nodeManager) {
      try {
        nodeManager.stop();
        await new Promise((r) => setTimeout(r, 1000));
        await startGateway();
        // Notify renderer so GatewayErrorScreen dismisses if it was showing
        emitGatewayStatusChanged({ running: true, ready: true, error: null });
        return { success: true, method: 'node-manager' };
      } catch (err: any) {
        gatewayBootError = String(err);
        if (nodeManager) gatewayBootLogs = nodeManager.getRecentLogs(100);
        emitGatewayStatusChanged({ running: false, ready: false, error: gatewayBootError, logs: gatewayBootLogs });
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'no-node-manager' };
  });

  // ── Gateway boot status + retry (for GatewayErrorScreen in renderer) ──

  ipcMain.handle('gateway:status', () => getGatewayStatusPayload());

  ipcMain.handle('gateway:retry', async () => {
    // Notify renderer we're retrying so it can show a spinner
    emitGatewayStatusChanged({ running: false, ready: false, retrying: true, error: null });
    try {
      if (nodeManager) nodeManager.stop();
      await new Promise<void>((r) => setTimeout(r, 500));
      await startGateway(false, false, true);
      emitGatewayStatusChanged({ running: true, ready: true, error: null });
      return { success: true };
    } catch (err: any) {
      gatewayBootError = String(err);
      if (nodeManager) gatewayBootLogs = nodeManager.getRecentLogs(100);
      emitGatewayStatusChanged({ running: false, ready: false, error: gatewayBootError, logs: gatewayBootLogs });
      return { success: false, error: String(err) };
    }
  });

  // ── OpenClaw config file validation + reset ──

  ipcMain.handle('config:validate-openclaw', (): OpenclawConfigValidation => {
    return NodeManager.validateOpenclawConfig(os.homedir());
  });

  ipcMain.handle('config:backup-reset-openclaw', () => {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      if (!fs.existsSync(configPath)) return { success: true, backupPath: null };
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = configPath.replace('.json', `.backup-${ts}.json`);
      fs.copyFileSync(configPath, backupPath);
      fs.unlinkSync(configPath);
      console.log(`[Config] Backed up corrupted config to: ${backupPath}`);
      return { success: true, backupPath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Sync main agent auth-profiles.json from desktop provider config ─
  // Payload: Array<{ provider, profileKey, apiKey, mode? }>.
  ipcMain.handle(
    'agentAuth:syncMain',
    (
      _e,
      entries: Array<{ provider: string; profileKey: string; apiKey: string; mode?: string }>
    ) => {
      try {
        if (!entries || entries.length === 0) return { success: true };

        const homeDir = app.getPath('home');
        const agentDir = path.join(homeDir, '.openclaw', 'agents', 'main', 'agent');
        const authPath = path.join(agentDir, 'auth-profiles.json');

        fs.mkdirSync(agentDir, { recursive: true });

        // OpenClaw's auth-profiles.json must be { version: 1, profiles: { ... } }
        // coerceAuthStore() returns null if there is no top-level "profiles" key.
        let profiles: Record<string, any> = {};
        if (fs.existsSync(authPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
            // Support both old flat format and correct wrapped format
            profiles = (raw?.profiles && typeof raw.profiles === 'object')
              ? raw.profiles
              : (typeof raw === 'object' ? raw : {});
          } catch {
            profiles = {};
          }
        }

        for (const entry of entries) {
          if (!entry.provider || !entry.profileKey || !entry.apiKey) continue;

          // OpenClaw's internal schema uses "type" (not "mode") and "key" (not "apiKey").
          // See: resolveApiKeyForProfile -> cred.type, cred.key
          const profile = {
            provider: entry.provider,
            type: 'api_key',
            key: entry.apiKey,
          };

          // 1) Specific profile key (e.g. "dashscope:main")
          profiles[entry.profileKey] = profile;

          // 2) Generic provider key (e.g. "dashscope") as fallback
          if (!profiles[entry.provider]) {
            profiles[entry.provider] = profile;
          }
        }

        const store = { version: 1, profiles };
        fs.writeFileSync(authPath, JSON.stringify(store, null, 2) + '\n', 'utf-8');
        return { success: true };
      } catch (err: any) {
        console.error('[AgentAuth] Failed to sync main agent auth-profiles.json:', err);
        return { success: false, error: err.message };
      }
    }
  );

  // ── Rehydrate main agent runtime model/auth state ──────────────────────────
  // Ensures provider alias drift (e.g. modelstudio/qwencloud) does not leave
  // stale runtime registrations in ~/.openclaw/agents/main/agent/models.json.
  ipcMain.handle('agentAuth:rehydrateMainRuntime', () => {
    try {
      const homeDir = app.getPath('home');
      const openclawConfigPath = path.join(homeDir, '.openclaw', 'openclaw.json');
      const agentDir = path.join(homeDir, '.openclaw', 'agents', 'main', 'agent');
      const authPath = path.join(agentDir, 'auth-profiles.json');
      const modelsPath = path.join(agentDir, 'models.json');

      const normalizeProviderId = (providerId: string): string => {
        const normalized = String(providerId || '').trim().toLowerCase();
        if (normalized === 'modelstudio' || normalized === 'qwencloud' || normalized === 'qwen-dashscope') return 'qwen';
        if (normalized === 'z.ai' || normalized === 'z-ai') return 'zai';
        if (normalized === 'kimi-coding' || normalized === 'kimi-code') return 'kimi';
        return normalized;
      };

      const desiredProviders = new Set<string>();
      if (fs.existsSync(openclawConfigPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'));
          const authProfiles = cfg?.auth?.profiles;
          if (authProfiles && typeof authProfiles === 'object') {
            for (const profile of Object.values(authProfiles as Record<string, any>)) {
              const provider = normalizeProviderId(String((profile as any)?.provider || ''));
              if (provider) desiredProviders.add(provider);
            }
          }
        } catch {
          // ignore malformed config; fallback to auth-profiles cleanup only
        }
      }

      fs.mkdirSync(agentDir, { recursive: true });

      let wrappedStore: { version: number; profiles: Record<string, any> } = {
        version: 1,
        profiles: {},
      };
      if (fs.existsSync(authPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
          const existingProfiles =
            raw?.profiles && typeof raw.profiles === 'object'
              ? raw.profiles
              : (typeof raw === 'object' ? raw : {});
          wrappedStore = {
            version: typeof raw?.version === 'number' ? raw.version : 1,
            profiles: { ...(existingProfiles as Record<string, any>) },
          };
        } catch {
          wrappedStore = { version: 1, profiles: {} };
        }
      }

      const nextProfiles: Record<string, any> = {};
      const canonicalSeen = new Set<string>();
      for (const [profileKey, profileValue] of Object.entries(wrappedStore.profiles || {})) {
        const profile = profileValue && typeof profileValue === 'object' ? { ...profileValue } : {};
        const keyHead = String(profileKey || '').split(':')[0] || '';
        const normalizedFromKey = normalizeProviderId(keyHead);
        const normalizedFromProvider = normalizeProviderId(String((profile as any).provider || keyHead));
        const canonicalProvider = normalizedFromProvider || normalizedFromKey;
        if (!canonicalProvider) continue;

        // If openclaw.json explicitly configures providers, keep only those.
        if (desiredProviders.size > 0 && !desiredProviders.has(canonicalProvider)) {
          continue;
        }

        profile.provider = canonicalProvider;
        const tail = profileKey.includes(':') ? profileKey.slice(profileKey.indexOf(':') + 1) : '';
        const canonicalKey = tail ? `${canonicalProvider}:${tail}` : canonicalProvider;

        // Deduplicate alias-collapsed keys (prefer first seen).
        if (canonicalSeen.has(canonicalKey)) continue;
        canonicalSeen.add(canonicalKey);
        nextProfiles[canonicalKey] = profile;
      }

      fs.writeFileSync(
        authPath,
        JSON.stringify({ version: wrappedStore.version || 1, profiles: nextProfiles }, null, 2) + '\n',
        'utf-8',
      );

      if (fs.existsSync(modelsPath)) {
        fs.unlinkSync(modelsPath);
      }

      return { success: true };
    } catch (err: any) {
      console.error('[AgentAuth] Failed to rehydrate main runtime state:', err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.on('i18n:setLanguage', (_e, lang: string) => { setLanguage(lang); });

  ipcMain.handle('pairing:get-token', () => config.gatewayToken || null);
  ipcMain.handle('pairing:save-token', (_e, token: string) => {
    saveConfig({ gatewayToken: token });
    return { success: true };
  });
  ipcMain.handle('pairing:request', async (_e, httpBaseUrl: string) => {
    try {
      const res = await fetch(`${httpBaseUrl}/v1/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'openclaw-control-ui', clientName: 'OpenClaw Desktop',
          platform: process.platform,
          scopes: ['operator.read', 'operator.write', 'operator.admin'],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      return await res.json();
    } catch (err: any) {
      throw err;
    }
  });
  ipcMain.handle('pairing:poll', async (_e, httpBaseUrl: string, deviceId: string) => {
    const res = await fetch(`${httpBaseUrl}/v1/pair/${encodeURIComponent(deviceId)}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  ipcMain.handle('artifact:open', async (_e, data: { type: string; title: string; content: string }) => {
    try {
      const normalizeArtifactContent = (artifact: { type: string; title: string; content: string }) => {
        const rawContent = String(artifact?.content || '').trim();
        const isPathLike =
          rawContent.startsWith('/') ||
          rawContent.startsWith('~/') ||
          /^[A-Za-z]:[\\/]/.test(rawContent) ||
          rawContent.startsWith('file://');
        if (!isPathLike) return artifact;

        const resolvedPath = path.resolve(rawContent.replace(/^~(?=\/|\\)/, os.homedir()).replace(/^file:\/\//, ''));
        if (!fs.existsSync(resolvedPath)) return artifact;
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) return artifact;
        const fileText = fs.readFileSync(resolvedPath, 'utf8');
        return {
          ...artifact,
          content: fileText,
          title: artifact.title || path.basename(resolvedPath),
        };
      };
      const normalizedData = normalizeArtifactContent(data);

      const htmlSrc = path.join(__dirname, '..', 'electron', 'preview-container.html');
      const htmlDst = path.join(__dirname, 'preview-container.html');
      if (fs.existsSync(htmlSrc)) fs.copyFileSync(htmlSrc, htmlDst);
      const htmlPath = fs.existsSync(htmlDst) ? htmlDst : htmlSrc;

      if (!previewWindow || previewWindow.isDestroyed()) {
        previewWindow = new BrowserWindow({
          width: 1200, height: 800, minWidth: 600, minHeight: 400,
          title: `Preview — ${data.title}`,
          backgroundColor: '#0d1117',
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false, contextIsolation: true, sandbox: true,
            preload: path.join(__dirname, 'preload-preview.js'),
          },
        });
        previewWindow.loadFile(htmlPath);
        previewWindow.on('closed', () => { previewWindow = null; });
        previewWindow.webContents.on('did-finish-load', () => {
          previewWindow?.webContents.send('artifact:content', normalizedData);
        });
      } else {
        previewWindow.webContents.send('artifact:content', normalizedData);
        previewWindow.setTitle(`Preview — ${normalizedData.title}`);
        previewWindow.focus();
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clipboard:write', (_e, text: string) => { clipboard.writeText(text); });

  ipcMain.handle('image:save', async (_e, src: string, suggestedName: string) => {
    try {
      const ext = (suggestedName.match(/\.(\w+)$/) || [, 'png'])[1];
      const filterMap: Record<string, { name: string; extensions: string[] }> = {
        png: { name: 'PNG Image', extensions: ['png'] },
        jpg: { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        jpeg: { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        gif: { name: 'GIF Image', extensions: ['gif'] },
        webp: { name: 'WebP Image', extensions: ['webp'] },
        svg: { name: 'SVG Image', extensions: ['svg'] },
      };
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: t('dialog.saveImage'), defaultPath: suggestedName,
        filters: [filterMap[ext.toLowerCase()] || { name: 'Image', extensions: [ext] }, { name: 'All Files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };

      let imageBuffer: Buffer;
      if (src.startsWith('data:')) {
        imageBuffer = Buffer.from(src.split(',')[1], 'base64');
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        const { net } = require('electron');
        imageBuffer = Buffer.from(await (await net.fetch(src)).arrayBuffer());
      } else if (fs.existsSync(src)) {
        imageBuffer = fs.readFileSync(src);
      } else {
        return { success: false, error: 'Unsupported image source' };
      }
      fs.writeFileSync(result.filePath, imageBuffer);
      if (Notification.isSupported()) {
        new Notification({ title: t('dialog.imageSaved'), body: path.basename(result.filePath), silent: true }).show();
      }
      return { success: true, path: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('notification:show', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      const notif = new Notification({ title, body, silent: true });
      notif.on('click', () => { if (mainWindow) { mainWindow.restore(); mainWindow.focus(); } });
      notif.show();
    }
  });

  ipcMain.handle('device:getIdentity', () => {
    const identity = getDeviceIdentity();
    return { deviceId: identity.deviceId, publicKey: identity.publicKeyRawB64Url };
  });

  ipcMain.handle('device:sign', (_e, params: {
    nonce?: string; clientId: string; clientMode: string;
    role: string; scopes: string[]; token: string;
  }) => {
    if (!params.nonce) {
      const identity = getDeviceIdentity();
      return { deviceId: identity.deviceId, publicKey: identity.publicKeyRawB64Url, signature: null, signedAt: null, nonce: null };
    }
    const identity = getDeviceIdentity();
    const signedAt = Date.now();
    const parts = ['v2', identity.deviceId, params.clientId, params.clientMode, params.role, params.scopes.join(','), String(signedAt), params.token || '', params.nonce];
    const signature = base64UrlEncode(crypto.sign(null, Buffer.from(parts.join('|'), 'utf8'), crypto.createPrivateKey(identity.privateKeyPem)));
    return { deviceId: identity.deviceId, publicKey: identity.publicKeyRawB64Url, signature, signedAt, nonce: params.nonce };
  });

  ipcMain.handle('memory:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'], title: 'Select Memory Folder' });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('memory:readLocal', async (_e, dirPath: string) => {
    try {
      const files: { name: string; content: string; modified: string; size: number }[] = [];
      const memoryMd = path.join(dirPath, 'MEMORY.md');
      if (fs.existsSync(memoryMd)) {
        const stat = fs.statSync(memoryMd);
        files.push({ name: 'MEMORY.md', content: fs.readFileSync(memoryMd, 'utf-8'), modified: stat.mtime.toISOString(), size: stat.size });
      }
      const entries = fs.readdirSync(dirPath).filter((f: string) => f.endsWith('.md') && f !== 'MEMORY.md').sort().reverse();
      for (const fname of entries.slice(0, 100)) {
        const fpath = path.join(dirPath, fname);
        const stat = fs.statSync(fpath);
        if (stat.isFile() && stat.size < 500_000) {
          files.push({ name: fname, content: fs.readFileSync(fpath, 'utf-8'), modified: stat.mtime.toISOString(), size: stat.size });
        }
      }
      return { success: true, files };
    } catch (e: any) {
      return { success: false, error: e.message, files: [] };
    }
  });

  ipcMain.handle('screenshot:capture', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      if (sources.length > 0) return { success: true, data: sources[0].thumbnail.toDataURL() };
      return { success: false, error: 'No screen found' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('screenshot:windows', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 400, height: 280 }, fetchWindowIcons: true });
      return sources.filter((s) => s.thumbnail && !s.thumbnail.isEmpty()).map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
    } catch { return []; }
  });

  ipcMain.handle('screenshot:captureWindow', async (_e, windowId: string) => {
    try {
      const isOwnWindow = windowId.includes(String(mainWindow!.id));
      if (isOwnWindow) {
        const img = await mainWindow!.webContents.capturePage();
        return { success: true, data: img.toDataURL() };
      }
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 1920, height: 1080 } });
      const source = sources.find((s) => s.id === windowId);
      if (source && !source.thumbnail.isEmpty()) return { success: true, data: source.thumbnail.toDataURL() };
      return { success: false, error: 'Window not found' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:openDialog', async () => dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'] }));

  ipcMain.handle('file:read', async (_e, filePath: string) => {
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
        '.csv': 'text/csv', '.json': 'application/json', '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
        '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
      };
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);
      return { name: path.basename(filePath), path: filePath, base64: data.toString('base64'), mimeType: mimeMap[ext] || 'application/octet-stream', isImage, size: data.length };
    } catch { return null; }
  });

  ipcMain.handle('file:openSharedFolder', () => {
    const folder = config.sharedFolder;
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    shell.openPath(folder);
  });

  function guessMimeTypeByExt(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
      '.csv': 'text/csv', '.json': 'application/json', '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
      '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
      '.html': 'text/html',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  ipcMain.handle(
    'uploads:list',
    async (_e, payload?: { sessionKey?: string; agentId?: string; query?: string; limit?: number; offset?: number }) => {
      try {
        const safeSessionKey = payload?.sessionKey ? sanitizeAttachmentSessionKey(payload.sessionKey) : '';
        const safeAgentId = payload?.agentId ? sanitizeAgentId(payload.agentId) : '';
        const query = String(payload?.query || '').trim().toLowerCase();
        const limit = typeof payload?.limit === 'number' && payload.limit > 0 ? payload.limit : 200;
        const offset = typeof payload?.offset === 'number' && payload.offset >= 0 ? payload.offset : 0;
        const uploadsRoots = getUploadsRootsByAgent(safeAgentId || undefined);

        const files: Array<{
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
        }> = [];

        const walk = (baseRoot: string, dirPath: string, ownerAgentId: string) => {
          if (!fs.existsSync(dirPath)) return;
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              walk(baseRoot, fullPath, ownerAgentId);
              continue;
            }
            if (!entry.isFile() || entry.name.endsWith('.openclaw-desktop-upload.json')) continue;
            const stat = fs.statSync(fullPath);
            const rel = path.relative(baseRoot, fullPath);
            const parts = rel.split(path.sep);
            const sessionKey = parts[0] || undefined;
            const agentId = ownerAgentId;
            if (safeAgentId && agentId !== safeAgentId) continue;
            if (safeSessionKey && sessionKey !== safeSessionKey) continue;
            if (query && !fullPath.toLowerCase().includes(query) && !entry.name.toLowerCase().includes(query)) continue;
            files.push({
              path: fullPath,
              name: entry.name,
              size: stat.size,
              modified: stat.mtime.toISOString(),
              ext: path.extname(entry.name).replace(/^\./, '').toLowerCase(),
              mimeType: guessMimeTypeByExt(fullPath),
              kind: 'uploads',
              exists: true,
              sessionKey,
              agentId,
            });
          }
        };

        for (const root of uploadsRoots) {
          walk(root.uploadsRoot, root.uploadsRoot, root.agentId);
        }
        files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
        return { success: true, rows: files.slice(offset, offset + limit), total: files.length, root: uploadsRoots[0]?.uploadsRoot || '' };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error), rows: [], total: 0 };
      }
    },
  );

  ipcMain.handle('uploads:open', async (_e, filePath: string) => {
    try {
      const resolved = resolveUploadsPathAny(String(filePath || ''));
      if (!resolved) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'not_found' };
      const result = await shell.openPath(resolved);
      if (result) return { success: false, error: result };
      return { success: true, path: resolved };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:reveal', async (_e, filePath: string) => {
    try {
      const resolved = resolveUploadsPathAny(String(filePath || ''));
      if (!resolved) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'not_found' };
      shell.showItemInFolder(resolved);
      return { success: true, path: resolved };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:exists', async (_e, filePath: string) => {
    try {
      const resolved = resolveUploadsPathAny(String(filePath || ''));
      if (!resolved) return { success: true, exists: false };
      return { success: true, exists: fs.existsSync(resolved), path: resolved };
    } catch (error: any) {
      return { success: false, exists: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:read', async (_e, payload?: { path?: string }) => {
    try {
      const resolved = resolveUploadsPathAny(String(payload?.path || ''));
      if (!resolved) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      if (stat.size > 30 * 1024 * 1024) return { success: false, error: 'too_large', size: stat.size };
      return { success: true, data: fs.readFileSync(resolved).toString('base64'), mimeType: guessMimeTypeByExt(resolved) };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:delete', async (_e, payload?: { path?: string }) => {
    try {
      const resolved = resolveUploadsPathAny(String(payload?.path || ''));
      if (!resolved) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      fs.unlinkSync(resolved);
      return { success: true, path: resolved };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:saveAs', async (_e, payload?: { path?: string }) => {
    try {
      const resolved = resolveUploadsPathAny(String(payload?.path || ''));
      if (!resolved) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(resolved)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      const defaultName = path.basename(resolved);
      const ext = path.extname(defaultName).replace('.', '').toLowerCase();
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Save File As',
        defaultPath: defaultName,
        filters: ext
          ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }]
          : [{ name: 'All Files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      fs.copyFileSync(resolved, result.filePath);
      return { success: true, path: result.filePath, sourcePath: resolved };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:cleanup', async (_e, payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) => {
    try {
      const sharedRoot = getSharedFolderRoot();
      return { success: true, ...cleanupUploadsTemp(sharedRoot, payload) };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('uploads:cleanupSession', async (_e, payload?: { sessionKey?: string; agentId?: string }) => {
    try {
      const sharedRoot = getSharedFolderRoot();
      return cleanupSessionUploadsOnly(sharedRoot, payload);
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), removed: false, sessionKey: '' };
    }
  });

  ipcMain.handle('managedFiles:list', async (_e, payload?: {
    sessionKey?: string;
    agentId?: string;
    query?: string;
    kind?: 'uploads' | 'outputs' | 'voice';
    limit?: number;
    offset?: number;
    syncExists?: boolean;
  }) => {
    try {
      if (payload?.syncExists !== false) {
        pruneMissingManagedFileRefs(payload?.kind);
      }
      const selected = listManagedFileRefs({
        sessionKey: payload?.sessionKey ? sanitizeAttachmentSessionKey(payload.sessionKey) : '',
        agentId: payload?.agentId ? sanitizeAgentId(payload.agentId) : '',
        query: payload?.query,
        kind: payload?.kind,
        limit: payload?.limit,
        offset: payload?.offset,
      });
      const rows = selected.rows.map((row) => {
        const exists = fs.existsSync(row.path);
        const stat = exists ? fs.statSync(row.path) : null;
        return {
          name: path.basename(row.path),
          path: row.path,
          size: stat?.size || row.size || 0,
          modified: stat?.mtime.toISOString() || row.createdAt,
          ext: path.extname(row.path).replace(/^\./, '').toLowerCase(),
          mimeType: row.mimeType || guessMimeTypeByExt(row.path),
          kind: toManagedListKind(row.kind),
          content: '',
          exists,
          sessionKey: row.sessionKey,
          agentId: row.agentId,
          workspaceRoot: row.workspaceRoot,
          relativePath: row.relativePath,
          isCanonicalOutput: row.isCanonicalOutput,
        };
      });
      return { success: true, rows, total: selected.total, root: path.join(getOpenClawHomeDir(), 'index') };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), rows: [], total: 0 };
    }
  });

  ipcMain.handle('managedFiles:open', async (_e, filePath: string) => {
    try {
      const target = path.resolve(String(filePath || ''));
      if (!target) return { success: false, error: 'invalid_path' };
      if (!fs.existsSync(target)) return { success: false, error: 'not_found', path: target };
      const result = await shell.openPath(target);
      if (result) {
        // Fallback for environments without a default opener:
        // reveal the file so users still get a visible outcome from "Open".
        shell.showItemInFolder(target);
        return { success: true, path: target, fallback: 'reveal', warning: result };
      }
      return { success: true, path: target };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:reveal', async (_e, filePath: string) => {
    try {
      const target = path.resolve(String(filePath || ''));
      if (!fs.existsSync(target)) return { success: false, error: 'not_found' };
      shell.showItemInFolder(target);
      return { success: true, path: target };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:exists', async (_e, filePath: string) => {
    try {
      const target = path.resolve(String(filePath || ''));
      return { success: true, exists: fs.existsSync(target), path: target };
    } catch (error: any) {
      return { success: false, exists: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:read', async (_e, payload?: { path?: string }) => {
    try {
      const target = path.resolve(String(payload?.path || ''));
      if (!fs.existsSync(target)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(target);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      if (stat.size > 30 * 1024 * 1024) return { success: false, error: 'too_large', size: stat.size };
      return { success: true, data: fs.readFileSync(target).toString('base64'), mimeType: guessMimeTypeByExt(target) };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:delete', async (_e, payload?: { path?: string }) => {
    try {
      const target = path.resolve(String(payload?.path || ''));
      if (!fs.existsSync(target)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(target);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      fs.unlinkSync(target);
      removeManagedFileRefByPath(target);
      return { success: true, path: target };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:removeRef', async (_e, payload?: { path?: string; kind?: 'uploads' | 'outputs' | 'voice' }) => {
    try {
      const target = path.resolve(String(payload?.path || ''));
      const removed = removeManagedFileRefByPath(target, payload?.kind);
      if (!removed) return { success: false, error: 'not_managed_ref' };
      return { success: true, path: target };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:saveAs', async (_e, payload?: { path?: string }) => {
    try {
      const target = path.resolve(String(payload?.path || ''));
      if (!fs.existsSync(target)) return { success: false, error: 'not_found' };
      const stat = fs.statSync(target);
      if (!stat.isFile()) return { success: false, error: 'not_file' };
      const defaultName = path.basename(target);
      const ext = path.extname(defaultName).replace('.', '').toLowerCase();
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Save File As',
        defaultPath: defaultName,
        filters: ext
          ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }]
          : [{ name: 'All Files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      fs.copyFileSync(target, result.filePath);
      return { success: true, path: result.filePath, sourcePath: target };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('managedFiles:captureOutputs', async (_e, payload?: { sessionKey?: string; agentId?: string; text?: string; runId?: string | null }) => {
    try {
      return await captureOutputsToManagedIndex(payload);
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), refs: [] };
    }
  });

  ipcMain.handle('managedFiles:cleanupSessionRefs', async (_e, payload?: { sessionKey?: string; agentId?: string; kind?: 'uploads' | 'outputs' | 'voice' }) => {
    try {
      const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
      const safeAgentId = sanitizeAgentId(payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey));
      const all = listManagedFileRefs({ kind: payload?.kind, limit: 100000 }).rows;
      const matches = all.filter((row) =>
        row.sessionKey === safeSessionKey &&
        (!payload?.agentId || row.agentId === safeAgentId),
      );
      for (const row of matches) {
        removeManagedFileRefByPath(row.path, row.kind);
      }
      const removed = matches.length > 0;
      return { success: true, removed, sessionKey: safeSessionKey };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), removed: false, sessionKey: '' };
    }
  });

  ipcMain.handle(
    'voice:save',
    async (_e, filename: string, base64: string, sessionKey?: string, agentId?: string) => {
      try {
        const safeFilename = path.basename(String(filename || `voice-${Date.now()}.webm`));
        const safeAgentId = sanitizeAgentId(agentId || parseAgentIdFromSessionKey(sessionKey));
        const safeSessionKey = sanitizeAttachmentSessionKey(sessionKey);
        const day = getDateBucket();
        const workspaceRoot = resolveAgentWorkspaceDir(safeAgentId);
        const voiceDir = path.join(workspaceRoot, 'voice', safeSessionKey, day);
        if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });
        const filePath = path.join(voiceDir, safeFilename);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        const stat = fs.statSync(filePath);
        upsertManagedFileRefs([
          {
            kind: 'voice',
            path: filePath,
            agentId: safeAgentId,
            sessionKey: safeSessionKey,
            workspaceRoot,
            relativePath: path.relative(workspaceRoot, filePath),
            mimeType: guessMimeTypeByExt(filePath),
            size: stat.size,
            createdAt: new Date().toISOString(),
          },
        ]);
        return filePath;
      } catch (err: any) {
        console.error('[Voice] Save failed:', err?.message || err);
        return null;
      }
    },
  );

  ipcMain.handle('voice:read', async (_e, filePath: string) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : (() => {
            for (const entry of getWorkspaceRootsByAgent()) {
              const candidate = path.resolve(path.join(entry.workspaceRoot, 'voice', filePath));
              if (fs.existsSync(candidate)) return candidate;
            }
            return path.resolve(filePath);
          })();
      if (!fs.existsSync(resolvedPath)) return null;
      return fs.readFileSync(resolvedPath).toString('base64');
    } catch {
      return null;
    }
  });

  ipcMain.handle('voice:cleanupSession', async (_e, payload?: { sessionKey?: string; agentId?: string }) => {
    try {
      const sharedRoot = getSharedFolderRoot();
      return cleanupSessionVoiceOnly(sharedRoot, payload);
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), removed: false, sessionKey: '' };
    }
  });

  ipcMain.handle('voice:cleanupExpired', async (_e, payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) => {
    try {
      const sharedRoot = getSharedFolderRoot();
      return { success: true, ...cleanupVoiceTemp(sharedRoot, payload) };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  // ── Conversation temp files (voice + staged uploads under shared folder) ──
  ipcMain.handle('attachments:stage', async (_e, payload) => {
    try {
      const sharedRoot = getSharedFolderRoot();
      const result = stageConversationAttachments(sharedRoot, payload);
      if (result?.success && Array.isArray(result.staged) && result.staged.length > 0) {
        const safeAgentId = sanitizeAgentId(payload?.agentId || parseAgentIdFromSessionKey(payload?.sessionKey));
        const safeSessionKey = sanitizeAttachmentSessionKey(payload?.sessionKey);
        const workspaceRoot = resolveAgentWorkspaceDir(safeAgentId);
        const now = new Date().toISOString();
        const refs = result.staged.map((item: any) => ({
          kind: 'upload' as ManagedFileKind,
          path: String(item.path || ''),
          agentId: safeAgentId,
          sessionKey: safeSessionKey,
          workspaceRoot,
          relativePath: path.relative(workspaceRoot, String(item.path || '')),
          mimeType: String(item.mimeType || guessMimeTypeByExt(String(item.path || ''))),
          size: typeof item.size === 'number' ? item.size : undefined,
          createdAt: now,
        })).filter((row) => row.path);
        if (refs.length > 0) upsertManagedFileRefs(refs);
      }
      return result;
    } catch (error: any) {
      return { success: false, error: error?.message || String(error), staged: [] };
    }
  });

  ipcMain.handle(
    'attachments:cleanup',
    async (_e, payload?: { ttlMs?: number; maxTotalBytes?: number; dryRun?: boolean }) => {
      try {
        const sharedRoot = getSharedFolderRoot();
        const result = cleanupConversationAttachmentTemp(sharedRoot, {
          ttlMs: payload?.ttlMs,
          maxTotalBytes: payload?.maxTotalBytes,
          dryRun: payload?.dryRun,
        });
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    },
  );

  ipcMain.handle(
    'attachments:cleanupSession',
    async (_e, payload?: { sessionKey?: string; agentId?: string }) => {
      try {
        const sharedRoot = getSharedFolderRoot();
        return cleanupSessionAttachmentStaging(sharedRoot, payload);
      } catch (error: any) {
        return { success: false, error: error?.message || String(error), removed: false, sessionKey: '' };
      }
    },
  );

  // ── PTY ──
  ipcMain.handle('pty:create', (_e, options?: { cols?: number; rows?: number; cwd?: string }) => {
    if (!pty) return { id: null, error: 'Terminal not available' };
    try {
      const id = `pty-${++ptyCounter}`;
      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
      );
      // Prepend bundled openclaw wrapper to PATH so in-app terminal can run `openclaw`
      const nm = new NodeManager(OPENCLAW_PORT);
      const paths = nm.getBundledOpenclawPaths();
      if (paths.node && paths.openclawMjs) {
        const binDir = ensureOpenclawWrapper(app.getPath('userData'), paths.node, paths.openclawMjs);
        if (binDir) {
          const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
          const existing = env[pathKey] || process.env[pathKey] || '';
          env[pathKey] = existing ? `${binDir}${path.delimiter}${existing}` : binDir;
        }
      }
      const ptyProcess = pty!.spawn(shell, [], {
        name: 'xterm-256color', cols: options?.cols || 80, rows: options?.rows || 24,
        cwd: options?.cwd || os.homedir(), env,
      });
      ptyProcesses.set(id, ptyProcess);
      ptyProcess.onData((data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pty:data', id, data); });
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pty:exit', id, exitCode, signal);
        ptyProcesses.delete(id);
      });
      return { id, pid: ptyProcess.pid };
    } catch (err: any) {
      return { id: null, error: err.message };
    }
  });
  ipcMain.handle('pty:write', (_e, id: string, data: string) => { ptyProcesses.get(id)?.write(data); });
  ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) => { try { ptyProcesses.get(id)?.resize(cols, rows); } catch {} });
  ipcMain.handle('pty:kill', (_e, id: string) => { const p = ptyProcesses.get(id); if (p) { p.kill(); ptyProcesses.delete(id); } });

  // ── Secrets ──
  ipcMain.handle('secrets:audit', async () => {
    const result = spawnSync('openclaw', ['secrets', 'audit'], { timeout: 12000, shell: true, encoding: 'utf-8' as const });
    if (result.error) return { success: false, error: (result.error as Error).message };
    const statusMap: Record<number, string> = { 0: 'clean', 1: 'findings', 2: 'unresolved' };
    return { success: true, data: { status: statusMap[result.status ?? -1] ?? 'unknown', rawOutput: (result.stdout ?? '').trim(), exitCode: result.status } };
  });
  ipcMain.handle('secrets:reload', async () => {
    const result = spawnSync('openclaw', ['secrets', 'reload'], { timeout: 10000, shell: true, encoding: 'utf-8' as const });
    if (result.error) return { success: false, error: (result.error as Error).message };
    if (result.status !== 0) return { success: false, error: (result.stderr ?? '').trim() };
    return { success: true };
  });

  // ── Console UI — open Gateway Web UI in a dedicated window ──
  ipcMain.handle('consoleUi:open', async (_e, url?: string) => {
    return openConsoleWindow(url);
  });

  ipcMain.handle('clawhub:openLogin', async () => {
    return openClawHubLoginWindow();
  });

  ipcMain.handle('clawhub:loginCli', async () => {
    const skillHubEnv = getSkillHubEnv();
    const spec = getClawHubCliSpec(skillHubEnv);
    if (!spec) {
      return { success: false, error: 'ClawHub CLI not found' };
    }

    try {
      const cliEnv = getClawHubCliEnv(skillHubEnv);
      const child = require('child_process').spawn(
        spec.command,
        [...spec.argsPrefix, 'login', '--site', CLAWHUB_SITE_URL, '--registry', CLAWHUB_REGISTRY_URL],
        {
          cwd: cliEnv.cwd,
          env: cliEnv.env,
          detached: true,
          stdio: 'ignore',
        },
      );
      child.unref();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('clawhub:authStatus', async () => {
    return getClawHubAuthStatus(getSkillHubEnv());
  });

  ipcMain.handle('clawhub:searchCli', async (_e, { query, limit }: { query: string; limit?: number }) => {
    return searchClawHubViaCli(getSkillHubEnv(), query, Math.max(1, Math.min(limit ?? 30, 50)));
  });

  ipcMain.handle('clawhub:fetchJson', async (_e, { url }: { url: string }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return { ok: false, status: 400, retryAfter: null, data: { error: 'Invalid protocol' } };
      if (parsed.hostname !== 'clawhub.ai') return { ok: false, status: 400, retryAfter: null, data: { error: 'Invalid host' } };
      if (!parsed.pathname.startsWith('/api/v1/')) return { ok: false, status: 400, retryAfter: null, data: { error: 'Invalid path' } };

      const { session: electronSession } = require('electron');
      const s = electronSession.fromPartition('persist:clawhub');
      const cookies = await s.cookies.get({ url: parsed.origin });
      const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

      const res = await fetch(url, {
        headers: {
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          accept: 'application/json',
        },
      });

      const retryAfter = res.headers.get('retry-after');
      if (!res.ok) return { ok: false, status: res.status, retryAfter, data: null };
      const data = await res.json();
      return { ok: true, status: res.status, retryAfter, data };
    } catch (err: any) {
      return { ok: false, status: 500, retryAfter: null, data: { error: err?.message ?? String(err) } };
    }
  });

  // ── Log viewer: explicit targets (gateway vs desktop main process) ──
  const openFirstExistingPath = (candidates: string[], label: string) => {
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      shell.openPath(p);
      log.info(`[Logs] Opened ${label}:`, p);
      return { success: true, path: p };
    }
    return { success: false, error: `${label}_not_found` };
  };

  ipcMain.handle('logs:openGatewayLogFile', () => {
    try {
      const home = os.homedir();
      const gatewayLogCandidates = [
        path.join(home, '.openclaw', 'logs', 'openclaw.log'),
        path.join(home, '.openclaw', 'openclaw.log'),
        path.join(home, '.openclaw', 'logs'),
        path.join(home, '.openclaw'),
      ];
      return openFirstExistingPath(gatewayLogCandidates, 'gateway_log');
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('logs:openDesktopLogFile', () => {
    try {
      const electronLogDir = app.getPath('logs');
      const electronLogCandidates = [
        path.join(electronLogDir, 'main.log'),
        electronLogDir,
      ];
      const resolved = openFirstExistingPath(electronLogCandidates, 'desktop_log');
      if (resolved.success) return resolved;
      // Fallback: open the default logs dir even if file not created yet
      shell.openPath(electronLogDir);
      return { success: true, path: electronLogDir };
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Backward-compatible alias used by older UI builds.
  ipcMain.handle('logs:openElectronLogFile', () => {
    try {
      const home = os.homedir();
      const gatewayLogCandidates = [
        path.join(home, '.openclaw', 'logs', 'openclaw.log'),
        path.join(home, '.openclaw', 'openclaw.log'),
        path.join(home, '.openclaw', 'logs'),
        path.join(home, '.openclaw'),
      ];
      return openFirstExistingPath(gatewayLogCandidates, 'gateway_log');
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ── SkillHub: Auto-install the skillhub CLI ──
  ipcMain.handle('skills:skillshub:installCli', async () => {
    const skillHubEnv = getSkillHubEnv();
    try {
      if (process.platform === 'win32') {
        execFileSync('powershell', [
          '-NoProfile', '-NonInteractive', '-Command',
          SKILLSHUB_CLI_INSTALL_CMD_WIN_PWSH,
        ], { timeout: 120_000, env: skillHubEnv });
      } else {
        execFileSync('/bin/bash', [
          '-c',
          SKILLSHUB_CLI_INSTALL_CMD_UNIX,
        ], { timeout: 120_000, env: skillHubEnv });
      }
      log.info('[SkillHub] CLI installed successfully');
      return { success: true };
    } catch (err: any) {
      const msg = formatExecError(err) || (err as Error).message || String(err);
      log.warn('[SkillHub] CLI install failed:', msg);
      return { success: false, error: msg };
    }
  });

  // ── SkillHub: Check if skillhub CLI is installed ──
  ipcMain.handle('skills:skillshub:check', () => {
    try {
      const skillHubEnv = getSkillHubEnv();
      const cliSpec = getSkillHubCliSpec(skillHubEnv);
      return { installed: Boolean(cliSpec), path: cliSpec?.command ?? null };
    } catch {
      return { installed: false, path: null };
    }
  });

  // ── SkillHub: Install a skill via skillhub CLI ──
  ipcMain.handle('skills:skillshub:install', async (_e, slug: string) => {
    if (!slug || typeof slug !== 'string') {
      return { success: false, error: 'Invalid slug' };
    }
    const skillHubEnv = getSkillHubEnv();
    const skillHubCli = getSkillHubCliSpec(skillHubEnv);
    if (!skillHubCli) {
      return { success: false, error: 'skillhub CLI not installed', needsSetup: true };
    }

    try {
      const openclawHome = getOpenClawHomeDir();
      fs.mkdirSync(openclawHome, { recursive: true });
      const managedSkillsDir = getManagedSkillsDir();
      fs.mkdirSync(managedSkillsDir, { recursive: true });
      const out = runExternalCommandSync(skillHubCli.command, [...skillHubCli.argsPrefix, 'install', slug, '--force'], {
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        env: skillHubEnv,
        cwd: openclawHome,
      });
      const output = String(out ?? '');
      const managedSkillPath = path.join(managedSkillsDir, slug);
      if (!fs.existsSync(path.join(managedSkillPath, 'SKILL.md'))) {
        const parsedPath = output
          .split(/\r?\n/)
          .map(line => line.match(/->\s*(.+)\s*$/)?.[1]?.trim() ?? '')
          .find(Boolean);
        const managedPath = moveSkillIntoManagedDir(slug, [
          parsedPath,
          path.join(os.homedir(), 'skills', slug),
          path.join(os.homedir(), '.skills', slug),
          ...getLegacyWorkspaceSkillsDirs().map(dir => path.join(dir, slug)),
        ]);
        if (managedPath) {
          log.info('[SkillHub] Normalized installed skill into managed directory:', slug, managedPath);
        }
      }
      if (!fs.existsSync(path.join(managedSkillPath, 'SKILL.md'))) {
        log.warn('[SkillHub] Install completed but skill not found in managed directory:', managedSkillPath, output);
        return { success: false, error: `Installed but not found at ${managedSkillPath}` };
      }
      log.info('[SkillHub] Installed skill:', slug, managedSkillPath);
      return { success: true };
    } catch (err: any) {
      const msg = formatExecError(err) || (err as Error).message || String(err);
      log.warn('[SkillHub] Install failed:', msg);
      return { success: false, error: msg, needsSetup: false };
    }
  });

  ipcMain.handle('skills:clawhub:install', async (_e, slug: string) => {
    if (!slug || typeof slug !== 'string') {
      return { success: false, error: 'Invalid slug' };
    }

    const skillHubEnv = getSkillHubEnv();
    const openclawBinary = resolveOpenclawBinary(skillHubEnv);
    if (!openclawBinary) {
      return { success: false, error: 'openclaw CLI not found' };
    }

    const openclawHome = getOpenClawHomeDir();
    fs.mkdirSync(openclawHome, { recursive: true });
    const managedSkillsDir = getManagedSkillsDir();
    fs.mkdirSync(managedSkillsDir, { recursive: true });

    try {
      const out = runExternalCommandSync(openclawBinary, ['skills', 'install', slug], {
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        env: skillHubEnv,
        cwd: openclawHome,
      });
      const output = String(out ?? '');
      const managedSkillPath = path.join(managedSkillsDir, slug);
      if (!fs.existsSync(path.join(managedSkillPath, 'SKILL.md'))) {
        const parsedPath = output
          .split(/\r?\n/)
          .map(line => line.match(/->\s*(.+)\s*$/)?.[1]?.trim() ?? '')
          .find(Boolean);
        const managedPath = moveSkillIntoManagedDir(slug, [
          parsedPath,
          ...getLegacyWorkspaceSkillsDirs().map(dir => path.join(dir, slug)),
        ]);
        if (managedPath) {
          log.info('[ClawHub] Normalized installed skill into managed directory:', slug, managedPath);
        }
      }
      if (!fs.existsSync(path.join(managedSkillPath, 'SKILL.md'))) {
        log.warn('[ClawHub] Install completed but skill not found in managed directory:', managedSkillPath, output);
        return { success: false, error: `Installed but not found at ${managedSkillPath}` };
      }
      log.info('[ClawHub] Installed skill via openclaw:', slug, managedSkillPath);
      return { success: true };
    } catch (err: any) {
      const openclawMsg = formatExecError(err);
      const rateLimited = /\b429\b|rate limit exceeded/i.test(openclawMsg);

      if (rateLimited) {
        const authStatus = getClawHubAuthStatus(skillHubEnv);
        if (!authStatus.available) {
          const message = 'ClawHub 下载被限流（429）。当前无法检测 ClawHub 登录状态，请先安装并登录 ClawHub CLI 后重试。';
          log.warn('[ClawHub] Install hit 429 and auth status is unavailable:', openclawMsg);
          return { success: false, error: message, needsLogin: true, authStatus };
        }
        if (!authStatus.loggedIn) {
          const message = 'ClawHub 下载被限流（429）。当前未检测到 ClawHub 登录状态，请先登录 ClawHub 后重试。';
          log.warn('[ClawHub] Install hit 429 while logged out:', openclawMsg);
          return { success: false, error: message, needsLogin: true, authStatus };
        }
        const message = 'ClawHub 下载被限流（429），已检测到登录状态。这是 ClawHub 服务端限流，请稍后重试。';
        log.warn('[ClawHub] Install hit 429 while logged in:', openclawMsg);
        return { success: false, error: message, needsLogin: false, authStatus };
      }

      log.warn('[ClawHub] Install failed:', openclawMsg);
      return { success: false, error: openclawMsg };
    }
  });

  // ── Skills: Delete a managed skill ──
  ipcMain.handle('skills:delete', async (_e, skillKey: string) => {
    // Only allow deleting from the managed skills directory to prevent accidental damage
    const skillsDir = getManagedSkillsDir();
    // Sanitize: strip any path separators so callers can only target a direct child
    const safeName = path.basename(skillKey);
    if (!safeName || safeName === '.' || safeName === '..') {
      return { success: false, error: 'Invalid skill key' };
    }
    const targetDir = path.join(skillsDir, safeName);
    if (!fs.existsSync(targetDir)) {
      return { success: false, error: 'Skill directory not found' };
    }
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      log.info('[Skills] Deleted skill:', targetDir);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('skills:listManaged', async () => {
    try {
      return { success: true, skills: listManagedSkills() };
    } catch (err: any) {
      return { success: false, skills: [], error: (err as Error).message };
    }
  });

  // ── Skills: Import local skill from folder ──
  ipcMain.handle('skills:importFolder', async () => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Skill Folder',
      buttonLabel: 'Import Skill',
    });
    if (canceled || filePaths.length === 0) return { success: false, error: 'canceled' };

    const srcPath = filePaths[0];
    // Must contain SKILL.md to be a valid skill
    if (!fs.existsSync(path.join(srcPath, 'SKILL.md'))) {
      return { success: false, error: 'Not a valid skill folder: SKILL.md not found' };
    }

    const skillName = path.basename(srcPath);
    const skillsDir = getManagedSkillsDir();
    const destPath  = path.join(skillsDir, skillName);
    try {
      fs.mkdirSync(skillsDir, { recursive: true });
      // Overwrite if already exists
      if (fs.existsSync(destPath)) fs.rmSync(destPath, { recursive: true, force: true });
      fs.cpSync(srcPath, destPath, { recursive: true });
      log.info('[Skills] Imported from folder:', destPath);
      return { success: true, skillName, path: destPath };
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ── Skills: Import local skill from ZIP ──
  ipcMain.handle('skills:importZip', async () => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      title: 'Select Skill ZIP',
      buttonLabel: 'Import Skill',
    });
    if (canceled || filePaths.length === 0) return { success: false, error: 'canceled' };

    const zipPath = filePaths[0];
    const tmpDir  = path.join(os.tmpdir(), `openclaw-skill-import-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Extract — unzip on Mac/Linux, Expand-Archive on Windows
      if (process.platform === 'win32') {
        execFileSync('powershell', [
          '-NoProfile', '-NonInteractive', '-Command',
          `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmpDir}' -Force`,
        ], { timeout: 30_000 });
      } else {
        execFileSync('unzip', ['-q', zipPath, '-d', tmpDir], { timeout: 30_000 });
      }

      // Find SKILL.md — may be at root or one level inside a subfolder
      let skillRoot: string | null = null;
      if (fs.existsSync(path.join(tmpDir, 'SKILL.md'))) {
        skillRoot = tmpDir;
      } else {
        for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
          if (entry.isDirectory() && fs.existsSync(path.join(tmpDir, entry.name, 'SKILL.md'))) {
            skillRoot = path.join(tmpDir, entry.name);
            break;
          }
        }
      }
      if (!skillRoot) return { success: false, error: 'Not a valid skill ZIP: SKILL.md not found' };

      const skillName = skillRoot === tmpDir
        ? path.basename(zipPath, '.zip')
        : path.basename(skillRoot);

      const skillsDir = getManagedSkillsDir();
      const destPath  = path.join(skillsDir, skillName);
      fs.mkdirSync(skillsDir, { recursive: true });
      if (fs.existsSync(destPath)) fs.rmSync(destPath, { recursive: true, force: true });
      fs.cpSync(skillRoot, destPath, { recursive: true });
      log.info('[Skills] Imported from ZIP:', destPath);
      return { success: true, skillName, path: destPath };
    } catch (err: any) {
      return { success: false, error: (err as Error).message };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Global Hotkey
// ═══════════════════════════════════════════════════════════

function registerHotkey(): void {
  try {
    globalShortcut.unregisterAll();
    if (config.globalHotkey) {
      globalShortcut.register(config.globalHotkey, () => {
        if (mainWindow?.isVisible() && mainWindow.isFocused()) { mainWindow.hide(); }
        else { mainWindow?.show(); mainWindow?.focus(); }
      });
    }
  } catch (e) {
    console.error('[Hotkey] Registration failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// Auto-Updater
// ═══════════════════════════════════════════════════════════

function setupAutoUpdater(): void {
  // Delegate to updater.ts which reads from this repository's Releases.
  setupUpdater();
}

// ═══════════════════════════════════════════════════════════
// Console UI Window
// Opens the OpenClaw Gateway's built-in Web UI in a separate window.
// ═══════════════════════════════════════════════════════════

async function openConsoleWindow(url?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const targetUrl = (url || `http://127.0.0.1:${OPENCLAW_PORT}`).replace(/\/$/, '');

    if (consoleWindow && !consoleWindow.isDestroyed()) {
      if (consoleWindow.isMinimized()) consoleWindow.restore();
      consoleWindow.show();
      consoleWindow.focus();
      return { success: true };
    }

    // ── Auth injection ─────────────────────────────────────────────────────
    // The Control UI SPA (ui/src/ui/app-settings.ts: applySettingsFromUrl) reads
    // the gateway token from the URL HASH fragment:
    //   const tokenRaw = hashParams.get("token");   // → "#token=..."
    // Query-param ?token= is stripped without being applied.
    //
    // Read the token fresh from disk (nodeManager.getToken() → ~/.openclaw/openclaw.json)
    // so we always get the current value, not the stale config.gatewayToken cache.
    const token = nodeManager?.getToken() ?? config.gatewayToken;

    // Use a persistent named session so non-auth settings survive window close/reopen
    const { session: electronSession } = require('electron');
    const consoleSession = electronSession.fromPartition('persist:openclaw-console');

    // ── Create window ──────────────────────────────────────────────────────
    consoleWindow = new BrowserWindow({
      width: 1280, height: 860, minWidth: 800, minHeight: 600,
      title: 'OpenClaw Console',
      backgroundColor: '#0d1117',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: consoleSession,
      },
    });

    // Append token as hash fragment so the SPA picks it up on startup.
    // The SPA cleans the hash after reading it (removes #token from the URL bar).
    const loadUrl = token
      ? `${targetUrl}#token=${encodeURIComponent(token)}`
      : targetUrl;

    consoleWindow.loadURL(loadUrl);
    consoleWindow.on('closed', () => { consoleWindow = null; });

    // Delegate new-window link clicks to the system browser
    consoleWindow.webContents.setWindowOpenHandler(({ url: href }) => {
      shell.openExternal(href);
      return { action: 'deny' };
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function openClawHubLoginWindow(): Promise<{ success: boolean; error?: string }> {
  try {
    if (clawHubLoginWindow && !clawHubLoginWindow.isDestroyed()) {
      if (clawHubLoginWindow.isMinimized()) clawHubLoginWindow.restore();
      clawHubLoginWindow.show();
      clawHubLoginWindow.focus();
      return { success: true };
    }

    const { session: electronSession } = require('electron');
    const s = electronSession.fromPartition('persist:clawhub');

    clawHubLoginWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 800,
      minHeight: 600,
      title: 'ClawHub',
      backgroundColor: '#0d1117',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: s,
      },
    });

    clawHubLoginWindow.webContents.setWindowOpenHandler(({ url: href }) => {
      shell.openExternal(href);
      return { action: 'deny' };
    });

    clawHubLoginWindow.on('closed', () => { clawHubLoginWindow = null; });
    clawHubLoginWindow.loadURL('https://clawhub.ai/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// Tray — macOS-aware icon selection
// ═══════════════════════════════════════════════════════════

function setupTray(): void {
  const trayIconPath = getResourcePath('icons', 'tray-icon.png');
  let trayImage = nativeImage.createFromPath(trayIconPath);
  if (trayImage.isEmpty()) {
    const fallbackPng = getResourcePath('icons', 'icon.png');
    trayImage = nativeImage.createFromPath(fallbackPng);
  }
  if (trayImage.isEmpty() && process.platform === 'win32') {
    const fallbackIco = getResourcePath('icons', 'icon.ico');
    trayImage = nativeImage.createFromPath(fallbackIco);
  }
  if (trayImage.isEmpty()) {
    console.warn('[Tray] Failed to load tray icon from known resource paths');
  }
  const resized = trayImage.resize({ width: 16, height: 16 });
  tray = new Tray(resized.isEmpty() ? trayImage : resized);
  tray.setToolTip('OpenClaw Desktop');

  const showMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Re-add the taskbar button on Windows before showing (hidden when window was closed to tray).
    if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    app.focus({ steal: true });
    setTimeout(() => { mainWindow?.setAlwaysOnTop(false); }, 150);
  };

  // macOS standard pattern: clicking the tray icon shows a context menu.
  // The 'click' event is unreliable on macOS (Electron 28+); setContextMenu
  // is the correct approach — put "Open" as the first item so it is one click away.
  // On Windows/Linux the menu also appears on right-click which is the expected behaviour.
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.open'), click: showMainWindow },
    { label: 'Console UI', click: () => void openConsoleWindow() },
    { type: 'separator' },
    { label: t('tray.close'), click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]));

  // Windows / Linux: left-click directly shows the window (click fires reliably there).
  // macOS: left-click opens the context menu via setContextMenu above.
  if (process.platform !== 'darwin') {
    tray.on('click', showMainWindow);
  }
}

// ═══════════════════════════════════════════════════════════
// App Lifecycle
// ═══════════════════════════════════════════════════════════

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS: clicking the Dock icon fires 'activate'.
  // Show the existing window if it is hidden; do nothing if already visible.
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadConfig();
    detectInstallerLanguage();
    initI18n(installerLangGlobal, (config as any).language ?? null);
    migrateLegacyClawHubWorkspaceSkills();

    createSplashWindow();
    setupIPC();
    createWindow();
    setupAutoUpdater();
    setupTray();
    registerHotkey();

    void startGateway()
      .then(() => {
        console.log('[App] Gateway ready');
        emitGatewayStatusChanged({ running: true, ready: true, error: null });
      })
      .catch((err) => {
        console.error('[App] Gateway failed to start:', err);
        gatewayBootError = String(err);
        if (nodeManager) gatewayBootLogs = nodeManager.getRecentLogs(100);
        emitGatewayStatusChanged({
          running: false,
          ready: false,
          error: gatewayBootError,
          logs: gatewayBootLogs,
        });
      });
  });
}

app.on('window-all-closed', () => {
  console.log('[App] All windows closed — staying in tray');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  for (const p of ptyProcesses.values()) {
    try { p.kill(); } catch {}
  }
  ptyProcesses.clear();
  // Prefer graceful stop so runtime can release resources cleanly.
  // NodeManager.stop() already escalates to SIGKILL after timeout if needed.
  nodeManager?.stop();
});

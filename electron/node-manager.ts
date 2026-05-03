import { spawn, ChildProcess, exec } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { app } from 'electron';

const execAsync = promisify(exec);

export interface OpenclawConfigValidation {
  valid: boolean;
  path: string;
  exists: boolean;
  error?: string;
}

export class NodeManager {
  private static readonly STARTUP_WARN_TIMEOUT_MS_WIN = 120000;
  private static readonly STARTUP_HIGH_RISK_TIMEOUT_MS_WIN = 240000;
  private static readonly STARTUP_STALL_TIMEOUT_MS_WIN = 360000;
  private static readonly STARTUP_TOTAL_TIMEOUT_MS_WIN = 420000;
  private static readonly STARTUP_STALL_TIMEOUT_MS_OTHER = 45000;
  private process: ChildProcess | null = null;
  private readonly serverPort: number;
  private readonly maxRetries: number;
  private retryCount: number = 0;
  private isReady: boolean = false;
  private startTime: number = 0;
  private lastProgressTime: number = 0;
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];
  private dashboardUrl: string | null = null;
  // Set when the gateway exits due to schema-level config validation errors.
  // Used by waitForReady() to fail fast and by handleExit() to suppress blind retries.
  private configErrorDetected: boolean = false;
  // Set when Desktop connects to an already-running OpenClaw gateway (e.g. CLI install)
  // rather than spawning the bundled one.  stop/forceStop must not kill gateways we don't own.
  private isAdopted: boolean = false;

  constructor(serverPort: number = 18789, maxRetries: number = 3) {
    this.serverPort = serverPort;
    this.maxRetries = maxRetries;
  }

  /**
   * Validates ~/.openclaw/openclaw.json before starting the gateway.
   * Returns valid=true if the file doesn't exist (gateway will create it).
   */
  static validateOpenclawConfig(homeDir: string = os.homedir()): OpenclawConfigValidation {
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) {
      return { valid: true, path: configPath, exists: false };
    }
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      JSON.parse(raw);
      return { valid: true, path: configPath, exists: true };
    } catch (err: any) {
      return { valid: false, path: configPath, exists: true, error: err.message };
    }
  }

  /**
   * Returns true if an OpenClaw gateway is already listening on the given port.
   * Detection: any HTTP response on a port we expect to be ours (18789 is OpenClaw-specific)
   * combined with a readable auth token in ~/.openclaw/openclaw.json.
   * Both conditions must hold so we don't accidentally adopt an unrelated web server.
   */
  private async probeOpenClawGateway(port: number): Promise<boolean> {
    // Fast check: if no token exists there is no OpenClaw config → not our gateway.
    if (!this.readGatewayToken()) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(2000),
      });
      // Any HTTP response (even 401/403) indicates a live HTTP server.
      // Port 18789 + valid openclaw.json token → treat as OpenClaw gateway.
      return res.status > 0;
    } catch {
      return false;
    }
  }

  /**
   * Attempts to free the port by killing the process occupying it.
   * Best-effort: does not throw on failure.
   *
   * Important: only target LISTEN sockets on POSIX systems.
   * Killing every PID that merely touches the port would also terminate
   * Electron itself while it is connected to the local gateway over WebSocket.
   */
  private async tryFreePort(port: number): Promise<void> {
    console.log(`[Gateway] Attempting to free port ${port}...`);
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const pids = new Set<string>();
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 5) {
            const localAddr = parts[1];
            if (localAddr.endsWith(`:${port}`)) {
              const pid = parts[parts.length - 1];
              if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
            }
          }
        }
        for (const pid of pids) {
          console.log(`[Gateway] Killing PID ${pid} holding port ${port}`);
          await execAsync(`taskkill /F /PID ${pid}`).catch(() => {});
        }
      } else {
        // macOS/Linux: only kill LISTEN sockets, not connected clients.
        const { stdout } = await execAsync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
        const pids = Array.from(
          new Set(
            stdout
              .split(/\s+/)
              .map((pid) => pid.trim())
              .filter((pid) => /^\d+$/.test(pid) && pid !== String(process.pid))
          )
        );
        for (const pid of pids) {
          console.log(`[Gateway] Killing listening PID ${pid} on port ${port}`);
          await execAsync(`kill -9 ${pid}`).catch(() => {});
        }
      }
      // Brief pause for the OS to release the port
      await new Promise<void>((r) => setTimeout(r, 1200));
    } catch {
      /* best-effort — log already printed above */
    }
  }

  async start(resetRetryCounter: boolean = true): Promise<void> {
    // Reset state so this method is safe to call multiple times (retry scenarios)
    this.isReady = false;
    this.isAdopted = false;
    this.stdoutBuffer = [];
    this.stderrBuffer = [];
    this.dashboardUrl = null;
    if (resetRetryCounter) this.retryCount = 0;
    this.configErrorDetected = false;
    this.lastProgressTime = Date.now();

    // If port is occupied, check whether it is already an OpenClaw gateway before killing it.
    // Scenario: user has the OpenClaw CLI installed and its gateway is running.
    // In that case we reuse ("adopt") the external gateway instead of forcibly replacing it.
    if (await this.isPortInUse(this.serverPort)) {
      const alreadyRunning = await this.probeOpenClawGateway(this.serverPort);
      if (alreadyRunning) {
        console.log(
          `[Gateway] Existing OpenClaw gateway detected on port ${this.serverPort} — adopting it instead of starting the bundled one.`
        );
        this.isAdopted = true;
        this.isReady = true;
        return;
      }

      // Something else is on the port — try to free it.
      await this.tryFreePort(this.serverPort);
      if (await this.isPortInUse(this.serverPort)) {
        throw new Error(
          `Port ${this.serverPort} is already in use.\n\n` +
          'A non-OpenClaw process is holding the gateway port and could not be stopped automatically.\n' +
          `To find it: lsof -i :${this.serverPort}\n` +
          'Or set OPENCLAW_PORT in .env to use a different port.'
        );
      }
      console.log(`[Gateway] Port ${this.serverPort} freed successfully`);
    }

    const nodePath = await this.findNode();
    if (!nodePath) {
      throw new Error(
        'Node.js 22+ not found.\n\n' +
        'Options:\n' +
        '  1. Install Node.js 22: https://nodejs.org/\n' +
        '  2. Set OPENCLAW_NODE_PATH in .env to your node binary path\n' +
        '  3. Run: npm run bundle:node  (bundles Node.js + OpenClaw into resources/)'
      );
    }

    const openclawPath = this.findOpenclawMjs();
    if (!openclawPath) {
      throw new Error(
        'openclaw.mjs not found.\n\n' +
        'Run: npm run bundle:node\n' +
        'This downloads Node.js and installs openclaw@latest into resources/node/'
      );
    }

    console.log(`Starting OpenClaw with Node.js: ${nodePath}`);
    console.log(`OpenClaw entry: ${openclawPath}`);
    console.log(`Gateway port: ${this.serverPort}`);

    this.startTime = Date.now();
    this.process = spawn(
      nodePath,
      [
        openclawPath,
        'gateway',
        '--port', String(this.serverPort),
        '--allow-unconfigured',   // start gateway even without prior `openclaw setup`
                                  // users complete configuration via the Control UI
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    this.process.on('error', this.handleError);
    this.process.on('exit', this.handleExit);

    this.process.stdout?.on('data', (data) => {
      const message = data.toString();
      this.stdoutBuffer.push(message);
      this.lastProgressTime = Date.now();
      console.log(`[OpenClaw] ${message.trim()}`);
      this.captureUrl(message);
      if (this.isReadyMessage(message)) this.isReady = true;
    });

    this.process.stderr?.on('data', (data) => {
      const message = data.toString();
      this.stderrBuffer.push(message);
      this.lastProgressTime = Date.now();
      console.error(`[OpenClaw ERR] ${message.trim()}`);
      this.captureUrl(message);
      if (this.isReadyMessage(message)) this.isReady = true;
    });
  }

  private isReadyMessage(msg: string): boolean {
    return (
      msg.includes('Gateway listening') ||
      msg.includes('listening on') ||
      msg.includes('running on port') ||
      msg.includes('started on') ||
      msg.includes('Control UI') ||
      msg.includes('ready')
    );
  }

  /**
   * Scans gateway output for a dashboard URL containing a token.
   * OpenClaw uses hash fragments for auth: http://127.0.0.1:18789/#token=abc123
   * (older versions may use query params: ?token=abc123)
   */
  private captureUrl(msg: string): void {
    if (this.dashboardUrl) return; // already captured
    // Match URLs with token in hash fragment (#token=) or query param (?token=)
    const match = msg.match(/https?:\/\/[^\s"']+[#?][^\s"']*token=[^\s"']+/i);
    if (match) {
      this.dashboardUrl = match[0].replace(/[,;]+$/, '').trim();
      console.log(`[OpenClaw] Dashboard URL captured: ${this.dashboardUrl}`);
    }
  }

  /**
   * Returns the URL to load in the Electron window.
   * Priority: URL captured from gateway stdout → token from config file → bare URL.
   */
  getDashboardUrl(): string {
    if (this.dashboardUrl) return this.dashboardUrl;

    const token = this.readGatewayToken();
    if (token) {
      // Use hash fragment (#token=) — the Control UI SPA only reads tokens from the hash
      const url = `http://127.0.0.1:${this.serverPort}/#token=${encodeURIComponent(token)}`;
      console.log(`[OpenClaw] Using token from config (hash fragment)`);
      return url;
    }

    console.warn('[OpenClaw] No token found — loading bare URL (auth may fail)');
    return `http://127.0.0.1:${this.serverPort}/`;
  }

  /** Gateway auth token for WebSocket / desktop frontend. */
  getToken(): string | null {
    return this.readGatewayToken();
  }

  /** WebSocket URL (no token). */
  getWsUrl(): string {
    return `ws://127.0.0.1:${this.serverPort}`;
  }

  /**
   * Reads the gateway token from ~/.openclaw/openclaw.json → gateway.auth.token.
   * Falls back to other known locations for forward compatibility.
   */
  private readGatewayToken(): string | null {
    const homeDir = os.homedir();
    const base = path.join(homeDir, '.openclaw');

    // Primary: openclaw.json → gateway.auth.token  (confirmed structure as of 2026.3.x)
    const candidates: Array<{ file: string; keys: string[] }> = [
      { file: path.join(base, 'openclaw.json'),  keys: ['gateway.auth.token', 'gateway.token', 'token'] },
      { file: path.join(base, 'config.json'),    keys: ['gateway.auth.token', 'gateway.token', 'token'] },
      { file: path.join(base, 'gateway.json'),   keys: ['auth.token', 'token'] },
    ];

    for (const { file, keys } of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        const raw = fs.readFileSync(file, 'utf-8').trim();
        let obj: Record<string, unknown>;
        try {
          obj = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // Treat as raw token string (single-line, no whitespace)
          if (raw && !raw.includes(' ') && !raw.includes('\n')) return raw;
          continue;
        }
        for (const key of keys) {
          const val = this.getNestedKey(obj, key);
          if (typeof val === 'string' && val.length > 0) {
            console.log(`[OpenClaw] Found token in ${file} (key: ${key})`);
            return val;
          }
        }
      } catch { /* skip unreadable files */ }
    }
    return null;
  }

  private getNestedKey(obj: Record<string, unknown>, dotPath: string): unknown {
    return dotPath.split('.').reduce<unknown>((cur, key) => {
      if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(true));
      server.once('listening', () => { server.close(); resolve(false); });
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Finds the Node.js binary to use, in priority order:
   * 1. Bundled Node.js in resources/node/ (production distribution)
   * 2. OPENCLAW_NODE_PATH environment variable override
   * 3. System Node.js ≥22 (development)
   */
  private async findNode(): Promise<string | null> {
    // 1. Bundled Node.js (production + post-bundle:node in dev)
    const bundled = this.getBundledNodePath();
    if (bundled && fs.existsSync(bundled) && (await this.isValidNode(bundled))) {
      console.log('Using bundled Node.js');
      return bundled;
    }

    // 2. Environment variable override
    const envPath = process.env.OPENCLAW_NODE_PATH;
    if (envPath && fs.existsSync(envPath) && (await this.isValidNode(envPath))) {
      console.log('Using OPENCLAW_NODE_PATH');
      return envPath;
    }

    // 3. System Node.js (dev mode)
    const system = await this.findSystemNode();
    if (system) {
      console.log('Using system Node.js');
      return system;
    }

    return null;
  }

  private getBundledNodePath(): string | null {
    const isWin = process.platform === 'win32';
    const bin = (nodeDir: string) => isWin
      ? path.join(nodeDir, 'node.exe')
      : path.join(nodeDir, 'bin', 'node');

    // Production: electron-builder extraResources copies resources/node-${arch} →
    //   Contents/Resources/node  (process.resourcesPath is the app's Resources dir)
    if (process.resourcesPath) {
      const prodBin = bin(path.join(process.resourcesPath, 'node'));
      if (fs.existsSync(prodBin)) return prodBin;
    }

    // Dev: bundle-node.sh creates resources/node-x64/ and resources/node-arm64/.
    // Pick the one matching the current Electron process architecture.
    const devArchBin = bin(path.join(__dirname, `../resources/node-${process.arch}`));
    if (fs.existsSync(devArchBin)) return devArchBin;

    // Fallback: old flat layout (resources/node/)
    const devBin = bin(path.join(__dirname, '../resources/node'));
    if (fs.existsSync(devBin)) return devBin;

    return null;
  }

  private async isValidNode(nodePath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`"${nodePath}" --version`);
      const match = stdout.trim().match(/v(\d+)\./);
      return match ? parseInt(match[1]) >= 22 : false;
    } catch {
      return false;
    }
  }

  private async findSystemNode(): Promise<string | null> {
    // Check explicit paths first — critical in packaged apps where PATH is minimal
    const candidates = process.platform === 'win32'
      ? ['node']
      : [
          '/opt/homebrew/bin/node',   // Apple Silicon Homebrew
          '/usr/local/bin/node',       // Intel Homebrew / standard
          '/usr/bin/node',
        ];

    for (const p of candidates) {
      if (await this.isValidNode(p)) {
        console.log(`Found Node.js at: ${p}`);
        return p;
      }
    }

    // Fallback: shell PATH lookup
    try {
      const cmd = process.platform === 'win32' ? 'where node' : 'which node';
      const { stdout } = await execAsync(cmd);
      const nodePath = stdout.trim().split('\n')[0];
      if (nodePath && (await this.isValidNode(nodePath))) return nodePath;
    } catch { /* not found in PATH */ }

    return null;
  }

  /**
   * Finds openclaw.mjs in resources/node/node_modules/openclaw/.
   * Works in both dev (after npm run bundle:node) and production.
   */
  private findOpenclawMjs(): string | null {
    const mjs = (nodeDir: string) =>
      path.join(nodeDir, 'node_modules', 'openclaw', 'openclaw.mjs');

    // Production: extraResources maps resources/node-${arch} → node
    if (app.isPackaged) {
      const prodMjs = mjs(path.join(process.resourcesPath, 'node'));
      if (fs.existsSync(prodMjs)) return prodMjs;
    }

    // Dev: arch-specific bundle directory
    const devArchMjs = mjs(path.join(__dirname, `../resources/node-${process.arch}`));
    if (fs.existsSync(devArchMjs)) return devArchMjs;

    // Fallback: old flat layout (resources/node/)
    const devMjs = mjs(path.join(__dirname, '../resources/node'));
    if (fs.existsSync(devMjs)) return devMjs;

    return null;
  }

  /**
   * Returns paths to bundled Node and openclaw.mjs (for in-app terminal so users can run `openclaw`).
   */
  getBundledOpenclawPaths(): { node: string | null; openclawMjs: string | null } {
    return { node: this.getBundledNodePath(), openclawMjs: this.findOpenclawMjs() };
  }

  /**
   * Reads the version of the bundled openclaw package from its package.json.
   * Returns null if not found or unreadable.
   */
  getBundledOpenclawVersion(): string | null {
    const pkgJson = (nodeDir: string) =>
      path.join(nodeDir, 'node_modules', 'openclaw', 'package.json');

    const candidates = app.isPackaged
      ? [pkgJson(path.join(process.resourcesPath, 'node'))]
      : [
          pkgJson(path.join(__dirname, `../resources/node-${process.arch}`)),
          pkgJson(path.join(__dirname, '../resources/node')),
        ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (typeof pkg.version === 'string') return pkg.version;
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  /** Whether the gateway stderr contains config schema validation failures. */
  private isConfigSchemaError(stderr: string): boolean {
    return (
      stderr.includes('Config invalid') ||
      stderr.includes('Invalid config at') ||
      stderr.includes('Run: openclaw doctor')
    );
  }

  /**
   * Extracts the human-readable config error lines from gateway stderr,
   * e.g. "- bindings.0: Invalid input".
   */
  getConfigErrorDetails(): string {
    const stderr = this.stderrBuffer.join('');
    const lines = stderr.split('\n');
    const errorLines: string[] = [];
    let inError = false;
    for (const line of lines) {
      if (line.includes('Config invalid') || line.includes('Invalid config at') || line.includes('Problem:')) {
        inError = true;
      }
      if (inError && line.trim()) errorLines.push(line.trim());
      if (inError && errorLines.length > 12) break;
    }
    return errorLines.join('\n') || stderr.slice(-500);
  }

  private async isPortAcceptingConnections(
    port: number,
    host: string = '127.0.0.1',
    timeoutMs: number = 400
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host });
      let settled = false;

      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeAllListeners();
        socket.destroy();
        resolve(ready);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);

      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.setTimeout(timeoutMs);
    });
  }

  /** True if gateway exited due to config schema validation errors. */
  hadConfigError(): boolean {
    return this.configErrorDetected;
  }

  async waitForReady(timeout: number = 180000): Promise<void> {
    const startTime = Date.now();
    const isWindows = process.platform === 'win32';
    const timeoutMs = isWindows ? Math.max(timeout, NodeManager.STARTUP_TOTAL_TIMEOUT_MS_WIN) : timeout;
    const warnTimeoutMs = isWindows ? NodeManager.STARTUP_WARN_TIMEOUT_MS_WIN : 0;
    const highRiskTimeoutMs = isWindows ? NodeManager.STARTUP_HIGH_RISK_TIMEOUT_MS_WIN : 0;
    const stallTimeoutMs = isWindows
      ? NodeManager.STARTUP_STALL_TIMEOUT_MS_WIN
      : NodeManager.STARTUP_STALL_TIMEOUT_MS_OTHER;
    let warnedLongStartup = false;
    let warnedHighRiskStartup = false;

    while (Date.now() - startTime < timeoutMs) {
      if (this.isReady) {
        console.log('OpenClaw gateway is ready');
        return;
      }

      // Fail fast: if the process has already exited, don't wait for the full timeout.
      // A null exitCode means still running; a number means it has terminated.
      const proc = this.process;
      if (proc && proc.exitCode !== null) {
        const stderr = this.stderrBuffer.join('');
        if (this.configErrorDetected || this.isConfigSchemaError(stderr)) {
          throw new Error(
            `CONFIG_SCHEMA_INVALID\n` +
            `The gateway rejected the config file due to validation errors.\n\n` +
            `${this.getConfigErrorDetails()}\n\n` +
            `The desktop app will automatically restore the previous config and retry.`
          );
        }
        throw new Error(
          `Gateway process exited unexpectedly (code ${proc.exitCode}).\n\n` +
          `Recent output:\n${this.stderrBuffer.slice(-8).join('\n')}`
        );
      }

      // Also scan buffered output for readiness markers
      const allOutput = this.stdoutBuffer.join('') + this.stderrBuffer.join('');
      if (this.isReadyMessage(allOutput)) {
        this.isReady = true;
        console.log('OpenClaw gateway is ready');
        return;
      }

      try {
        if (await this.isPortAcceptingConnections(this.serverPort)) {
          this.isReady = true;
          this.lastProgressTime = Date.now();
          console.log('OpenClaw gateway is accepting TCP connections');
          return;
        }
      } catch { /* not ready yet */ }

      // Poll the HTTP endpoint — any response (even 401) means gateway is up
      try {
        const response = await fetch(`http://127.0.0.1:${this.serverPort}/`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status > 0) {
          this.isReady = true;
          this.lastProgressTime = Date.now();
          console.log('OpenClaw gateway is ready');
          return;
        }
      } catch { /* not ready yet */ }

      // Windows cold starts can take much longer than macOS/Linux.
      // Emit progressive warnings first, fail only after prolonged no-progress stall.
      const stalledForMs = Date.now() - this.lastProgressTime;
      if (isWindows && !warnedLongStartup && stalledForMs >= warnTimeoutMs) {
        warnedLongStartup = true;
        console.warn(
          `[Gateway] Long startup warning (${Math.round(stalledForMs / 1000)}s without new logs). Continuing to wait.`
        );
      }
      if (isWindows && !warnedHighRiskStartup && stalledForMs >= highRiskTimeoutMs) {
        warnedHighRiskStartup = true;
        console.warn(
          `[Gateway] High-risk startup delay (${Math.round(stalledForMs / 1000)}s without new logs). Process still alive, still waiting.`
        );
      }
      if (stalledForMs >= stallTimeoutMs) {
        const proc = this.process;
        if (proc && proc.exitCode === null) {
          const stalledForSeconds = Math.round(stalledForMs / 1000);
          throw new Error(
            `GATEWAY_STARTUP_STALLED\n` +
            `OpenClaw gateway produced no startup progress for ${stalledForSeconds}s.\n\n` +
            `Recent output:\n${this.stderrBuffer.slice(-5).join('\n')}`
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    const lastProgressSeconds = Math.round((Date.now() - this.lastProgressTime) / 1000);
    throw new Error(
      `Timeout waiting for OpenClaw gateway after ${elapsedSeconds}s.\n\n` +
      `Last startup progress was ${lastProgressSeconds}s ago.\n\n` +
      'Recent output:\n' + this.stderrBuffer.slice(-5).join('\n')
    );
  }

  private handleError = (error: Error): void => {
    console.error('Node process error:', error);
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(`Retrying (${this.retryCount}/${this.maxRetries})...`);
      setTimeout(() => this.start(false), 2000);
    }
  };

  private handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    console.log(`Node process exited with code ${code} signal ${signal}`);

    // Fast exit (< 5s) = likely a fatal error — check for known patterns before retrying
    const uptime = Date.now() - this.startTime;
    if (code !== 0 && uptime < 5000) {
      const stderr = this.stderrBuffer.join('');

      if (stderr.includes('Cannot find module') || stderr.includes('MODULE_NOT_FOUND')) {
        console.error('OpenClaw module not found. Run: npm run bundle:node');
        return;
      }
      if (stderr.includes('Address already in use') || stderr.includes('EADDRINUSE')) {
        console.error(`Port ${this.serverPort} is already in use.`);
        return;
      }
      // Config schema validation failure: retrying with the same config is pointless.
      // waitForReady() will detect the exit and throw CONFIG_SCHEMA_INVALID, which
      // triggers auto-recovery in startGateway() before any retry.
      if (this.isConfigSchemaError(stderr)) {
        this.configErrorDetected = true;
        console.error('[Gateway] Config schema validation error — suppressing auto-retry');
        return;
      }
    }

    if (code !== 0 && code !== null && this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(`Restarting Node process (${this.retryCount}/${this.maxRetries})...`);
      setTimeout(() => this.start(false), 2000);
    }
  };

  stop(): void {
    // Never kill a gateway we didn't start.
    if (this.isAdopted) {
      console.log('[Gateway] External (adopted) gateway — skipping stop.');
      this.isAdopted = false;
      this.isReady = false;
      return;
    }
    if (!this.process) return;
    console.log('Stopping OpenClaw gateway...');
    // Clear the reference first so handleExit won't schedule an auto-restart.
    // Keep a local ref so the SIGKILL fallback timer can still reach the process.
    const proc = this.process;
    this.process = null;
    proc.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      try {
        if (!proc.killed) {
          console.log('Force killing OpenClaw gateway...');
          proc.kill('SIGKILL');
        }
      } catch { /* process already exited */ }
    }, 5000);
    // Cancel SIGKILL timer early if the process exits on its own.
    proc.once('exit', () => clearTimeout(killTimer));
  }

  /**
   * Immediately sends SIGKILL to the gateway process.
   * Use this on the app-quit path where we cannot wait for graceful shutdown.
   * Adopted (external) gateways are left running intentionally.
   */
  forceStop(): void {
    if (this.isAdopted) {
      console.log('[Gateway] External (adopted) gateway — skipping force stop; CLI gateway continues running.');
      this.isAdopted = false;
      this.isReady = false;
      return;
    }
    if (!this.process) return;
    console.log('Force-stopping OpenClaw gateway (app quit)...');
    const proc = this.process;
    this.process = null;
    try { proc.kill('SIGKILL'); } catch { /* already exited */ }
  }

  /** True when Desktop is connected to an external OpenClaw gateway (e.g. a CLI install). */
  isAdoptedGateway(): boolean {
    return this.isAdopted;
  }

  getRecentLogs(maxLines: number = 50): { stdout: string; stderr: string } {
    return {
      stdout: this.stdoutBuffer.slice(-maxLines).join('\n'),
      stderr: this.stderrBuffer.slice(-maxLines).join('\n'),
    };
  }

  isRunning(): boolean {
    return this.isAdopted || (this.process !== null && !this.process.killed);
  }

  isGatewayReady(): boolean {
    return this.isReady;
  }
}

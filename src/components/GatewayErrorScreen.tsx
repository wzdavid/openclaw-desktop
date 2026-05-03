// ═══════════════════════════════════════════════════════════
// GatewayErrorScreen — shown when the OpenClaw gateway process
// fails to start at boot time.  Replaces the old "show error
// dialog + quit" pattern so users can diagnose and recover
// without losing access to the app.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Terminal,
  FolderOpen,
} from 'lucide-react';

interface GatewayErrorScreenProps {
  error: string;
  logs?: { stdout: string; stderr: string };
  retrying?: boolean;
  onRetry: () => void;
  /** Called when gateway comes back up so App.tsx can dismiss this screen */
  onRecovered?: () => void;
}

type ErrorCategory =
  | 'config-invalid'
  | 'config-schema-invalid'
  | 'port-in-use'
  | 'timeout'
  | 'not-found'
  | 'crash'
  | 'unknown';

function categorize(error: string): ErrorCategory {
  if (error.includes('CONFIG_SCHEMA_INVALID')) return 'config-schema-invalid';
  if (error.includes('CONFIG_INVALID')) return 'config-invalid';
  if (error.includes('already in use') || error.includes('EADDRINUSE')) return 'port-in-use';
  if (error.includes('Timeout waiting')) return 'timeout';
  if (error.includes('not found') || error.includes('NODE_NOT_FOUND') || error.includes('openclaw.mjs')) return 'not-found';
  if (error.includes('code 1') || error.includes('crashed')) return 'crash';
  return 'unknown';
}

const categoryMeta: Record<ErrorCategory, { title: string; hint: string; color: string }> = {
  'config-invalid': {
    title: 'Config File Corrupted',
    hint: 'The openclaw.json config file contains invalid JSON. This can happen when a multi-agent conversation writes an incorrect config update. The app tried to restore the previous backup automatically. Use "Reset Config" to remove the broken file and let the gateway start fresh.',
    color: 'text-orange-400',
  },
  'config-schema-invalid': {
    title: 'Config Values Invalid',
    hint: 'The openclaw.json config file has invalid values (e.g. an unrecognized binding type or missing required field). This often happens when a multi-agent conversation writes an incorrect config. The app tried to restore your previous backup automatically — click Retry to try again, or Reset Config to start fresh.',
    color: 'text-orange-400',
  },
  'port-in-use': {
    title: 'Port Already in Use',
    hint: 'An unrelated process is occupying the gateway port and could not be stopped automatically. If you have another app using port 18789, close it and click Retry. If you have the OpenClaw CLI installed and its gateway is running, the Desktop will connect to it automatically — this error should not appear in that case.',
    color: 'text-yellow-400',
  },
  timeout: {
    title: 'Gateway Startup Timed Out',
    hint: 'The gateway process started but did not become ready in time. This can happen after a system sleep/wake cycle or under heavy load. Click Retry to try again.',
    color: 'text-yellow-400',
  },
  'not-found': {
    title: 'Gateway Not Found',
    hint: 'The bundled Node.js or openclaw.mjs could not be located. The installation may be incomplete. Try reinstalling OpenClaw Desktop.',
    color: 'text-red-400',
  },
  crash: {
    title: 'Gateway Crashed on Start',
    hint: 'The gateway process exited immediately. Check the logs below for details. A corrupted config file or missing dependency is the most common cause.',
    color: 'text-red-400',
  },
  unknown: {
    title: 'Gateway Failed to Start',
    hint: 'An unexpected error occurred. Check the logs below for details.',
    color: 'text-red-400',
  },
};

export function GatewayErrorScreen({
  error,
  logs,
  retrying = false,
  onRetry,
  onRecovered,
}: GatewayErrorScreenProps) {
  const category = categorize(error);
  const meta = categoryMeta[category];
  const isConfigInvalid = category === 'config-invalid' || category === 'config-schema-invalid';

  const [showLogs, setShowLogs] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const [configValidation, setConfigValidation] = useState<{
    valid: boolean;
    path: string;
    exists: boolean;
    error?: string;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Re-validate config file on mount (in case the error message isn't CONFIG_INVALID
  // but the file is still broken — e.g. crash triggered by invalid config)
  useEffect(() => {
    if (window.aegis?.config?.validateOpenclawJson) {
      void window.aegis.config.validateOpenclawJson().then(setConfigValidation);
    }
  }, []);

  // Subscribe to gateway status-changed events from the main process
  useEffect(() => {
    if (!window.aegis?.gateway?.onStatusChanged) return;
    const unsub = window.aegis.gateway.onStatusChanged((status) => {
      if (status.running && !status.error) {
        onRecovered?.();
      }
    });
    return unsub;
  }, [onRecovered]);

  const handleResetConfig = useCallback(async () => {
    if (!window.aegis?.config?.backupAndResetOpenclaw) return;
    setResetting(true);
    setResetResult(null);
    try {
      const result = await window.aegis.config.backupAndResetOpenclaw();
      if (result.success) {
        setResetResult(
          result.backupPath
            ? `Backed up to: ${result.backupPath}`
            : 'Config file removed (it will be recreated on next start).'
        );
        // Refresh validation after reset
        if (window.aegis?.config?.validateOpenclawJson) {
          const v = await window.aegis.config.validateOpenclawJson();
          setConfigValidation(v);
        }
      } else {
        setResetResult(`Reset failed: ${result.error}`);
      }
    } finally {
      setResetting(false);
    }
  }, []);

  const handleOpenLogFile = useCallback(() => {
    if (window.aegis?.logs?.openElectronLogFile) {
      void window.aegis.logs.openElectronLogFile();
    }
  }, []);

  const errorBody = error
    .replace(/^CONFIG_SCHEMA_INVALID\n/, '')
    .replace(/^CONFIG_INVALID\n/, '')
    .split('\n')
    .filter(Boolean);

  const combinedLogs = [
    logs?.stdout?.trim(),
    logs?.stderr?.trim(),
  ]
    .filter(Boolean)
    .join('\n\n--- stderr ---\n\n');

  useEffect(() => {
    if (retrying) setShowLogs(true);
  }, [retrying]);

  useEffect(() => {
    if (!showLogs || !logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [combinedLogs, showLogs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-aegis-bg-solid">
      {/* Subtle noise/pattern background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, #4EC9B0 0%, transparent 50%), radial-gradient(circle at 80% 80%, #6C9FFF 0%, transparent 50%)',
        }} />
      </div>

      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-aegis-card-solid border border-aegis-border shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-red-500 via-orange-400 to-yellow-400" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className={`w-6 h-6 ${meta.color}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-aegis-text-primary mb-1">
                {meta.title}
              </h2>
              <p className="text-sm text-aegis-text-muted leading-relaxed">
                {meta.hint}
              </p>
            </div>
          </div>

          {/* Config validation badge */}
          {configValidation && !configValidation.valid && (
            <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-start gap-2">
              <FileText className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-orange-300 leading-relaxed">
                <span className="font-semibold">Invalid config file:</span>{' '}
                <span className="font-mono text-orange-200 break-all">{configValidation.path}</span>
                {configValidation.error && (
                  <div className="mt-1 text-orange-400/80">{configValidation.error}</div>
                )}
              </div>
            </div>
          )}

          {/* Error detail lines */}
          <div className="mb-4 p-3 rounded-lg bg-aegis-bg-primary border border-aegis-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Terminal className="w-3.5 h-3.5 text-aegis-text-muted" />
              <span className="text-xs font-semibold text-aegis-text-muted uppercase tracking-wider">Error Detail</span>
            </div>
            <div className="space-y-0.5">
              {errorBody.map((line, i) => (
                <p key={i} className="text-xs font-mono text-aegis-text-secondary leading-relaxed break-all">
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* Reset result */}
          {resetResult && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-green-300 leading-relaxed break-all">{resetResult}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={onRetry}
              disabled={retrying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-aegis-primary text-white text-sm font-medium hover:bg-aegis-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {retrying
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {retrying ? 'Retrying…' : 'Retry Gateway'}
            </button>

            {(isConfigInvalid || (configValidation && !configValidation.valid)) && (
              <button
                onClick={() => void handleResetConfig()}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600/80 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {resetting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                {resetting ? 'Resetting…' : 'Reset Config'}
              </button>
            )}

            <button
              onClick={handleOpenLogFile}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-aegis-card-hover text-aegis-text-secondary text-sm font-medium hover:text-aegis-text-primary border border-aegis-border transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Log File
            </button>
          </div>

          {/* Collapsible gateway logs */}
          {combinedLogs && (
            <div>
              <button
                onClick={() => setShowLogs((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-aegis-text-muted hover:text-aegis-text-secondary transition-colors mb-2"
              >
                {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showLogs ? 'Hide' : 'Show'} gateway logs
              </button>
              {showLogs && (
                <div
                  ref={logsContainerRef}
                  className="p-3 rounded-lg bg-black/40 border border-aegis-border max-h-48 overflow-y-auto"
                >
                  <pre className="text-xs font-mono text-aegis-text-muted whitespace-pre-wrap break-all leading-relaxed">
                    {combinedLogs}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

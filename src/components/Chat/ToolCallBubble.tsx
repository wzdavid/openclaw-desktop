// ═══════════════════════════════════════════════════════════
// ToolCallBubble — Console-style tool execution display
// Compact, minimal, information-dense — inspired by Control UI
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export interface ToolCallInfo {
  toolName: string;
  input?: Record<string, any>;
  output?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

// ── Tool category + style ─────────────────────────────────
type ToolCategory = 'search' | 'file' | 'exec' | 'memory' | 'agent' | 'media' | 'misc';

const TOOL_REGISTRY: Record<string, { icon: string; label: string; category: ToolCategory }> = {
  web_search:      { icon: '🔍', label: 'Web Search',    category: 'search' },
  web_fetch:       { icon: '🌐', label: 'Fetch URL',     category: 'search' },
  browser:         { icon: '🖥️', label: 'Browser',       category: 'search' },
  Read:            { icon: '📄', label: 'Read File',     category: 'file' },
  Write:           { icon: '✍️', label: 'Write File',    category: 'file' },
  Edit:            { icon: '✏️', label: 'Edit File',     category: 'file' },
  exec:            { icon: '⚡', label: 'Execute',       category: 'exec' },
  process:         { icon: '⚙️', label: 'Process',       category: 'exec' },
  memory_search:   { icon: '🧠', label: 'Memory Search', category: 'memory' },
  memory_get:      { icon: '🧠', label: 'Memory Get',    category: 'memory' },
  sessions_spawn:  { icon: '🤖', label: 'Spawn Agent',  category: 'agent' },
  sessions_send:   { icon: '📨', label: 'Send Message', category: 'agent' },
  session_status:  { icon: '📊', label: 'Status',       category: 'agent' },
  cron:            { icon: '⏰', label: 'Cron',          category: 'misc' },
  image:           { icon: '🖼️', label: 'Image',         category: 'media' },
  tts:             { icon: '🔊', label: 'TTS',           category: 'media' },
  gateway:         { icon: '⚙️', label: 'Gateway',       category: 'misc' },
  message:         { icon: '💬', label: 'Message',       category: 'misc' },
};

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: 'text-blue-400',
  file:   'text-emerald-400',
  exec:   'text-amber-400',
  memory: 'text-purple-400',
  agent:  'text-rose-400',
  media:  'text-cyan-400',
  misc:   'text-aegis-text-dim',
};

function getToolInfo(name: string) {
  return TOOL_REGISTRY[name] || { icon: '🔧', label: name, category: 'misc' as ToolCategory };
}

function summarizeInput(toolName: string, input: Record<string, any>): string {
  void toolName;
  if (!input || Object.keys(input).length === 0) return '';
  const query = input.query || input.q || input.url || input.path || input.file_path
    || input.command || input.message || input.text || input.task;
  if (query && typeof query === 'string') {
    return query.length > 80 ? query.slice(0, 77) + '…' : query;
  }
  const first = Object.entries(input)[0];
  if (first) {
    const val = typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1]);
    const truncated = val.length > 60 ? val.slice(0, 57) + '…' : val;
    return `${first[0]}: ${truncated}`;
  }
  return '';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ToolCallBubbleProps {
  tool: ToolCallInfo;
}

export function ToolCallBubble({ tool }: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const info = getToolInfo(tool.toolName);
  const catColor = CATEGORY_COLORS[info.category];
  const summary = tool.input ? summarizeInput(tool.toolName, tool.input) : '';
  const hasDetails = !!(tool.input && Object.keys(tool.input).length > 0) || !!tool.output;

  return (
    <div className="px-14 py-[2px]">
      <div
        className={clsx(
          'rounded-lg transition-all duration-150',
          hasDetails && 'cursor-pointer',
          expanded
            ? 'border border-[rgb(var(--aegis-overlay)/0.10)] bg-[rgb(var(--aegis-overlay)/0.03)]'
            : 'hover:bg-[rgb(var(--aegis-overlay)/0.02)]',
        )}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        {/* ── Inline status row (Control UI style) ── */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 min-h-[28px]">
          {/* Status indicator */}
          {tool.status === 'running' ? (
            <Loader2 size={12} className="text-aegis-accent animate-spin shrink-0" />
          ) : tool.status === 'error' ? (
            <span className="w-3 h-3 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-aegis-danger" />
            </span>
          ) : (
            <span className="w-3 h-3 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-aegis-success/60" />
            </span>
          )}

          {/* Tool name */}
          <span className={clsx('text-[11px] font-medium shrink-0', catColor)}>
            {info.label}
          </span>

          {/* Summary / key param */}
          {summary && (
            <span className="text-[10px] text-aegis-text-dim/60 font-mono truncate min-w-0">
              {summary}
            </span>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Duration + expand */}
          <div className="flex items-center gap-1.5 shrink-0">
            {tool.durationMs !== undefined && tool.status !== 'running' && (
              <span className="text-[9px] text-aegis-text-dim/40 font-mono tabular-nums">
                {formatDuration(tool.durationMs)}
              </span>
            )}
            {hasDetails && (
              expanded
                ? <ChevronDown size={10} className="text-aegis-text-dim/30" />
                : <ChevronRight size={10} className="text-aegis-text-dim/30" />
            )}
          </div>
        </div>

        {/* ── Expanded detail panel ── */}
        {expanded && hasDetails && (
          <div className="border-t border-[rgb(var(--aegis-overlay)/0.06)] px-2.5 py-2 space-y-2">
            {tool.input && Object.keys(tool.input).length > 0 && (
              <div>
                <div className="text-[9px] font-medium text-aegis-text-dim/50 uppercase tracking-wider mb-1">Input</div>
                <pre className="text-[10px] font-mono text-aegis-text-muted/80 whitespace-pre-wrap break-all
                  bg-[rgb(var(--aegis-overlay)/0.04)] rounded-md p-2 max-h-[150px] overflow-auto
                  border border-[rgb(var(--aegis-overlay)/0.04)]"
                  dir="ltr">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            )}
            {tool.output && (
              <div>
                <div className="text-[9px] font-medium text-aegis-text-dim/50 uppercase tracking-wider mb-1">Output</div>
                <pre className="text-[10px] font-mono text-aegis-text-muted/80 whitespace-pre-wrap break-all
                  bg-[rgb(var(--aegis-overlay)/0.04)] rounded-md p-2 max-h-[200px] overflow-auto
                  border border-[rgb(var(--aegis-overlay)/0.04)]"
                  dir="ltr">
                  {tool.output.length > 1500
                    ? tool.output.slice(0, 1500) + '\n…(truncated)'
                    : tool.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

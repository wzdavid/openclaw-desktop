// ═══════════════════════════════════════════════════════════
// CodeInterpreter — Tool Execution / Sandbox View
// Displays all exec/process/file tool calls as terminal cards
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useChatStore } from '@/stores/chatStore';
import type { ToolBlock } from '@/types/RenderBlock';
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────

const FILTER_OPTIONS = ['All', 'exec', 'process', 'Read', 'Write', 'Edit'] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

// ── Helpers ───────────────────────────────────────────────

function getToolIcon(toolName: string): string {
  switch (toolName.toLowerCase()) {
    case 'exec':    return '⚡';
    case 'process': return '⚙️';
    case 'read':    return '📄';
    case 'write':   return '✍️';
    case 'edit':    return '✏️';
    default:        return '🔧';
  }
}

function getInputText(input?: Record<string, unknown>): string {
  if (!input) return '';
  if (typeof input.command === 'string') return input.command;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.file_path === 'string') return input.file_path;
  // Fallback: show first string value found
  for (const v of Object.values(input)) {
    if (typeof v === 'string') return v;
  }
  return JSON.stringify(input, null, 2);
}

function truncateLines(text: string, n: number): string {
  return text.split('\n').slice(0, n).join('\n');
}

// ── StatusBadge ───────────────────────────────────────────

function StatusBadge({ status }: { status: ToolBlock['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        running
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
      <XCircle className="h-3 w-3" />
      error
    </span>
  );
}

// ── CopyButton ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={t('codeInterpreter.copyOutput', 'Copy output')}
      className={clsx(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70',
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? t('common.copied', 'Copied') : t('common.copy', 'Copy')}
    </button>
  );
}

// ── ExecCard ──────────────────────────────────────────────

function ExecCard({ block }: { block: ToolBlock }) {
  const [expanded, setExpanded] = useState(false);

  const inputText = getInputText(block.input);
  const outputText = block.output ?? '';
  const outputLines = outputText.split('\n');
  const hasMoreOutput = outputLines.length > 3;
  const visibleOutput = expanded ? outputText : truncateLines(outputText, 3);

  const hasInput  = inputText.trim().length > 0;
  const hasOutput = outputText.trim().length > 0;

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 backdrop-blur-sm overflow-hidden">
      {/* ── Card Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/6">
        {/* Toggle expand */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-white/40 hover:text-white/70 transition-colors shrink-0"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Icon + name */}
        <span className="text-base select-none">{getToolIcon(block.toolName)}</span>
        <span className="font-mono text-sm font-semibold text-white/90">{block.toolName}</span>

        {/* Status */}
        <StatusBadge status={block.status} />

        <div className="flex-1" />

        {/* Duration */}
        {block.durationMs !== undefined && (
          <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
            <Clock className="h-3 w-3" />
            {(block.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* ── Input ── */}
      {hasInput && (
        <div className="px-4 pt-3 pb-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/30">
            Input
          </div>
          <pre className="overflow-x-auto rounded-lg bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-emerald-300 whitespace-pre-wrap break-words">
            {inputText}
          </pre>
        </div>
      )}

      {/* ── Output ── */}
      {hasOutput && (
        <div className="px-4 pt-2 pb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
              Output
            </span>
            <CopyButton text={outputText} />
          </div>
          <div
            className={clsx(
              'overflow-y-auto rounded-lg bg-black/30',
              !expanded && 'max-h-[300px]',
            )}
            style={expanded ? undefined : { maxHeight: '300px' }}
          >
            <pre className="px-3 py-2 font-mono text-xs leading-relaxed text-white/75 whitespace-pre-wrap break-words">
              {visibleOutput}
            </pre>
          </div>

          {/* Expand toggle for output lines */}
          {!expanded && hasMoreOutput && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
            >
              + {outputLines.length - 3} more lines — click to expand
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────

interface StatsBarProps {
  total: number;
  errors: number;
  running: number;
  avgDuration: number;
}

function StatsBar({ total, errors, running, avgDuration }: StatsBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3">
      <StatPill label={t('codeInterpreter.stats.total', 'Total')} value={total} color="default" />
      <StatPill label={t('codeInterpreter.stats.running', 'Running')} value={running} color="blue" />
      <StatPill label={t('codeInterpreter.stats.errors', 'Errors')} value={errors} color="red" />
      {total > 0 && (
        <StatPill
          label={t('codeInterpreter.stats.avgDuration', 'Avg')}
          value={`${(avgDuration / 1000).toFixed(1)}s`}
          color="default"
        />
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: 'default' | 'blue' | 'red';
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
        color === 'blue'  && 'bg-blue-500/10 text-blue-400',
        color === 'red'   && 'bg-red-500/10 text-red-400',
        color === 'default' && 'bg-white/6 text-white/60',
      )}
    >
      <span className="text-white/40">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export function CodeInterpreterPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');

  // Data
  const renderBlocks = useChatStore((s) => s.renderBlocks);

  const toolBlocks = useMemo(
    () => renderBlocks.filter((b): b is ToolBlock => b.type === 'tool'),
    [renderBlocks],
  );

  const stats = useMemo(
    () => ({
      total: toolBlocks.length,
      errors: toolBlocks.filter((t) => t.status === 'error').length,
      running: toolBlocks.filter((t) => t.status === 'running').length,
      avgDuration:
        toolBlocks
          .filter((t) => t.durationMs)
          .reduce((a, t) => a + (t.durationMs || 0), 0) /
        Math.max(toolBlocks.filter((t) => t.durationMs).length, 1),
    }),
    [toolBlocks],
  );

  const filteredBlocks = useMemo(() => {
    if (activeFilter === 'All') return toolBlocks;
    return toolBlocks.filter(
      (b) => b.toolName.toLowerCase() === activeFilter.toLowerCase(),
    );
  }, [toolBlocks, activeFilter]);

  return (
    <PageTransition className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">

        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
              <Terminal className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white/90">
                {t('codeInterpreter.title', 'Code Interpreter')}
              </h1>
              <p className="text-xs text-white/40">
                {t('codeInterpreter.subtitle', 'Tool execution sandbox — all exec & file operations')}
              </p>
            </div>
          </div>

          {/* Stats */}
          <StatsBar {...stats} />
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-white/30 shrink-0" />
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt === 'All'
                ? toolBlocks.length
                : toolBlocks.filter(
                    (b) => b.toolName.toLowerCase() === opt.toLowerCase(),
                  ).length;

            return (
              <button
                key={opt}
                onClick={() => setActiveFilter(opt)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeFilter === opt
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80',
                )}
              >
                <span>{getToolIcon(opt === 'All' ? '' : opt)}</span>
                {opt}
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    activeFilter === opt
                      ? 'bg-violet-500/30 text-violet-200'
                      : 'bg-white/8 text-white/40',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Execution Cards ── */}
        {filteredBlocks.length === 0 ? (
          <EmptyState activeFilter={activeFilter} />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredBlocks.map((block) => (
              <ExecCard key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

// ── Empty State ───────────────────────────────────────────

function EmptyState({ activeFilter }: { activeFilter: FilterOption }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
        <Terminal className="h-8 w-8 text-white/20" />
      </div>
      <div>
        <p className="text-base font-semibold text-white/40">
          {activeFilter === 'All'
            ? t('codeInterpreter.empty.noExecs', 'No tool executions yet')
            : t('codeInterpreter.empty.noFiltered', `No "${activeFilter}" executions found`)}
        </p>
        <p className="mt-1 text-xs text-white/25">
          {t(
            'codeInterpreter.empty.hint',
            'Tool calls will appear here as the agent executes commands',
          )}
        </p>
      </div>
    </div>
  );
}

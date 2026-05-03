// ═══════════════════════════════════════════════════════════
// ThinkingBubble — Console-style reasoning/thinking display
//
// Two modes:
//   1. Live streaming — expanded with accent border, auto-scroll
//   2. Finalized — collapsed inline pill, click to expand
//
// Aligned with ToolCallBubble layout (px-14 left margin)
// ═══════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface ThinkingBubbleProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBubble({ content, isStreaming = false }: ThinkingBubbleProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isStreaming);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming) setExpanded(true);
    else setExpanded(false);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  if (!content) return null;

  const lineCount = content.split('\n').length;
  const charCount = content.length;
  const sizeLabel = charCount > 1000 ? `${(charCount / 1000).toFixed(1)}k` : `${charCount}`;

  // ── Collapsed pill (finalized) ──
  if (!isStreaming && !expanded) {
    return (
      <div className="px-14 py-[2px]">
        <div
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 min-h-[28px] rounded-lg cursor-pointer
            hover:bg-[rgb(var(--aegis-overlay)/0.02)] transition-colors"
        >
          <span className="w-3 h-3 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/45" />
          </span>
          <span className="text-[11px] font-medium text-violet-300/70">
            {t('thinking.thoughtProcess', 'Thinking')}
          </span>
          <span className="text-[9px] text-aegis-text-dim/45 font-mono tabular-nums">
            {lineCount}L · {sizeLabel}c
          </span>
          <ChevronRight size={10} className="text-aegis-text-dim/30" />
        </div>
      </div>
    );
  }

  // ── Expanded / Streaming ──
  return (
    <div className="px-14 py-[2px]">
      <div
        className={clsx(
          'rounded-lg overflow-hidden transition-all duration-200',
          isStreaming
            ? 'border border-violet-500/10 bg-violet-500/[0.018]'
            : 'border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.02)]',
        )}
      >
        {/* Header row */}
        <div
          onClick={() => !isStreaming && setExpanded(false)}
          className={clsx(
            'flex items-center gap-2 px-2.5 py-1.5 min-h-[28px]',
            !isStreaming && 'cursor-pointer hover:bg-[rgb(var(--aegis-overlay)/0.02)]',
          )}
        >
          {isStreaming ? (
            <Loader2 size={12} className="text-violet-400/75 animate-spin shrink-0" />
          ) : (
            <span className="w-3 h-3 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400/45" />
            </span>
          )}

          <span className={clsx(
            'text-[11px] font-medium',
            isStreaming ? 'text-violet-300/75' : 'text-violet-300/70',
          )}>
            {isStreaming ? t('thinking.thinking', 'Thinking…') : t('thinking.thoughtProcess', 'Thinking')}
          </span>

          {!isStreaming && (
            <span className="text-[9px] text-aegis-text-dim/45 font-mono tabular-nums">
              {lineCount}L · {sizeLabel}c
            </span>
          )}

          <span className="flex-1" />

          {!isStreaming && (
            <ChevronDown size={10} className="text-aegis-text-dim/30 shrink-0" />
          )}

          {isStreaming && (
            <span className="flex items-center gap-[3px] shrink-0">
              <span className="w-[3px] h-[3px] rounded-full bg-violet-400/45 animate-pulse" />
              <span className="w-[3px] h-[3px] rounded-full bg-violet-400/45 animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-violet-400/45 animate-pulse" style={{ animationDelay: '0.3s' }} />
            </span>
          )}
        </div>

        {/* Content */}
        <div className="border-t border-[rgb(var(--aegis-overlay)/0.04)]">
          <div
            ref={contentRef}
            className={clsx(
              'px-2.5 py-2 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-words overflow-y-auto',
              isStreaming ? 'text-aegis-text-muted/58 max-h-[250px]' : 'text-aegis-text-dim/52 max-h-[300px]',
            )}
          >
            {content}
            {isStreaming && (
              <span className="inline-block w-[2px] h-[12px] bg-violet-400/35 ms-0.5 align-text-bottom animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import clsx from 'clsx';

interface SystemNoteBubbleProps {
  content: string;
}

export function SystemNoteBubble({ content }: SystemNoteBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content.trim()) return null;

  return (
    <div className="px-14 py-[2px]">
      <div
        className={clsx(
          'rounded-lg border border-sky-500/12 bg-sky-500/[0.03] transition-colors',
          'hover:bg-sky-500/[0.05]',
        )}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 min-h-[28px] text-left"
        >
          <Info size={12} className="text-sky-400/80 shrink-0" />
          <span className="text-[11px] font-medium text-sky-400/85">
            System Note
          </span>
          <span className="flex-1" />
          {expanded ? (
            <ChevronDown size={10} className="text-aegis-text-dim/40 shrink-0" />
          ) : (
            <ChevronRight size={10} className="text-aegis-text-dim/40 shrink-0" />
          )}
        </button>
        {expanded && (
          <div className="border-t border-sky-500/10 px-2.5 py-2">
            <pre className="text-[11px] leading-relaxed text-aegis-text-muted whitespace-pre-wrap break-words font-[inherit]">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

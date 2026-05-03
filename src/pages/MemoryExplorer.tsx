// ═══════════════════════════════════════════════════════════
// MemoryExplorer v2 — Graph + Timeline + Cards views
// Sidebar (search/categories/stats/recent) + Detail Panel
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Loader2, Plus, Pencil, Trash2, RefreshCw, Settings, X } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { dataColor } from '@/utils/theme-colors';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface Memory {
  id: number;
  content: string;
  category: string;
  importance: number;
  tags: string[];
  created_at: string;
  similarity?: number;
}

interface GraphNode extends Memory {
  x: number;
  y: number;
  size: number;
}

type ViewMode = 'graph' | 'timeline' | 'cards';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

/** Category config — labels resolved via i18n at render time */
const CATEGORY_KEYS = [
  { key: 'all',         i18nKey: 'memoryExplorer.catAll',       colorIdx: 1,  icon: '🧠' },
  { key: 'technical',   i18nKey: 'memoryExplorer.catTechnical', colorIdx: 9,  icon: '⚙️' },
  { key: 'projects',    i18nKey: 'memoryExplorer.catProjects',  colorIdx: 5,  icon: '📦' },
  { key: 'decisions',   i18nKey: 'memoryExplorer.catDecisions', colorIdx: 2,  icon: '💡' },
  { key: 'preferences', i18nKey: 'memoryExplorer.catPreferences', colorIdx: 3, icon: '💜' },
  { key: 'people',      i18nKey: 'memoryExplorer.catPeople',    colorIdx: 7,  icon: '👥' },
  { key: 'skills',      i18nKey: 'memoryExplorer.catSkills',    colorIdx: 6,  icon: '🎯' },
  { key: 'events',      i18nKey: 'memoryExplorer.catEvents',    colorIdx: 2,  icon: '📅' },
  { key: 'general',     i18nKey: 'memoryExplorer.catGeneral',   colorIdx: 9,  icon: '📝' },
] as const;

/** Called at render time — dataColor reads current theme */
const getCatColor = (cat: string): string => {
  const found = CATEGORY_KEYS.find(c => c.key === cat);
  return found ? dataColor(found.colorIdx) : dataColor(9);
};

const getCatIcon = (cat: string): string =>
  CATEGORY_KEYS.find(c => c.key === cat)?.icon || '📝';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function timeAgoShort(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function extractTitle(mem: Memory): string {
  if (mem.tags?.length > 0) {
    return mem.tags[0].replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  const firstLine = mem.content.split('\n')[0].replace(/^[#*\->]+\s*/, '').trim();
  return firstLine.length > 40 ? firstLine.substring(0, 40) + '…' : firstLine || 'Memory';
}

function groupByDate(memories: Memory[]): { date: string; label: string; items: Memory[] }[] {
  const groups: Record<string, Memory[]> = {};
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  memories.forEach(m => {
    const date = (m.created_at || '').slice(0, 10) || 'unknown';
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  });

  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      label: date === today ? 'Today' : date === yesterday ? 'Yesterday' : date,
      items: items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
}

/** Find connections between memories based on shared tags */
function findConnections(memories: Memory[]): { from: number; to: number }[] {
  const conns: { from: number; to: number }[] = [];
  const count: Record<number, number> = {};
  const MAX_PER_NODE = 3;

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i], b = memories[j];
      if (!a.tags?.length || !b.tags?.length) continue;
      if (!a.tags.some(t => b.tags.includes(t))) continue;
      if ((count[a.id] || 0) >= MAX_PER_NODE || (count[b.id] || 0) >= MAX_PER_NODE) continue;
      conns.push({ from: a.id, to: b.id });
      count[a.id] = (count[a.id] || 0) + 1;
      count[b.id] = (count[b.id] || 0) + 1;
    }
  }
  return conns;
}

/** Layout nodes in golden-angle spiral — most important at center */
function layoutNodes(memories: Memory[], w: number, h: number): GraphNode[] {
  if (!w || !h || memories.length === 0) return [];
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(w, h) * 0.43;
  const sorted = [...memories].sort((a, b) => (b.importance || 5) - (a.importance || 5));

  return sorted.map((mem, i) => {
    const angle = i * 2.39996; // golden angle in radians
    const r = i === 0 ? 0 : 30 + Math.sqrt(i) * (maxR / Math.sqrt(sorted.length));
    const x = Math.max(40, Math.min(w - 40, cx + Math.cos(angle) * r));
    const y = Math.max(40, Math.min(h - 40, cy + Math.sin(angle) * r));
    const imp = mem.importance || 5;
    const size = 22 + (imp / 10) * 30; // 22–52px
    return { ...mem, x, y, size };
  });
}

// ═══════════════════════════════════════════════════════════
// Memory Modal (CRUD — preserved from v1)
// ═══════════════════════════════════════════════════════════

function MemoryModal({ memory, onSave, onClose }: {
  memory?: Memory | null;
  onSave: (data: { content: string; category: string; importance: number; tags: string[] }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(memory?.content || '');
  const [category, setCategory] = useState(memory?.category || 'general');
  const [importance, setImportance] = useState(memory?.importance || 7);
  const [tagsStr, setTagsStr] = useState(memory?.tags?.join(', ') || '');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[500px] p-6 rounded-2xl bg-aegis-bg border border-aegis-border/30 shadow-2xl">
        <h3 className="text-[16px] font-bold text-aegis-text mb-4">
          {memory ? t('memory.edit', 'Edit Memory') : t('memory.add', 'Add Memory')}
        </h3>
        <div className="space-y-3">
          <textarea value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={t('memory.contentPlaceholder', 'Content...')} rows={4} dir="auto"
            className="w-full bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] rounded-xl px-4 py-3 text-[13px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:border-aegis-primary/40 resize-none" autoFocus />
          <div>
            <label className="text-[11px] text-aegis-text-muted mb-1.5 block">{t('memory.category', 'Category')}</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_KEYS.filter(c => c.key !== 'all').map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className="text-[10px] px-2.5 py-1 rounded-full border transition-colors"
                  style={category === c.key
                    ? (() => { const clr = dataColor(c.colorIdx); return { background: `${clr}20`, borderColor: `${clr}40`, color: clr }; })()
                    : { borderColor: 'rgb(var(--aegis-overlay) / 0.08)', color: 'rgb(var(--aegis-text-dim))' }
                  }>
                  {c.icon} {t(c.i18nKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-aegis-text-muted mb-1.5 block">
              {t('memory.importance', 'Importance')}: <span className="text-aegis-primary font-bold">{importance}</span>/10
            </label>
            <input type="range" min={1} max={10} value={importance} onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full accent-aegis-primary" />
          </div>
          <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)}
            placeholder={t('memory.tagsPlaceholder', 'Tags (comma separated)')}
            className="w-full bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] rounded-xl px-4 py-2.5 text-[13px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:border-aegis-primary/40" />
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-aegis-text-muted hover:text-aegis-text-secondary">{t('common.cancel', 'Cancel')}</button>
          <button onClick={() => onSave({
            content, category, importance,
            tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
          })} disabled={!content.trim()}
            className="px-4 py-2 rounded-xl bg-aegis-primary text-aegis-btn-primary-text text-[13px] font-medium hover:bg-aegis-primary/80 disabled:opacity-40">
            {t('common.save', 'Save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Disabled View (preserved from v1)
// ═══════════════════════════════════════════════════════════

function MemoryDisabledView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-lg">
          <div className="w-16 h-16 rounded-2xl bg-aegis-primary/10 border border-aegis-primary/20 flex items-center justify-center mx-auto mb-5">
            <Brain size={28} className="text-aegis-primary" />
          </div>
          <h2 className="text-[20px] font-bold text-aegis-text mb-3">{t('memoryExplorer.title')}</h2>
          <p className="text-[13px] text-aegis-text-dim/70 mb-6 leading-relaxed">
            {t('memory.experimentalDesc', 'Browse, search, and manage your agent\'s memories. Connect to a Memory API server or point to your local workspace folder containing .md files.')}
          </p>
          <div className="flex items-stretch gap-3 mb-6 max-w-md mx-auto">
            <div className="flex-1 p-4 rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.02)]">
              <div className="text-[20px] mb-2">📁</div>
              <div className="text-[12px] font-semibold text-aegis-text mb-1">{t('memory.localOption', 'Local Files')}</div>
              <div className="text-[11px] text-aegis-text-muted leading-relaxed">
                {t('memory.localOptionDesc', 'Select your workspace folder with MEMORY.md and memory/ files')}
              </div>
            </div>
            <div className="flex-1 p-4 rounded-xl border border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.02)]">
              <div className="text-[20px] mb-2">🔌</div>
              <div className="text-[12px] font-semibold text-aegis-text mb-1">{t('memory.apiOption', 'API Server')}</div>
              <div className="text-[11px] text-aegis-text-muted leading-relaxed">
                {t('memory.apiOptionDesc', 'Connect to a Memory API server for semantic search and management')}
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aegis-primary/15 border border-aegis-primary/30 text-aegis-primary text-[13px] font-semibold hover:bg-aegis-primary/25 transition-colors">
            <Settings size={16} />
            {t('memory.goToSettings', 'Enable in Settings')}
          </button>
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════
// Graph View — Neural network visualization
// ═══════════════════════════════════════════════════════════

function GraphView({ memories, onSelect }: { memories: Memory[]; onSelect: (m: Memory) => void; }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const nodes = useMemo(() => layoutNodes(memories, dims.w, dims.h), [memories, dims]);
  const connections = useMemo(() => findConnections(memories), [memories]);
  const nodeMap = useMemo(() => {
    const m: Record<number, GraphNode> = {};
    nodes.forEach(n => { m[n.id] = n; });
    return m;
  }, [nodes]);

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-aegis-text-dim text-[13px]">
        🕸️ {t('memoryExplorer.noMemoriesGraph')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{
      background: 'radial-gradient(circle at 30% 40%, rgb(var(--aegis-accent) / 0.03) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(179,136,255,0.03) 0%, transparent 50%)',
    }}>
      {/* SVG connections + animated pulses */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        {connections.map((conn, i) => {
          const a = nodeMap[conn.from], b = nodeMap[conn.to];
          if (!a || !b) return null;
          const color = getCatColor(a.category);
          return (
            <g key={`c${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeOpacity={0.22} strokeWidth={1.2} />
              {/* Pulse dot — unified rhythm, back-and-forth */}
              {i < 10 && (
                <circle r={2} fill={color} opacity={0.5}>
                  <animateMotion dur="5s" repeatCount="indefinite"
                    path={`M ${a.x},${a.y} L ${b.x},${b.y} L ${a.x},${a.y}`}
                    begin={`${(i * 0.6) % 5}s`} />
                </circle>
              )}
            </g>
          );
        })}

        {/* Electron orbits — sampled evenly across all positions (center → edge) */}
        {nodes
          .filter((_, i) => i % Math.max(1, Math.ceil(nodes.length / 25)) === 0)
          .flatMap((node) => {
          const eColor = getCatColor(node.category);
          const imp = node.importance || 5;
          const numE = imp >= 8 ? 3 : imp >= 5 ? 2 : 1;
          return Array.from({ length: numE }).map((_, ei) => {
            const orbitR = node.size / 2 + 8 + ei * 7;
            const dir = ei % 2 === 0 ? 360 : -360;
            const dur = 4 + ei * 1.5;
            return (
              <g key={`e-${node.id}-${ei}`}>
                {/* Dashed orbit path — visible only for important memories */}
                {imp >= 7 && (
                  <circle cx={node.x} cy={node.y} r={orbitR}
                    fill="none" stroke={eColor} strokeOpacity={0.12} strokeWidth={0.5}
                    strokeDasharray="2 8" />
                )}
                {/* Electron dot */}
                <circle cx={node.x + orbitR} cy={node.y} r={2} fill={eColor} opacity={0.6}>
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${node.x} ${node.y}`} to={`${dir} ${node.x} ${node.y}`}
                    dur={`${dur}s`} repeatCount="indefinite" />
                </circle>
                {/* Glow trail */}
                <circle cx={node.x + orbitR} cy={node.y} r={5} fill={eColor} opacity={0.12}>
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${node.x} ${node.y}`} to={`${dir} ${node.x} ${node.y}`}
                    dur={`${dur}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          });
        })}
      </svg>

      {/* Memory nodes */}
      {nodes.map((node, idx) => {
        const color = getCatColor(node.category);
        return (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(idx * 0.04, 1), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute cursor-pointer group"
            style={{ left: node.x - node.size / 2, top: node.y - node.size / 2, zIndex: 1 }}
            onClick={() => onSelect(node)}
          >
            {/* Bubble */}
            <div
              className="rounded-full flex items-center justify-center relative transition-all duration-300 group-hover:scale-110"
              style={{
                width: node.size, height: node.size,
                background: `linear-gradient(135deg, ${color}35, ${color}18)`,
                border: `1.5px solid ${color}60`,
                boxShadow: `0 0 16px rgb(var(--aegis-overlay) / 0.12)`,
                fontSize: node.size > 40 ? 18 : node.size > 30 ? 14 : 11,
              }}
            >
              {getCatIcon(node.category)}
              {/* Breathing ring */}
              <div className="absolute inset-[-4px] rounded-full opacity-30 pointer-events-none"
                style={{ border: `1px solid ${color}`, animation: 'mem-breathe 3s ease-in-out infinite' }} />
            </div>
            {/* Label */}
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-aegis-text-muted text-center max-w-[100px] truncate pointer-events-none">
              {extractTitle(node)}
            </div>
          </motion.div>
        );
      })}

      <style>{`
        @keyframes mem-breathe {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.15); opacity: 0.05; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Timeline View — Grouped by date
// ═══════════════════════════════════════════════════════════

function TimelineView({ memories, onSelect }: { memories: Memory[]; onSelect: (m: Memory) => void }) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupByDate(memories), [memories]);

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-aegis-text-dim text-[13px]">
        📅 {t('memoryExplorer.noMemoriesTimeline')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="relative ps-10">
        {/* Gradient timeline line */}
        <div className="absolute start-[15px] top-0 bottom-0 w-[2px] opacity-30"
          style={{ background: `linear-gradient(to bottom, ${dataColor(1)}, ${dataColor(4)}, ${dataColor(5)}, transparent)` }} />

        {groups.map((group, gi) => (
          <div key={group.date} className="mb-8">
            {/* Date header with dot */}
            <div className="relative text-[13px] font-bold text-aegis-text mb-3 ps-1">
              <div className="absolute start-[-29px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-aegis-accent"
                style={{ boxShadow: `0 0 10px rgb(var(--aegis-accent) / 0.5)` }} />
              {group.label}
            </div>

            {/* Entries */}
            {group.items.map((mem, mi) => {
              const color = getCatColor(mem.category);
              return (
                <motion.div
                  key={mem.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gi * 0.1 + mi * 0.03 }}
                  onClick={() => onSelect(mem)}
                  className="relative ms-1 mb-2 p-3 ps-5 rounded-xl bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.06)] cursor-pointer transition-all hover:bg-[rgb(var(--aegis-overlay)/0.04)] hover:border-[rgb(var(--aegis-overlay)/0.1)] overflow-hidden"
                >
                  {/* Color bar */}
                  <div className="absolute start-0 top-0 bottom-0 w-[3px] rounded-s-xl" style={{ background: color }} />

                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px]">{getCatIcon(mem.category)}</span>
                    <span className="text-[12px] font-semibold" style={{ color }}>{extractTitle(mem)}</span>
                  </div>
                  <p className="text-[11px] text-aegis-text-muted leading-relaxed line-clamp-2 ps-6" dir="auto">
                    {mem.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 ps-6 flex-wrap">
                    {mem.tags?.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>{tag}</span>
                    ))}
                    {mem.created_at && (
                      <span className="text-[9px] text-aegis-text-dim font-mono ms-auto">
                        {new Date(mem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Cards View — Grid layout
// ═══════════════════════════════════════════════════════════

function CardsView({ memories, onSelect }: { memories: Memory[]; onSelect: (m: Memory) => void }) {
  const { t } = useTranslation();
  if (memories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-aegis-text-dim text-[13px]">
        🗃️ {t('memoryExplorer.noMemoriesCards')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {memories.map((mem, i) => {
          const color = getCatColor(mem.category);
          return (
            <motion.div
              key={mem.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.5) }}
              onClick={() => onSelect(mem)}
              className="relative p-4 rounded-xl bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.08)] cursor-pointer transition-all hover:bg-[rgb(var(--aegis-overlay)/0.04)] hover:border-[rgb(var(--aegis-overlay)/0.15)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(var(--aegis-overlay)/0.10)] overflow-hidden"
            >
              {/* Top accent */}
              <div className="absolute top-0 inset-x-0 h-[2px] opacity-50"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

              {/* Header */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] border shrink-0"
                  style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)`, borderColor: `${color}25` }}>
                  {getCatIcon(mem.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate" style={{ color }}>{extractTitle(mem)}</div>
                </div>
                {(mem.importance || 5) >= 8 && (
                  <div className="text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${color}15`, color }}>
                    {mem.importance}/10
                  </div>
                )}
              </div>

              {/* Content */}
              <p className="text-[11px] text-aegis-text-muted leading-relaxed line-clamp-3 mb-2.5" dir="auto">
                {mem.content}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {mem.tags?.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded"
                      style={{ background: `${color}10`, color: `${color}` }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-[9px] text-aegis-text-dim font-mono shrink-0 ms-2">
                  {mem.created_at ? timeAgoShort(mem.created_at) : ''}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Detail Panel — Slide-in from end
// ═══════════════════════════════════════════════════════════

function DetailPanel({ memory, onClose, onEdit, onDelete, apiUrl, isLocal }: {
  memory: Memory | null;
  onClose: () => void;
  onEdit: (m: Memory) => void;
  onDelete: (id: number) => void;
  apiUrl: string;
  isLocal: boolean;
}) {
  const { t } = useTranslation();
  const [related, setRelated] = useState<Memory[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);

  // Fetch related memories
  useEffect(() => {
    if (!memory || isLocal) { setRelated([]); return; }
    fetch(`${apiUrl}/related/${memory.id}?limit=5`)
      .then(r => r.json())
      .then(data => setRelated(Array.isArray(data) ? data : data.memories || data.results || []))
      .catch(() => setRelated([]));
  }, [memory, apiUrl, isLocal]);

  useEffect(() => { setConfirmDel(false); }, [memory]);

  const color = memory ? getCatColor(memory.category) : dataColor(1);

  return (
    <AnimatePresence>
      {memory && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 end-0 w-[400px] h-full z-50 overflow-y-auto border-s border-[rgb(var(--aegis-overlay)/0.06)]"
            style={{ background: 'var(--aegis-bg-solid)', backdropFilter: 'blur(40px)', boxShadow: '-10px 0 40px rgb(var(--aegis-overlay) / 0.15)' }}
          >
            <div className="p-6">
              {/* Close */}
              <button onClick={onClose}
                className="absolute top-4 end-4 w-8 h-8 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] flex items-center justify-center text-aegis-text-muted hover:text-aegis-text-secondary transition-colors">
                <X size={16} />
              </button>

              {/* Icon + Title */}
              <div className="text-[40px] mb-4">{getCatIcon(memory.category)}</div>
              <h2 className="text-[20px] font-extrabold text-aegis-text mb-1">{extractTitle(memory)}</h2>
              <div className="text-[11px] mb-4">
                <span className="font-bold" style={{ color }}>{memory.category}</span>
                <span className="text-aegis-text-dim"> · {t('memoryExplorer.importance')} {memory.importance || 5}/10</span>
              </div>

              {/* Actions */}
              {!isLocal && (
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => onEdit(memory)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] text-[11px] text-aegis-text-muted hover:text-aegis-primary hover:border-aegis-primary/30 transition-colors">
                    <Pencil size={12} /> {t('common.edit', 'Edit')}
                  </button>
                  {confirmDel ? (
                    <button onClick={() => { onDelete(memory.id); onClose(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-400/30 text-[11px] text-red-400 font-semibold">
                      {t('memory.confirmDelete', 'Confirm Delete')}
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDel(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] text-[11px] text-aegis-text-muted hover:text-red-400 hover:border-red-400/30 transition-colors">
                      <Trash2 size={12} /> {t('common.delete', 'Delete')}
                    </button>
                  )}
                </div>
              )}

              <div className="border-t border-[rgb(var(--aegis-overlay)/0.06)] my-4" />

              {/* Content */}
              <div className="text-[9px] uppercase tracking-[1.5px] font-bold text-aegis-text-dim mb-2">{t('memoryExplorer.content', 'Content')}</div>
              <div className="text-[13px] text-aegis-text-muted leading-relaxed whitespace-pre-wrap" dir="auto">
                {memory.content}
              </div>

              <div className="border-t border-[rgb(var(--aegis-overlay)/0.06)] my-4" />

              {/* Metadata */}
              <div className="text-[9px] uppercase tracking-[1.5px] font-bold text-aegis-text-dim mb-2">{t('memoryExplorer.metadata', 'Metadata')}</div>
              <div className="space-y-2">
                {([
                  { id: 'date', label: t('memoryExplorer.date', 'Date'), value: memory.created_at ? new Date(memory.created_at).toLocaleDateString() : '—' },
                  { id: 'category', label: t('memory.category', 'Category'), value: memory.category },
                  { id: 'importance', label: t('memory.importance', 'Importance'), value: `${memory.importance || 5}/10` },
                  { id: 'tags', label: t('memoryExplorer.tags', 'Tags'), value: memory.tags?.join(', ') || '—' },
                ] as const).map(({ id, label, value }) => (
                  <div key={id} className="flex justify-between text-[11px]">
                    <span className="text-aegis-text-dim">{label}</span>
                    <span className="text-aegis-text font-semibold" style={id === 'category' ? { color } : undefined}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Related memories */}
              {related.length > 0 && (
                <>
                  <div className="border-t border-[rgb(var(--aegis-overlay)/0.06)] my-4" />
                  <div className="text-[9px] uppercase tracking-[1.5px] font-bold text-aegis-text-dim mb-2">{t('memoryExplorer.relatedMemories')}</div>
                  <div className="space-y-1">
                    {related.map(r => (
                      <div key={r.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.04)] cursor-pointer transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getCatColor(r.category) }} />
                        <span className="text-[11px] text-aegis-text-muted flex-1 truncate">{getCatIcon(r.category)} {extractTitle(r)}</span>
                        {r.similarity != null && <span className="text-[9px] text-aegis-text-dim font-mono">{Math.round(r.similarity * 100)}%</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export function MemoryExplorerPage() {
  const { memoryExplorerEnabled, memoryMode, memoryApiUrl, memoryLocalPath } = useSettingsStore();
  if (!memoryExplorerEnabled) return <MemoryDisabledView />;

  const { t } = useTranslation();
  const API = memoryApiUrl || 'http://localhost:3040';
  const isLocal = memoryMode === 'local';

  // ── State ──
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);

  // ── Parse local file ──
  const parseLocalFile = (file: { name: string; content: string; modified: string; size: number }, idx: number): Memory => {
    let category = 'general';
    const lc = file.content.toLowerCase();
    if (lc.includes('project')) category = 'projects';
    else if (lc.includes('decision')) category = 'decisions';
    else if (lc.includes('preference')) category = 'preferences';
    else if (lc.includes('technical')) category = 'technical';

    const tagsMatch = file.content.match(/tags:\s*\[([^\]]*)\]/);
    const tags = tagsMatch ? tagsMatch[1].replace(/['"]/g, '').split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    return {
      id: idx + 1,
      content: file.content.slice(0, 2000),
      category,
      importance: file.name === 'MEMORY.md' ? 10 : 5,
      tags: tags.length ? tags : [file.name.replace('.md', '')],
      created_at: file.modified,
    };
  };

  // ── Load ──
  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocal) {
        if (!memoryLocalPath) { setMemories([]); setLoading(false); return; }
        const result = await (window as any).aegis?.memory?.readLocal(memoryLocalPath);
        if (result?.success && result.files) {
          setMemories(result.files.map(parseLocalFile));
        } else { setMemories([]); }
      } else {
        const res = await fetch(`${API}/memories?limit=200`);
        const data = await res.json();
        setMemories(Array.isArray(data) ? data : data.memories || data.results || []);
      }
    } catch { setMemories([]); }
    finally { setLoading(false); }
  }, [isLocal, memoryLocalPath, API]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  // ── Search ──
  const handleSearch = useCallback(async () => {
    if (!query.trim()) { loadMemories(); return; }
    setSearching(true);
    try {
      if (isLocal) {
        if (!memoryLocalPath) { setSearching(false); return; }
        const result = await (window as any).aegis?.memory?.readLocal(memoryLocalPath);
        if (result?.success && result.files) {
          const q = query.toLowerCase();
          setMemories(result.files
            .filter((f: any) => f.content.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
            .map(parseLocalFile));
        }
      } else {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}&limit=50`);
        const data = await res.json();
        setMemories(data.memories || data.results || []);
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, [query, loadMemories, isLocal, memoryLocalPath, API]);

  // ── CRUD ──
  const handleSave = async (data: { content: string; category: string; importance: number; tags: string[] }) => {
    try {
      if (editingMemory) {
        await fetch(`${API}/memories/${editingMemory.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      } else {
        await fetch(`${API}/memories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      }
      setModalOpen(false); setEditingMemory(null); loadMemories();
    } catch { /* silent */ }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API}/memories/${id}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== id));
      setSelectedMemory(null);
    } catch { /* silent */ }
  };

  // ── Derived ──
  const filtered = useMemo(() =>
    activeCategory === 'all' ? memories : memories.filter(m => m.category === activeCategory),
    [memories, activeCategory]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: memories.length };
    memories.forEach(m => { counts[m.category] = (counts[m.category] || 0) + 1; });
    return counts;
  }, [memories]);

  const recentMemories = useMemo(() =>
    [...memories].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [memories]
  );

  const handleEdit = (m: Memory) => {
    setSelectedMemory(null);
    setEditingMemory(m);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-1 min-h-0" style={{ minHeight: 'calc(100vh - 140px)' }}>

      {/* ═══ Sidebar ═══ */}
      <div className="w-[260px] shrink-0 border-e border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.01)] flex flex-col overflow-hidden">

        {/* Search */}
        <div className="p-4 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={t('memoryExplorer.searchPlaceholder', 'Search memories...')}
              dir="auto"
              className="w-full bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.08)] rounded-xl ps-9 pe-3 py-2.5 text-[13px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:border-aegis-accent/40 transition-colors"
            />
            {searching && <Loader2 size={14} className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-aegis-primary" />}
          </div>
          <div className="text-[9px] text-aegis-text-dim mt-1.5 ps-1">
            <kbd className="px-1 py-px rounded border border-[rgb(var(--aegis-overlay)/0.1)] bg-[rgb(var(--aegis-overlay)/0.04)] text-[8px] font-mono">
              {t('memoryExplorer.enterKey', 'Enter')}
            </kbd>{' '}
            {t('memoryExplorer.enterToSearch', 'to search')}
          </div>
        </div>

        {/* Categories */}
        <div className="p-4 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
          <div className="text-[9px] uppercase tracking-[2px] font-bold text-aegis-text-dim mb-2.5">{t('memoryExplorer.catAll')}</div>
          <div className="space-y-0.5">
            {CATEGORY_KEYS.map(cat => {
              const count = categoryCounts[cat.key] || 0;
              if (cat.key !== 'all' && count === 0) return null;
              const isActive = activeCategory === cat.key;
              return (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all text-start',
                    isActive ? 'bg-aegis-accent/10 text-aegis-accent' : 'text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
                  )}>
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: dataColor(cat.colorIdx) }} />
                  <span className="flex-1">{t(cat.i18nKey)}</span>
                  <span className="text-[10px] font-bold bg-[rgb(var(--aegis-overlay)/0.04)] px-2 py-0.5 rounded-full text-aegis-text-dim">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: memories.length, label: t('memoryExplorer.stats.memories', 'Memories') },
              { value: memories.reduce((s, m) => s + (m.tags?.length || 0), 0), label: t('memoryExplorer.stats.tags', 'Tags') },
            ].map(stat => (
              <div key={stat.label} className="bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.04)] rounded-lg p-2.5 text-center">
                <div className="text-[18px] font-extrabold text-transparent bg-clip-text"
                  style={{ backgroundImage: `linear-gradient(135deg, ${dataColor(1)}, ${dataColor(4)})` }}>
                  {stat.value}
                </div>
                <div className="text-[8px] text-aegis-text-dim uppercase tracking-wider mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[9px] uppercase tracking-[2px] font-bold text-aegis-text-dim mb-2.5">
            {t('memoryExplorer.recent', 'Recent')}
          </div>
          <div className="space-y-0.5">
            {recentMemories.map(mem => (
              <div key={mem.id} onClick={() => setSelectedMemory(mem)}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.04)] cursor-pointer transition-colors">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: getCatColor(mem.category) }} />
                <div className="min-w-0">
                  <div className="text-[11px] text-aegis-text-muted truncate">{extractTitle(mem)}</div>
                  <div className="text-[9px] text-aegis-text-dim">{mem.created_at ? timeAgoShort(mem.created_at) : ''} · {mem.category}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-bold text-aegis-text">🧠 {t('memoryExplorer.title')}</span>
            {filtered.length > 0 && (
              <span className="text-[11px] text-aegis-text-dim">
                {t('memoryExplorer.resultsCount', { count: filtered.length })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Add button */}
            {!isLocal && (
              <button onClick={() => { setEditingMemory(null); setModalOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aegis-primary text-aegis-btn-primary-text text-[11px] font-semibold hover:bg-aegis-primary/80 transition-colors">
                <Plus size={14} /> {t('common.add', 'Add')}
              </button>
            )}
            <button onClick={loadMemories} className="p-1.5 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.05)] text-aegis-text-dim transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {/* View Switcher */}
            <div className="flex gap-0.5 bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.06)] rounded-lg p-1 ms-2">
              {([
                { key: 'graph' as const, label: t('memoryExplorer.graphView') },
                { key: 'timeline' as const, label: t('memoryExplorer.timelineView') },
                { key: 'cards' as const, label: t('memoryExplorer.cardsView') },
              ]).map(v => (
                <button key={v.key} onClick={() => setViewMode(v.key)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all',
                    viewMode === v.key ? 'bg-aegis-accent/15 text-aegis-accent' : 'text-aegis-text-dim hover:text-aegis-text-muted'
                  )}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* View Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-aegis-primary" />
          </div>
        ) : (
          <>
            {viewMode === 'graph' && <GraphView memories={filtered} onSelect={setSelectedMemory} />}
            {viewMode === 'timeline' && <TimelineView memories={filtered} onSelect={setSelectedMemory} />}
            {viewMode === 'cards' && <CardsView memories={filtered} onSelect={setSelectedMemory} />}
          </>
        )}
      </div>

      {/* ═══ Detail Panel ═══ */}
      <DetailPanel
        memory={selectedMemory}
        onClose={() => setSelectedMemory(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        apiUrl={API}
        isLocal={isLocal}
      />

      {/* ═══ CRUD Modal ═══ */}
      <AnimatePresence>
        {modalOpen && (
          <MemoryModal
            memory={editingMemory}
            onSave={handleSave}
            onClose={() => { setModalOpen(false); setEditingMemory(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
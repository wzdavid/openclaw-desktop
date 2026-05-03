// ═══════════════════════════════════════════════════════════
// Workshop — Kanban task management with stats & activity log
//
// Layout: Header → Stats Row → Completion Bar → Kanban → Timeline
// Design: Glass cards, priority strips, agent avatars, tags
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { timeAgo as centralTimeAgo } from '@/utils/format';
import {
  Plus, X, Search, Filter, Activity, Trash2,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useWorkshopStore, Task, ActivityEntry } from '@/stores/workshopStore';
import clsx from 'clsx';
import { themeHex, themeAlpha } from '@/utils/theme-colors';

// ── Column config ────────────────────────────────────────

const COLUMNS = [
  { key: 'queue',      labelKey: 'workshopExtra.queue',      dotVar: 'warning' },
  { key: 'inProgress', labelKey: 'workshopExtra.inProgress', dotVar: 'accent'  },
  { key: 'done',       labelKey: 'workshopExtra.done',       dotVar: 'success' },
] as const;

// ── Priority helpers ─────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';

function priorityStyle(p: Priority) {
  if (p === 'high')   return { color: themeHex('danger'),  bg: themeAlpha('danger', 0.12),  border: themeAlpha('danger', 0.22) };
  if (p === 'medium') return { color: themeHex('warning'), bg: themeAlpha('warning', 0.12), border: themeAlpha('warning', 0.22) };
  return                      { color: themeHex('primary'), bg: themeAlpha('primary', 0.12), border: themeAlpha('primary', 0.22) };
}

function priorityStripColor(p: Priority) {
  if (p === 'high') return themeHex('danger');
  if (p === 'medium') return themeHex('warning');
  return themeHex('primary');
}

const PROGRESS_PRESETS = [25, 50, 75, 100];

// ── Agent emoji mapping ──────────────────────────────────

const AGENT_EMOJIS: Record<string, string> = {
  main: 'O',
  hilali: '⚽', pipeline: '📦', researcher: '🔍',
  consultant: '💡', coder: '💻',
};

function agentEmoji(name?: string): string {
  if (!name) return '🤖';
  return AGENT_EMOJIS[name.toLowerCase()] ?? '🤖';
}

// ── Time formatting (uses central utils/format.ts) ──────
const timeAgo = (iso: string) => centralTimeAgo(iso);

// ═══════════════════════════════════════════════════════════
// Stats Row
// ═══════════════════════════════════════════════════════════

function StatsRow({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const total = tasks.length;
  const queue = tasks.filter((t) => t.status === 'queue').length;
  const active = tasks.filter((t) => t.status === 'inProgress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const cards: { emoji: string; value: number; label: string; color: 'primary' | 'accent' | 'danger' | 'warning' | 'success'; extra?: string }[] = [
    { emoji: '📋', value: total,  label: t('workshopExtra.totalTasks'),  color: 'accent'  },
    { emoji: '⏳', value: queue,  label: t('workshopExtra.inQueue'),     color: 'warning' },
    { emoji: '⚡', value: active, label: t('workshopExtra.inProgress'),  color: 'primary' },
    { emoji: '✓',  value: done,   label: t('workshopExtra.completed'),   color: 'success', extra: total > 0 ? `${pct}%` : undefined },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-3 rounded-[14px] p-3.5 border border-[rgb(var(--aegis-overlay)/0.06)] transition-colors hover:border-[rgb(var(--aegis-overlay)/0.12)]"
          style={{ background: 'rgb(var(--aegis-overlay) / 0.03)' }}
        >
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[15px] shrink-0"
            style={{
              background: themeAlpha(c.color, 0.1),
              border: `1px solid ${themeAlpha(c.color, 0.15)}`,
            }}
          >
            {c.emoji}
          </div>
          {/* Value + Label */}
          <div className="min-w-0">
            <div className="text-[20px] font-bold leading-none" style={{ color: themeHex(c.color) }}>
              {c.value}
            </div>
            <div className="text-[10px] text-aegis-text-dim uppercase tracking-wider mt-0.5">{c.label}</div>
          </div>
          {/* Extra badge */}
          {c.extra && (
            <div
              className="ms-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ color: themeHex('success'), background: themeAlpha('success', 0.1) }}
            >
              {c.extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Completion Bar
// ═══════════════════════════════════════════════════════════

function CompletionBar({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const total = tasks.length;
  if (total === 0) return null;
  const done = tasks.filter((t) => t.status === 'done').length;
  const active = tasks.filter((t) => t.status === 'inProgress').length;
  const queue = tasks.filter((t) => t.status === 'queue').length;
  const pct = Math.round((done / total) * 100);

  return (
    <div
      className="flex items-center gap-3.5 rounded-xl p-3 px-4 mb-4 border border-[rgb(var(--aegis-overlay)/0.06)]"
      style={{ background: 'rgb(var(--aegis-overlay) / 0.03)' }}
    >
      <span className="text-[11px] text-aegis-text-muted whitespace-nowrap">
        {t('workshop.progress', 'Progress')}
      </span>
      {/* Track */}
      <div className="flex-1 h-[6px] rounded-full overflow-hidden flex" style={{ background: 'rgb(var(--aegis-overlay) / 0.04)' }}>
        <div className="h-full rounded-s-full" style={{ width: `${(done / total) * 100}%`, background: themeHex('success') }} />
        <div className="h-full" style={{ width: `${(active / total) * 100}%`, background: themeHex('accent') }} />
        <div className="h-full rounded-e-full" style={{ width: `${(queue / total) * 100}%`, background: themeAlpha('warning', 0.5) }} />
      </div>
      {/* Percentage */}
      <span className="text-[13px] font-bold font-mono tabular-nums min-w-[38px] text-end" style={{ color: themeHex('success') }}>
        {pct}%
      </span>
      {/* Legend */}
      <div className="flex items-center gap-3 ms-2">
        {[
          { label: t('workshopExtra.done'), color: themeHex('success') },
          { label: t('workshopExtra.active'), color: themeHex('accent') },
          { label: t('workshopExtra.queue'), color: themeAlpha('warning', 0.5) },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px] text-aegis-text-dim">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Task Card
// ═══════════════════════════════════════════════════════════

function TaskCard({ task, onMove, onDelete, onProgress }: {
  task: Task;
  onMove: (id: string, status: Task['status']) => void;
  onDelete: (id: string) => void;
  onProgress: (id: string, p: number) => void;
}) {
  const { t } = useTranslation();
  const isDone = task.status === 'done';
  const ps = priorityStyle(task.priority);

  return (
    <Reorder.Item
      value={task.id}
      className={clsx(
        'relative rounded-xl border transition-all group',
        isDone ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
      )}
      style={{
        background: 'rgb(var(--aegis-overlay) / 0.025)',
        borderColor: 'rgb(var(--aegis-overlay) / 0.07)',
      }}
      whileHover={!isDone ? {
        borderColor: 'rgb(var(--aegis-overlay) / 0.15)',
        y: -1,
        boxShadow: '0 4px 16px rgb(var(--aegis-overlay) / 0.08)',
      } : undefined}
      whileDrag={{ scale: 1.03, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', zIndex: 50 }}
    >
      {/* Priority strip */}
      <div
        className="absolute top-0 start-0 w-[3px] h-full rounded-s-xl"
        style={{ background: isDone ? themeHex('success') : priorityStripColor(task.priority) }}
      />

      <div className="p-3 ps-4">
        {/* Title */}
        <div
          className={clsx('text-[12px] font-semibold text-aegis-text leading-snug mb-2', isDone && 'line-through decoration-[rgb(var(--aegis-overlay)/0.15)]')}
          dir="auto"
        >
          {task.title}
        </div>

        {/* Agent + Priority */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-aegis-text-muted">
            <div
              className="w-[18px] h-[18px] rounded-md flex items-center justify-center text-[10px]"
              style={{ background: 'rgb(var(--aegis-overlay) / 0.05)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
            >
              {agentEmoji(task.assignedAgent)}
            </div>
            {task.assignedAgent || '—'}
          </div>
          <span
            className="text-[9px] px-2 py-[2px] rounded font-bold uppercase tracking-wide"
            style={isDone
              ? { color: themeHex('success'), background: themeAlpha('success', 0.08), border: `1px solid ${themeAlpha('success', 0.15)}` }
              : { color: ps.color, background: ps.bg, border: `1px solid ${ps.border}` }
            }
          >
            {isDone ? t('workshop.doneUpper', 'DONE') : task.priority.toUpperCase()}
          </span>
        </div>

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-[1px] rounded"
                style={{
                  background: themeAlpha('accent', 0.08),
                  color: themeAlpha('accent', 0.7),
                  border: `1px solid ${themeAlpha('accent', 0.12)}`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar (inProgress only) */}
        {task.status === 'inProgress' && (
          <div className="mt-2.5">
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgb(var(--aegis-overlay) / 0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${task.progress || 0}%`,
                  background: (task.progress || 0) >= 100 ? themeHex('success') : themeHex('accent'),
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              {/* Presets (hover only) */}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {PROGRESS_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => onProgress(task.id, p)}
                    className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                    style={(task.progress || 0) >= p
                      ? { background: themeAlpha('primary', 0.12), color: themeHex('primary') }
                      : { color: 'rgb(var(--aegis-overlay) / 0.2)' }
                    }
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-aegis-text-muted font-mono tabular-nums">{task.progress || 0}%</span>
            </div>
          </div>
        )}

        {/* Actions (hover only, not for done) */}
        {!isDone && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {task.status !== 'queue' && (
              <button
                onClick={() => onMove(task.id, 'queue')}
                className="text-[10px] px-2 py-1 rounded-md transition-colors"
                style={{ background: 'rgb(var(--aegis-overlay) / 0.04)', color: 'rgb(var(--aegis-text-dim))' }}
              >
                ← {t('workshop.queue', 'Queue')}
              </button>
            )}
            {task.status !== 'inProgress' && (
              <button
                onClick={() => onMove(task.id, 'inProgress')}
                className="text-[10px] px-2 py-1 rounded-md transition-colors"
                style={{ background: themeAlpha('accent', 0.08), color: themeHex('accent') }}
              >
                {task.status === 'queue' ? '→' : '←'} {t('workshop.inProgress', 'In Progress')}
              </button>
            )}
            {task.status !== 'done' && (
              <button
                onClick={() => onMove(task.id, 'done')}
                className="text-[10px] px-2 py-1 rounded-md transition-colors"
                style={{ background: themeAlpha('success', 0.08), color: themeHex('success') }}
              >
                ✓ {t('workshop.done', 'Done')}
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="text-[10px] p-1 rounded-md ms-auto transition-colors"
              style={{ color: themeAlpha('danger', 0.4) }}
              onMouseEnter={(e) => { e.currentTarget.style.color = themeHex('danger'); e.currentTarget.style.background = themeAlpha('danger', 0.08); }}
              onMouseLeave={(e) => { e.currentTarget.style.color = themeAlpha('danger', 0.4); e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </Reorder.Item>
  );
}

// ═══════════════════════════════════════════════════════════
// Activity Timeline
// ═══════════════════════════════════════════════════════════

function ActivityTimeline({ activities }: { activities: ActivityEntry[] }) {
  const { t } = useTranslation();
  if (activities.length === 0) return null;

  const dotColor = (type: ActivityEntry['type']) => {
    if (type === 'completed') return themeHex('success');
    if (type === 'moved') return themeHex('accent');
    if (type === 'progress') return themeHex('primary');
    if (type === 'created') return themeHex('warning');
    if (type === 'deleted') return themeHex('danger');
    return themeHex('primary');
  };

  const describe = (a: ActivityEntry) => {
    switch (a.type) {
      case 'created':
        return (
          <>
            <strong>{a.taskTitle}</strong> {t('workshop.activity.addedTo', 'added to')}{' '}
            <strong>{t('workshop.queue', 'Queue')}</strong>
          </>
        );
      case 'moved':
        return (
          <>
            <strong>{a.taskTitle}</strong> {t('workshop.activity.movedTo', 'moved to')}{' '}
            <strong>{a.to}</strong>
          </>
        );
      case 'completed':
        return (
          <>
            <strong>{a.taskTitle}</strong> {t('workshop.activity.completed', 'completed')} ✓
          </>
        );
      case 'progress':
        return (
          <>
            <strong>{a.taskTitle}</strong> {t('workshop.activity.progress', 'progress')} →{' '}
            <strong>{a.progress}%</strong>
          </>
        );
      case 'deleted':
        return (
          <>
            <strong>{a.taskTitle}</strong> {t('workshop.activity.deleted', 'deleted')}
          </>
        );
      default:          return <>{a.taskTitle}</>;
    }
  };

  const recent = activities.slice(0, 8);

  return (
    <div
      className="rounded-[14px] border border-[rgb(var(--aegis-overlay)/0.06)] p-4 mt-4"
      style={{ background: 'rgb(var(--aegis-overlay) / 0.03)' }}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-aegis-text-secondary mb-3">
        <Activity size={14} />
        {t('workshop.recentActivity', 'Recent Activity')}
      </div>
      <div className="flex flex-col">
        {recent.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-2.5 py-2 border-b border-[rgb(var(--aegis-overlay)/0.03)] last:border-b-0 text-[11px]"
          >
            <div className="w-[6px] h-[6px] rounded-full mt-1 shrink-0" style={{ background: dotColor(a.type) }} />
            <div className="flex-1 text-aegis-text-secondary leading-relaxed [&_strong]:text-aegis-text [&_strong]:font-semibold">
              {describe(a)}
            </div>
            <span className="text-[10px] text-aegis-text-dim font-mono tabular-nums whitespace-nowrap">
              {timeAgo(a.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Add Task Modal
// ═══════════════════════════════════════════════════════════

function AddTaskModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (task: { title: string; description: string; priority: Priority; assignedAgent?: string; tags?: string[] }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [agent, setAgent] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    onAdd({ title: title.trim(), description: description.trim(), priority, assignedAgent: agent.trim() || undefined, tags });
    setTitle(''); setDescription(''); setPriority('medium'); setAgent(''); setTagsInput('');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'var(--aegis-bg-frosted-60)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[440px] p-6 rounded-2xl shadow-2xl"
            style={{ background: 'var(--aegis-bg)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
          >
            <h3 className="text-[16px] font-bold text-aegis-text mb-4">{t('workshop.newTask', 'New Task')}</h3>
            <div className="space-y-3">
              {/* Title */}
              <input
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder={t('workshop.taskTitle', 'Task title')}
                dir="auto" autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full rounded-xl px-4 py-2.5 text-[13px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:ring-1 focus:ring-aegis-primary/30"
                style={{ background: 'rgb(var(--aegis-overlay) / 0.04)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
              />
              {/* Description */}
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={t('workshop.taskDescription', 'Description (optional)')}
                rows={3} dir="auto"
                className="w-full rounded-xl px-4 py-2.5 text-[13px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:ring-1 focus:ring-aegis-primary/30 resize-none"
                style={{ background: 'rgb(var(--aegis-overlay) / 0.04)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
              />
              {/* Priority */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-aegis-text-muted">{t('workshop.priority', 'Priority')}:</span>
                {(['low', 'medium', 'high'] as const).map((p) => {
                  const s = priorityStyle(p);
                  return (
                    <button
                      key={p} onClick={() => setPriority(p)}
                      className="text-[11px] px-3 py-1 rounded-full transition-colors capitalize"
                      style={priority === p
                        ? { background: s.bg, color: s.color, border: `1px solid ${s.border}` }
                        : { border: '1px solid rgb(var(--aegis-overlay) / 0.06)', color: 'rgb(var(--aegis-text-dim))' }
                      }
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              {/* Agent */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-aegis-text-muted">{t('workshop.agent', 'Agent')}:</span>
                <input
                  value={agent} onChange={(e) => setAgent(e.target.value)}
                  placeholder={t('workshop.none', 'None')}
                  className="rounded-lg px-2 py-1 text-[11px] text-aegis-text focus:outline-none w-28"
                  style={{ background: 'rgb(var(--aegis-overlay) / 0.04)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
                />
              </div>
              {/* Tags */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-aegis-text-muted">{t('workshop.tags', 'Tags')}:</span>
                <input
                  value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  placeholder={t('workshop.tagsPlaceholder', 'tag1, tag2, ...')}
                  className="flex-1 rounded-lg px-2 py-1 text-[11px] text-aegis-text focus:outline-none"
                  style={{ background: 'rgb(var(--aegis-overlay) / 0.04)', border: '1px solid rgb(var(--aegis-overlay) / 0.08)' }}
                />
              </div>
            </div>
            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-[13px] text-aegis-text-muted hover:text-aegis-text-secondary transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSubmit} disabled={!title.trim()}
                className="px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40 transition-colors"
                style={{ background: themeHex('primary'), color: 'var(--aegis-bg)' }}
              >
                {t('workshop.create', 'Create')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export function WorkshopPage() {
  const { t } = useTranslation();
  const { tasks, activities, addTask, moveTask, deleteTask, reorderInColumn, setProgress, clearCompleted } = useWorkshopStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

  // ── Filtered tasks ──
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (filterPriority !== 'all') {
      result = result.filter((t) => t.priority === filterPriority);
    }
    return result;
  }, [tasks, searchQuery, filterPriority]);

  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <PageTransition className="p-6 h-full flex flex-col overflow-y-auto">

      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-[26px] font-extrabold text-aegis-text tracking-tight">
            {t('workshop.title', 'Workshop')}
          </h1>
          <p className="text-[11px] text-aegis-text-dim mt-0.5">
            {t('workshop.subtitle', 'Task management & progress tracking')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search toggle */}
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={clsx(
              'p-2 rounded-xl text-[12px] border transition-colors flex items-center gap-1.5',
              showSearch
                ? 'border-aegis-primary/20 bg-aegis-primary/5 text-aegis-primary'
                : 'border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text-secondary',
            )}
            style={!showSearch ? { background: 'rgb(var(--aegis-overlay) / 0.03)' } : undefined}
          >
            <Search size={13} />
          </button>
          {/* Filter */}
          <div className="relative">
            <button
              className={clsx(
                'p-2 rounded-xl text-[12px] border transition-colors flex items-center gap-1.5',
                filterPriority !== 'all'
                  ? 'border-aegis-primary/20 bg-aegis-primary/5 text-aegis-primary'
                  : 'border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-muted hover:text-aegis-text-secondary',
              )}
              style={filterPriority === 'all' ? { background: 'rgb(var(--aegis-overlay) / 0.03)' } : undefined}
              onClick={() => setFilterPriority((v) => {
                const cycle: (Priority | 'all')[] = ['all', 'high', 'medium', 'low'];
                const idx = cycle.indexOf(v);
                return cycle[(idx + 1) % cycle.length];
              })}
              title={filterPriority === 'all'
                ? t('workshop.filterByPriority', 'Filter by priority')
                : t('workshop.showingPriority', { p: filterPriority })}
            >
              <Filter size={13} />
              {filterPriority !== 'all' && (
                <span className="text-[10px] font-semibold uppercase">{filterPriority}</span>
              )}
            </button>
          </div>
          {/* Clear completed */}
          {doneCount > 0 && (
            <button
              onClick={clearCompleted}
              className="p-2 rounded-xl text-[12px] border border-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-dim hover:text-aegis-danger hover:border-aegis-danger/20 transition-colors"
              style={{ background: 'rgb(var(--aegis-overlay) / 0.03)' }}
              title={t('workshop.clearCompleted', 'Clear completed')}
            >
              <Trash2 size={13} />
            </button>
          )}
          {/* New Task */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors"
            style={{
              color: themeHex('primary'),
              border: `1px solid ${themeAlpha('primary', 0.25)}`,
              background: themeAlpha('primary', 0.06),
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = themeAlpha('primary', 0.12); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = themeAlpha('primary', 0.06); }}
          >
            <Plus size={14} /> {t('workshop.addTask', 'New Task')}
          </button>
        </div>
      </div>

      {/* ═══ Search bar (expandable) ═══ */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0 mb-3"
          >
            <div className="relative max-w-sm">
              <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
              <input
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('workshop.searchPlaceholder', 'Search tasks, tags...')}
                autoFocus dir="auto"
                className="w-full rounded-xl ps-9 pe-3 py-2 text-[12px] text-aegis-text placeholder:text-aegis-text-dim focus:outline-none focus:ring-1 focus:ring-aegis-primary/30"
                style={{ background: 'rgb(var(--aegis-overlay) / 0.03)', border: '1px solid rgb(var(--aegis-overlay) / 0.06)' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Stats ═══ */}
      <div className="shrink-0">
        <StatsRow tasks={tasks} />
        <CompletionBar tasks={tasks} />
      </div>

      {/* ═══ Kanban Grid ═══ */}
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        {COLUMNS.map(({ key, labelKey, dotVar }) => {
          const columnTasks = filteredTasks.filter((t) => t.status === key);
          const columnIds = columnTasks.map((t) => t.id);

          return (
            <div key={key} className="flex flex-col min-h-0">
              <div
                className="flex flex-col rounded-2xl overflow-hidden h-full"
                style={{
                  background: 'rgb(var(--aegis-overlay) / 0.025)',
                  border: '1px solid rgb(var(--aegis-overlay) / 0.07)',
                }}
              >
                {/* Column header */}
                <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: `rgb(var(--aegis-${dotVar}))` }} />
                  <span className="text-[13px] font-bold text-aegis-text flex-1">{t(labelKey)}</span>
                  <span
                    className="text-[11px] font-semibold w-[22px] h-[22px] flex items-center justify-center rounded-full"
                    style={{
                      color: themeHex(dotVar),
                      background: themeAlpha(dotVar, 0.1),
                    }}
                  >
                    {columnTasks.length}
                  </span>
                </div>

                {/* Color separator */}
                <div
                  className="mx-3 h-px shrink-0"
                  style={{ background: `linear-gradient(90deg, transparent, ${themeAlpha(dotVar, 0.4)}, transparent)` }}
                />

                {/* Column body */}
                {columnTasks.length > 0 ? (
                  <Reorder.Group
                    axis="y"
                    values={columnIds}
                    onReorder={(newOrder) => reorderInColumn(key, newOrder)}
                    className="space-y-2 overflow-y-auto scrollbar-hidden px-2.5 py-2.5 flex-1"
                  >
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onMove={moveTask} onDelete={deleteTask} onProgress={setProgress} />
                    ))}
                  </Reorder.Group>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-1.5 h-1.5 rounded-full mb-3 opacity-20" style={{ background: `rgb(var(--aegis-${dotVar}))` }} />
                    <span className="text-[11px] text-aegis-text-dim">{t('workshop.empty', 'No tasks')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Add Task Modal ═══ */}
      <AddTaskModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addTask}
      />
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════
// EventModal — Add / Edit / Delete event with full i18n
// State machine: 'form' | 'confirmDelete'
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, ArrowRight } from 'lucide-react';
import { useCalendarStore } from '@/stores/calendarStore';
import { toDateStr } from './calendarUtils';
import { ALL_CATEGORIES, ALL_CHANNELS, REMINDER_PRESETS } from './calendarTypes';
import type { CalendarEvent, EventCategory, RecurrenceFreq, DeliveryChannel } from './calendarTypes';

interface EventModalProps {
  onClose: () => void;
  initialDate?: Date;
  editEvent?: CalendarEvent | null;
}

type ModalMode = 'form' | 'confirmDelete';

// Reminder preset key mapping
const REMINDER_KEYS: Record<number, string> = {
  0: 'calendar.reminder.none',
  5: 'calendar.reminder.5min',
  15: 'calendar.reminder.15min',
  30: 'calendar.reminder.30min',
  60: 'calendar.reminder.1hour',
  120: 'calendar.reminder.2hours',
  1440: 'calendar.reminder.1day',
  10080: 'calendar.reminder.1week',
};

// Recurrence key mapping
const RECURRENCE_KEYS: Record<string, string> = {
  '': 'calendar.recurrence.none',
  daily: 'calendar.recurrence.daily',
  weekly: 'calendar.recurrence.weekly',
  monthly: 'calendar.recurrence.monthly',
  yearly: 'calendar.recurrence.yearly',
};

export function EventModal({ onClose, initialDate, editEvent }: EventModalProps) {
  const { t } = useTranslation();
  const { addEvent, updateEvent, deleteEvent, settings } = useCalendarStore();

  const isEdit = !!editEvent;
  const [mode, setMode] = useState<ModalMode>('form');
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState(editEvent?.title || '');
  const [date, setDate] = useState(editEvent?.date || (initialDate ? toDateStr(initialDate) : toDateStr(new Date())));
  const [startTime, setStartTime] = useState(editEvent?.startTime || '');
  const [endTime, setEndTime] = useState(editEvent?.endTime || '');
  const [allDay, setAllDay] = useState(editEvent?.allDay ?? false);
  const [location, setLocation] = useState(editEvent?.location || '');
  const [notes, setNotes] = useState(editEvent?.notes || '');
  const [category, setCategory] = useState<EventCategory>(editEvent?.category || 'other');
  const [reminder, setReminder] = useState(editEvent?.reminderMinutes ?? settings.defaultReminder);
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | ''>(editEvent?.recurrence?.freq || '');
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>(editEvent?.deliveryChannel || settings.defaultDeliveryChannel);

  // Keyboard: Escape to close, Enter to save
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mode === 'confirmDelete') setMode('form');
      else onClose();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && mode === 'form') {
      handleSave();
    }
  }, [mode, title, date]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const eventData = {
      title: title.trim(),
      date,
      startTime: allDay ? undefined : (startTime || undefined),
      endTime: allDay ? undefined : (endTime || undefined),
      allDay,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      category,
      reminderMinutes: allDay ? 0 : reminder,
      deliveryChannel,
      recurrence: recurrence ? { freq: recurrence, interval: 1 } : undefined,
      status: 'scheduled' as const,
    };

    if (isEdit && editEvent) {
      await updateEvent(editEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }

    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!editEvent) return;
    setSaving(true);
    await deleteEvent(editEvent.id);
    setSaving(false);
    onClose();
  };

  // ── Confirm Delete View ──
  if (mode === 'confirmDelete') {
    return (
      <Overlay onClose={onClose}>
        <div className="text-center py-4">
          <div className="text-4xl mb-3">🗑️</div>
          <h2 className="text-[16px] font-bold text-aegis-text mb-2">{t('calendar.deleteConfirm')}</h2>
          <p className="text-[13px] text-aegis-text-dim mb-1">{editEvent?.title}</p>
          {editEvent?.reminderCronJobId && (
            <p className="text-[12px] text-aegis-warning">{t('calendar.deleteConfirmHint')}</p>
          )}
        </div>
        <div className="flex gap-2 justify-center mt-4">
          <button onClick={() => setMode('form')} className="btn-secondary">
            {t('calendar.actions.back')}
          </button>
          <button onClick={handleDelete} disabled={saving}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-aegis-danger text-white hover:brightness-110 transition-colors disabled:opacity-50">
            {saving ? '...' : t('calendar.actions.delete')}
          </button>
        </div>
      </Overlay>
    );
  }

  // ── Form View ──
  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[18px] font-bold text-aegis-text flex items-center gap-2">
          📅 {isEdit ? t('calendar.editEvent') : t('calendar.newEvent')}
        </h2>
        <div className="flex items-center gap-1">
          {isEdit && (
            <button onClick={() => setMode('confirmDelete')} title={t('calendar.actions.delete')}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--color-red-400)/0.1)] text-aegis-text-dim hover:text-[rgb(var(--color-red-400))] transition-colors">
              <Trash2 size={16} />
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--aegis-overlay)/0.06)] text-aegis-text-dim hover:text-aegis-text transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3.5">
        <Field label={t('calendar.field.title')}>
          <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('calendar.field.titlePlaceholder')}
            className="field-input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('calendar.field.date')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input" />
          </Field>
          <Field label={t('calendar.field.category')}>
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} className="field-input">
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(`calendar.categoryIcon.${cat}`)} {t(`calendar.category.${cat}`)}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* All-day toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)}
            className="w-4 h-4 rounded border-aegis-border bg-aegis-elevated accent-[rgb(var(--color-teal-400))]" />
          <span className="text-[13px] text-aegis-text">{t('calendar.allDay')}</span>
        </label>

        {/* Time fields (hidden when all-day) */}
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('calendar.field.startTime')}>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="field-input" />
            </Field>
            <Field label={t('calendar.field.endTime')}>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="field-input" />
            </Field>
          </div>
        )}

        <Field label={t('calendar.field.location')}>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder={t('calendar.field.locationPlaceholder')} className="field-input" />
        </Field>

        <Field label={t('calendar.field.notes')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={t('calendar.field.notesPlaceholder')} rows={2}
            className="field-input resize-none" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('calendar.field.reminder')}>
            <select value={reminder} onChange={(e) => setReminder(Number(e.target.value))} className="field-input" disabled={allDay}>
              {REMINDER_PRESETS.map((m) => (
                <option key={m} value={m}>{t(REMINDER_KEYS[m])}</option>
              ))}
            </select>
          </Field>
          <Field label={t('calendar.delivery.label')}>
            <select value={deliveryChannel} onChange={(e) => setDeliveryChannel(e.target.value as DeliveryChannel)}
              className="field-input" disabled={allDay || reminder === 0}>
              {ALL_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>{t(`calendar.delivery.${ch}`)}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('calendar.field.recurrence')}>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceFreq | '')} className="field-input">
            {Object.entries(RECURRENCE_KEYS).map(([val, key]) => (
              <option key={val} value={val}>{t(key)}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="btn-secondary">{t('calendar.actions.cancel')}</button>
        <button onClick={handleSave} disabled={!title.trim() || saving}
          className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-aegis-primary text-aegis-btn-primary-text hover:bg-aegis-primary-hover transition-colors disabled:opacity-50 shadow-md shadow-[rgb(var(--color-teal-400)/0.2)]">
          {saving ? t('calendar.actions.saving') : t('calendar.actions.save')}
        </button>
      </div>
    </Overlay>
  );
}

// ── Shared sub-components ──

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[420px] max-h-[90vh] overflow-y-auto rounded-2xl bg-aegis-menu-bg border border-aegis-border p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-aegis-text-dim uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

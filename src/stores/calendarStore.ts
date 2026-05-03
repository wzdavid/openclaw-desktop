// ═══════════════════════════════════════════════════════════
// Calendar Store — Zustand state with localStorage + Cron reminders
// Offline-first: events persist locally, cron syncs when connected
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { gateway } from '@/services/gateway';
import type { CalendarEvent, CalendarFilter, CalendarSettings } from '@/pages/Calendar/calendarTypes';
import { DEFAULT_SETTINGS, DEFAULT_FILTER } from '@/pages/Calendar/calendarTypes';
import { generateEventId, getLocalTimezone } from '@/pages/Calendar/calendarUtils';

// ── localStorage persistence ──

const EVENTS_KEY = 'aegis-calendar-events';
const SETTINGS_KEY = 'aegis-calendar-settings';

function persistEvents(events: CalendarEvent[]): void {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch { /* quota exceeded */ }
}

function loadPersistedEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSettings(settings: CalendarSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* */ }
}

function loadPersistedSettings(): CalendarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

// ── Cron reminder helpers ──

async function createCronReminder(event: CalendarEvent): Promise<string | null> {
  if (event.reminderMinutes <= 0 || event.allDay || !event.startTime) return null;

  const eventDateTime = new Date(`${event.date}T${event.startTime}:00`);
  const reminderTime = new Date(eventDateTime.getTime() - event.reminderMinutes * 60000);

  // Skip past reminders
  if (reminderTime.getTime() <= Date.now()) return null;

  const isRecurring = !!event.recurrence;

  try {
    const result = await gateway.call('cron.add', {
      job: {
        name: `📅 ${event.title}`,
        schedule: isRecurring
          ? { kind: 'cron', expr: buildCronExpr(event), tz: getLocalTimezone() }
          : { kind: 'at', at: reminderTime.toISOString() },
        sessionTarget: 'isolated',
        payload: {
          kind: 'agentTurn',
          message: buildReminderMessage(event),
        },
        delivery: { mode: 'none' },
        deleteAfterRun: !isRecurring,
        enabled: true,
      },
    });
    return result?.id || result?.jobId || null;
  } catch (err) {
    console.error('[Calendar] Failed to create cron reminder:', err);
    return null;
  }
}

async function removeCronReminder(jobId: string): Promise<void> {
  try {
    await gateway.call('cron.remove', { jobId });
  } catch (err) {
    console.error('[Calendar] Failed to remove cron reminder:', err);
  }
}

function buildCronExpr(event: CalendarEvent): string {
  if (!event.recurrence || !event.startTime) return '0 0 * * *';

  const [hours, minutes] = event.startTime.split(':').map(Number);
  // Subtract reminder offset
  let remM = minutes - event.reminderMinutes;
  let remH = hours;
  while (remM < 0) { remM += 60; remH--; }
  if (remH < 0) remH += 24;

  const { freq, interval } = event.recurrence;

  switch (freq) {
    case 'daily':
      return interval === 1
        ? `${remM} ${remH} * * *`
        : `${remM} ${remH} */${interval} * *`;
    case 'weekly': {
      const dow = new Date(event.date).getDay();
      return `${remM} ${remH} * * ${dow}`;
    }
    case 'monthly': {
      const dom = new Date(event.date).getDate();
      return `${remM} ${remH} ${dom} */${interval || 1} *`;
    }
    case 'yearly': {
      const d = new Date(event.date);
      return `${remM} ${remH} ${d.getDate()} ${d.getMonth() + 1} *`;
    }
    default:
      return `${remM} ${remH} * * *`;
  }
}

function buildReminderMessage(event: CalendarEvent): string {
  const channelInstruction = event.deliveryChannel === 'last'
    ? 'Send this reminder to the user via the most recent active channel.'
    : `Send this reminder to the user via ${event.deliveryChannel}. Use the message tool with channel="${event.deliveryChannel}".`;

  return [
    `⏰ Calendar Reminder: ${event.title}`,
    event.startTime
      ? `Time: ${event.startTime}${event.endTime ? ` – ${event.endTime}` : ''}`
      : 'All day event',
    event.location ? `Location: ${event.location}` : '',
    event.notes ? `Notes: ${event.notes}` : '',
    '',
    channelInstruction,
    `The event starts in ${event.reminderMinutes} minutes.`,
  ].filter(Boolean).join('\n');
}

// ── Store definition ──

interface CalendarState {
  events: CalendarEvent[];
  settings: CalendarSettings;
  filter: CalendarFilter;
  selectedDate: Date;
  view: 'month' | 'week' | 'day';
  loading: boolean;
  error: string | null;

  // Actions — navigation
  setView: (view: 'month' | 'week' | 'day') => void;
  setSelectedDate: (date: Date) => void;
  navigate: (delta: number) => void;
  goToToday: () => void;

  // Actions — CRUD
  loadEvents: () => void;
  addEvent: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'reminderStatus' | 'reminderCronJobId'>) => Promise<CalendarEvent>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Actions — filter & settings
  setFilter: (patch: Partial<CalendarFilter>) => void;
  updateSettings: (patch: Partial<CalendarSettings>) => void;

  // Actions — cron sync
  syncPendingReminders: () => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  settings: loadPersistedSettings(),
  filter: DEFAULT_FILTER,
  selectedDate: new Date(),
  view: loadPersistedSettings().defaultView,
  loading: false,
  error: null,

  // ── Navigation ──

  setView: (view) => set({ view }),

  setSelectedDate: (date) => set({ selectedDate: date }),

  navigate: (delta) => {
    const { selectedDate, view } = get();
    const d = new Date(selectedDate);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    set({ selectedDate: d });
  },

  goToToday: () => set({ selectedDate: new Date() }),

  // ── CRUD ──

  loadEvents: () => {
    set({ loading: true, error: null });
    try {
      const events = loadPersistedEvents();
      set({ events, loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Load failed', loading: false });
    }
  },

  addEvent: async (data) => {
    const now = new Date().toISOString();
    const event: CalendarEvent = {
      ...data,
      id: generateEventId(),
      source: 'local',
      reminderStatus: data.reminderMinutes > 0 ? 'pending' : 'none',
      reminderCronJobId: undefined,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save locally (offline-first)
    set((s) => ({ events: [...s.events, event] }));
    persistEvents(get().events);

    // 2. Create cron reminder (if possible)
    if (event.reminderMinutes > 0) {
      const cronId = await createCronReminder(event);
      if (cronId) {
        set((s) => ({
          events: s.events.map((e) =>
            e.id === event.id ? { ...e, reminderCronJobId: cronId, reminderStatus: 'scheduled' } : e
          ),
        }));
        persistEvents(get().events);
        event.reminderCronJobId = cronId;
        event.reminderStatus = 'scheduled';
      }
    }

    return event;
  },

  updateEvent: async (id, updates) => {
    const old = get().events.find((e) => e.id === id);
    if (!old) return;

    const updated = { ...old, ...updates, updatedAt: new Date().toISOString() };

    set((s) => ({ events: s.events.map((e) => (e.id === id ? updated : e)) }));
    persistEvents(get().events);

    // Update cron if reminder changed
    const reminderChanged =
      updates.reminderMinutes !== undefined ||
      updates.startTime !== undefined ||
      updates.date !== undefined ||
      updates.title !== undefined;

    if (reminderChanged && old.reminderCronJobId) {
      await removeCronReminder(old.reminderCronJobId);
    }

    if (reminderChanged && updated.reminderMinutes > 0) {
      const cronId = await createCronReminder(updated);
      set((s) => ({
        events: s.events.map((e) =>
          e.id === id
            ? { ...e, reminderCronJobId: cronId || undefined, reminderStatus: cronId ? 'scheduled' : 'pending' }
            : e
        ),
      }));
      persistEvents(get().events);
    }
  },

  deleteEvent: async (id) => {
    const event = get().events.find((e) => e.id === id);
    if (!event) return;

    // Remove cron job if exists
    if (event.reminderCronJobId) {
      await removeCronReminder(event.reminderCronJobId);
    }

    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
    persistEvents(get().events);
  },

  // ── Filter & Settings ──

  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),

  updateSettings: (patch) => {
    set((s) => {
      const settings = { ...s.settings, ...patch };
      persistSettings(settings);
      return { settings };
    });
  },

  // ── Cron sync (for events added while offline) ──

  syncPendingReminders: async () => {
    const { events } = get();
    const pending = events.filter(
      (e) => e.reminderMinutes > 0 && e.reminderStatus === 'pending' && !e.reminderCronJobId
    );

    for (const event of pending) {
      const cronId = await createCronReminder(event);
      if (cronId) {
        set((s) => ({
          events: s.events.map((e) =>
            e.id === event.id ? { ...e, reminderCronJobId: cronId, reminderStatus: 'scheduled' } : e
          ),
        }));
      }
    }
    persistEvents(get().events);
  },
}));

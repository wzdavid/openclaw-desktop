// ═══════════════════════════════════════════════════════════
// Calendar Types — Single source of truth for all calendar data
// ═══════════════════════════════════════════════════════════

export type EventCategory = 'work' | 'personal' | 'health' | 'social' | 'education' | 'other';
export type EventSource = 'local' | 'memory' | 'ics';
export type ReminderStatus = 'pending' | 'scheduled' | 'fired' | 'failed' | 'none';
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type DeliveryChannel = 'last' | 'telegram' | 'discord' | 'whatsapp' | 'signal' | 'slack';

export interface CalendarEvent {
  id: string;
  title: string;

  // Timing
  date: string;           // YYYY-MM-DD
  startTime?: string;     // HH:MM (omit = all-day)
  endTime?: string;       // HH:MM (omit = 1 hour default)
  allDay: boolean;

  // Details
  location?: string;
  notes?: string;
  category: EventCategory;
  color?: string;         // Override category color

  // Source
  source: EventSource;
  externalId?: string;    // Notion ID / ICS UID / Memory ref

  // Reminder → OpenClaw Cron
  reminderMinutes: number;       // 0 = no reminder
  reminderCronJobId?: string;    // Linked cron job ID
  reminderStatus: ReminderStatus;
  deliveryChannel: DeliveryChannel;

  // Recurrence (basic for v2.0)
  recurrence?: {
    freq: RecurrenceFreq;
    interval: number;      // every N days/weeks/months/years
    until?: string;        // YYYY-MM-DD end date
    count?: number;        // or N occurrences
  };

  // Meta
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface CalendarFilter {
  categories: EventCategory[];
  sources: EventSource[];
  search: string;
  showCompleted: boolean;
}

export interface CalendarSettings {
  weekStartDay: 0 | 1 | 6;   // 0=Sun, 1=Mon, 6=Sat
  defaultView: 'month' | 'week' | 'day';
  defaultReminder: number;    // minutes
  timelineStart: number;      // hour (0-23)
  timelineEnd: number;        // hour (0-23)
  defaultDeliveryChannel: DeliveryChannel;
}

// Category colors from design primitives
export const CAT_COLORS: Record<EventCategory, string> = {
  work:      'rgb(108 159 255)',  // --color-blue-400
  personal:  'rgb(78 201 176)',   // --color-teal-400
  health:    'rgb(244 112 103)',  // --color-red-400
  social:    'rgb(232 184 78)',   // --color-amber-400
  education: 'rgb(164 134 255)', // purple
  other:     'rgb(139 148 158)',  // --color-slate-400
};

// All available categories for iteration
export const ALL_CATEGORIES: EventCategory[] = ['work', 'personal', 'health', 'social', 'education', 'other'];

// Delivery channels
export const ALL_CHANNELS: DeliveryChannel[] = ['last', 'telegram', 'discord', 'whatsapp', 'signal', 'slack'];

// Reminder presets (minutes)
export const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 10080] as const;

// Default settings
export const DEFAULT_SETTINGS: CalendarSettings = {
  weekStartDay: 6,       // Saturday (Saudi)
  defaultView: 'month',
  defaultReminder: 30,
  timelineStart: 0,
  timelineEnd: 23,
  defaultDeliveryChannel: 'telegram',
};

// Default filter (show everything)
export const DEFAULT_FILTER: CalendarFilter = {
  categories: [...ALL_CATEGORIES],
  sources: ['local', 'memory', 'ics'],
  search: '',
  showCompleted: false,
};

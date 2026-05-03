// ═══════════════════════════════════════════════════════════
// Calendar Utilities — Date helpers, formatting, week logic
// Uses Intl.DateTimeFormat for locale-aware names (no hardcoded strings)
// ═══════════════════════════════════════════════════════════

import type { CalendarEvent, CalendarSettings } from './calendarTypes';
import { CAT_COLORS, DEFAULT_SETTINGS } from './calendarTypes';

// ── Date basics ──

/** Days in a given month (0-indexed month) */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Format Date as YYYY-MM-DD */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Check if two dates are the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Parse YYYY-MM-DD to Date (local timezone) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ── Week logic ──

/**
 * Get ordered day-of-week indices for grid headers.
 * weekStart: 0=Sun, 1=Mon, 6=Sat
 * Returns array of 7 indices (0=Sun..6=Sat) starting from weekStart.
 */
export function getWeekOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}

/**
 * Get the offset (number of cells to skip) before day 1 of a month.
 * Accounts for which day the week starts on.
 */
export function firstDayOffset(year: number, month: number, weekStart: number): number {
  const dow = new Date(year, month, 1).getDay(); // 0=Sun
  return (dow - weekStart + 7) % 7;
}

/**
 * Get the 7 dates for the week containing `d`, starting from weekStart.
 */
export function getWeekDates(d: Date, weekStart: number): Date[] {
  const dow = d.getDay();
  const offset = (dow - weekStart + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}

// ── Locale-aware names (via Intl — no hardcoded strings) ──

/** Get localized day name. dayIndex: 0=Sun..6=Sat */
export function getDayName(dayIndex: number, locale: string, format: 'long' | 'short' | 'narrow' = 'short'): string {
  // Jan 4, 2026 is a Sunday (dayIndex 0)
  const date = new Date(2026, 0, 4 + dayIndex);
  return new Intl.DateTimeFormat(locale, { weekday: format }).format(date);
}

/** Get localized month name. monthIndex: 0=Jan..11=Dec */
export function getMonthName(monthIndex: number, locale: string, format: 'long' | 'short' = 'long'): string {
  const date = new Date(2026, monthIndex, 1);
  return new Intl.DateTimeFormat(locale, { month: format }).format(date);
}

// ── Event helpers ──

/** Get events for a specific date string, sorted by time */
export function eventsForDate(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  return events
    .filter(e => e.date === dateStr && e.status !== 'cancelled')
    .sort((a, b) => {
      // All-day events first
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
}

/** Get event duration in minutes (default 60 if no endTime) */
export function getEventDuration(event: CalendarEvent): number {
  if (event.allDay) return 1440;
  if (!event.startTime) return 60;
  if (!event.endTime) return 60;

  const [sh, sm] = event.startTime.split(':').map(Number);
  const [eh, em] = event.endTime.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 60;
}

/** Get color for an event (custom color > category color) */
export function getEventColor(event: CalendarEvent): string {
  return event.color || CAT_COLORS[event.category] || CAT_COLORS.other;
}

/** Generate timeline hours array from settings */
export function getTimelineHours(settings: CalendarSettings = DEFAULT_SETTINGS): number[] {
  const start = settings.timelineStart;
  const end = settings.timelineEnd;
  const count = end - start + 1;
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Get user's local timezone (for cron scheduling) */
export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Build a unique event ID */
export function generateEventId(): string {
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

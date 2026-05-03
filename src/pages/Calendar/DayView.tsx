// ═══════════════════════════════════════════════════════════
// DayView — Single day detailed timeline + sidebar summary
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarStore } from '@/stores/calendarStore';
import { EventCard } from './EventCard';
import { ReminderBadge } from './ReminderBadge';
import {
  eventsForDate, toDateStr, isSameDay,
  getTimelineHours, getEventDuration, getEventColor,
} from './calendarUtils';
import type { CalendarEvent } from './calendarTypes';

interface DayViewProps {
  onEventClick: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT = 64;

export function DayView({ onEventClick }: DayViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { selectedDate, events, settings, filter } = useCalendarStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = getTimelineHours(settings);

  // Live clock
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const isToday = isSameDay(selectedDate, now);
  const nowHour = now.getHours() + now.getMinutes() / 60;

  // Scroll to current hour
  useEffect(() => {
    if (scrollRef.current && isToday) {
      scrollRef.current.scrollTop = Math.max(0, (nowHour - settings.timelineStart - 0.5) * HOUR_HEIGHT);
    }
  }, [isToday]);

  const dateStr = toDateStr(selectedDate);

  // Filter events
  const dayEvents = useMemo(() => {
    const filtered = events.filter((e) =>
      filter.categories.includes(e.category) &&
      (filter.showCompleted || e.status !== 'completed') &&
      e.status !== 'cancelled'
    );
    return eventsForDate(filtered, dateStr);
  }, [events, dateStr, filter]);

  const allDayEvents = dayEvents.filter((e) => e.allDay || !e.startTime);
  const timedEvents = dayEvents.filter((e) => !e.allDay && e.startTime);

  // Summary stats
  const totalMinutes = timedEvents.reduce((sum, e) => sum + getEventDuration(e), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
          {/* Hour rows */}
          {hours.map((h) => {
            const top = (h - settings.timelineStart) * HOUR_HEIGHT;
            return (
              <div key={h} className="absolute left-0 right-0 flex border-t border-aegis-border"
                style={{ top, height: HOUR_HEIGHT }}>
                <div className="w-[70px] shrink-0 text-[12px] font-mono text-aegis-text-dim text-center pt-1">
                  {String(h).padStart(2, '0')}:00
                </div>
                <div className="flex-1 border-aegis-border" style={{ borderInlineStart: '1px solid' }} />
              </div>
            );
          })}

          {/* Timed events */}
          {timedEvents.map((ev) => {
            const [hh, mm] = ev.startTime!.split(':').map(Number);
            const top = (hh - settings.timelineStart + mm / 60) * HOUR_HEIGHT;
            if (top < 0) return null;
            const duration = getEventDuration(ev);
            const height = Math.max((duration / 60) * HOUR_HEIGHT, HOUR_HEIGHT * 0.75);

            return (
              <div key={ev.id} className="absolute" style={{
                top,
                height,
                insetInlineStart: 80,
                insetInlineEnd: 16,
              }}>
                <EventCard event={ev} variant="full" showReminder onClick={() => onEventClick(ev)} />
              </div>
            );
          })}

          {/* All-day events (pinned at top) */}
          {allDayEvents.length > 0 && (
            <div className="absolute top-1 bg-aegis-elevated rounded-lg px-3 py-2"
              style={{ insetInlineStart: 80, insetInlineEnd: 16 }}>
              <div className="text-[11px] font-semibold text-aegis-text-dim mb-1">{t('calendar.allDay')}</div>
              {allDayEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} variant="compact" onClick={() => onEventClick(ev)} />
              ))}
            </div>
          )}

          {/* Current time indicator */}
          {isToday && nowHour >= settings.timelineStart && nowHour <= settings.timelineEnd && (
            <div className="absolute z-10 pointer-events-none"
              style={{
                top: (nowHour - settings.timelineStart) * HOUR_HEIGHT,
                insetInlineStart: 70,
                insetInlineEnd: 0,
              }}>
              <div className="h-[2px] bg-aegis-danger relative">
                <div className="absolute -top-[4px] w-[10px] h-[10px] rounded-full bg-aegis-danger"
                  style={{ insetInlineStart: -1 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar: day summary */}
      <div className="w-[220px] p-4 bg-aegis-surface overflow-y-auto"
        style={{ borderInlineStart: '1px solid var(--aegis-border)' }}>
        <h3 className="text-[12px] font-semibold text-aegis-text-dim uppercase tracking-wider mb-3">
          {t('calendar.daySummary')}
        </h3>

        {/* Stats */}
        <div className="flex items-center gap-3 mb-4 text-[12px] text-aegis-text-muted">
          <span>{t('calendar.eventCount', { count: dayEvents.length })}</span>
          {totalHours > 0 && <span>· {totalHours}h</span>}
        </div>

        {dayEvents.length === 0 ? (
          <p className="text-[13px] text-aegis-text-dim">{t('calendar.noEvents')}</p>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((ev) => {
              const color = getEventColor(ev);
              return (
                <div key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className="p-2 rounded-lg bg-aegis-card border border-aegis-border cursor-pointer hover:border-[rgb(var(--color-teal-400)/0.3)] transition-colors">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[11px] font-mono text-aegis-text-dim">
                      {ev.startTime || '—'}
                      {ev.endTime && ` – ${ev.endTime}`}
                    </span>
                    <ReminderBadge status={ev.reminderStatus} size="sm" />
                  </div>
                  <div className="text-[12px] font-medium text-aegis-text mt-0.5">
                    {ev.title || t('calendar.untitled')}
                  </div>
                  {ev.location && (
                    <div className="text-[10px] text-aegis-text-dim">📍 {ev.location}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

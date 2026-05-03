// ═══════════════════════════════════════════════════════════
// WeekView — 7-day timeline with real event durations
// Current time indicator updates every 60 seconds
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCalendarStore } from '@/stores/calendarStore';
import { EventCard } from './EventCard';
import {
  getWeekDates, eventsForDate, toDateStr, isSameDay,
  getTimelineHours, getDayName, getEventDuration,
} from './calendarUtils';
import type { CalendarEvent } from './calendarTypes';

interface WeekViewProps {
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT = 56; // px per hour

export function WeekView({ onDateClick, onEventClick }: WeekViewProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { selectedDate, events, settings, filter } = useCalendarStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDates = useMemo(() => getWeekDates(selectedDate, settings.weekStartDay), [selectedDate, settings.weekStartDay]);
  const hours = getTimelineHours(settings);

  // Live clock — updates every minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const nowHour = now.getHours() + now.getMinutes() / 60;

  // Scroll to current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = Math.max(0, (nowHour - settings.timelineStart - 0.5) * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  // Filter events
  const filteredEvents = useMemo(() =>
    events.filter((e) =>
      filter.categories.includes(e.category) &&
      (filter.showCompleted || e.status !== 'completed') &&
      e.status !== 'cancelled'
    ),
    [events, filter],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid shrink-0 border-b border-aegis-border bg-aegis-surface-solid"
        style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
        <div /> {/* Time gutter */}
        {weekDates.map((date, i) => {
          const isToday = isSameDay(date, now);
          return (
            <div key={i} onClick={() => onDateClick(date)}
              className={clsx(
                'py-2.5 text-center cursor-pointer border-aegis-border transition-colors',
                'border-inline-start',
                isToday && 'bg-aegis-primary-surface',
              )}>
              <div className="text-[11px] font-semibold text-aegis-text-dim uppercase">
                {getDayName(date.getDay(), locale)}
              </div>
              <div className={clsx(
                'w-8 h-8 mx-auto mt-0.5 flex items-center justify-center rounded-full text-[14px] font-bold',
                isToday ? 'bg-aegis-primary text-aegis-btn-primary-text' : 'text-aegis-text-muted',
              )}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid relative" style={{
          gridTemplateColumns: '60px repeat(7, 1fr)',
          height: hours.length * HOUR_HEIGHT,
        }}>
          {/* Hour labels + grid lines */}
          {hours.map((h) => {
            const top = (h - settings.timelineStart) * HOUR_HEIGHT;
            return (
              <div key={h} className="contents">
                <div className="absolute w-[60px] text-[11px] font-mono text-aegis-text-dim text-center -translate-y-1/2"
                  style={{ top, left: 0 }}>
                  {String(h).padStart(2, '0')}:00
                </div>
                <div className="absolute border-t border-aegis-border" style={{ top, left: 60, right: 0 }} />
              </div>
            );
          })}

          {/* Day columns with events */}
          {weekDates.map((date, colIdx) => {
            const dateStr = toDateStr(date);
            const dayEvents = eventsForDate(filteredEvents, dateStr);
            const isToday = isSameDay(date, now);

            return (
              <div key={colIdx}
                className={clsx(
                  'relative border-aegis-border',
                  'border-inline-start',
                  isToday && 'bg-[rgb(var(--aegis-overlay)/0.015)]',
                )}
                style={{ gridColumn: colIdx + 2 }}>
                {/* Events */}
                {dayEvents.map((ev) => {
                  if (!ev.startTime || ev.allDay) return null;
                  const [hh, mm] = ev.startTime.split(':').map(Number);
                  const top = (hh - settings.timelineStart + mm / 60) * HOUR_HEIGHT;
                  if (top < 0) return null;
                  const duration = getEventDuration(ev);
                  const height = Math.max((duration / 60) * HOUR_HEIGHT, HOUR_HEIGHT * 0.5);

                  return (
                    <div key={ev.id} className="absolute inset-inline-1" style={{ top, height }}>
                      <EventCard event={ev} variant="medium" showReminder onClick={() => onEventClick(ev)} />
                    </div>
                  );
                })}

                {/* Current time indicator */}
                {isToday && nowHour >= settings.timelineStart && nowHour <= settings.timelineEnd && (
                  <div className="absolute inset-inline-0 z-10 pointer-events-none"
                    style={{ top: (nowHour - settings.timelineStart) * HOUR_HEIGHT }}>
                    <div className="h-[2px] bg-aegis-danger relative">
                      <div className="absolute -top-[4px] w-[10px] h-[10px] rounded-full bg-aegis-danger"
                        style={{ insetInlineStart: -1 }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

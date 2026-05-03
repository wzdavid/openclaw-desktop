// ═══════════════════════════════════════════════════════════
// MonthView — Full month grid calendar
// Week order respects settings.weekStartDay
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCalendarStore } from '@/stores/calendarStore';
import { EventCard } from './EventCard';
import {
  daysInMonth, firstDayOffset, eventsForDate, toDateStr,
  getWeekOrder, getDayName,
} from './calendarUtils';
import type { CalendarEvent } from './calendarTypes';

interface MonthViewProps {
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function MonthView({ onDateClick, onEventClick }: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { selectedDate, events, settings, filter } = useCalendarStore();

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const weekOrder = getWeekOrder(settings.weekStartDay);
  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const totalDays = daysInMonth(year, month);
  const offset = firstDayOffset(year, month, settings.weekStartDay);
  const prevMonthDays = daysInMonth(year, month - 1);

  // Filter events by active categories
  const filteredEvents = useMemo(() =>
    events.filter((e) =>
      filter.categories.includes(e.category) &&
      (filter.showCompleted || e.status !== 'completed') &&
      e.status !== 'cancelled'
    ),
    [events, filter],
  );

  // Build grid cells
  const cells = useMemo(() => {
    const result: Array<{ day: number; dateStr: string; isOther: boolean; isToday: boolean }> = [];

    // Previous month fill
    for (let i = offset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      result.push({
        day: d,
        dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isOther: true,
        isToday: false,
      });
    }

    // Current month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.push({ day: d, dateStr, isOther: false, isToday: dateStr === todayStr });
    }

    // Next month fill
    const remaining = (7 - (result.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      result.push({
        day: d,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isOther: true,
        isToday: false,
      });
    }

    return result;
  }, [year, month, totalDays, offset, prevMonthDays, todayStr]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-aegis-border bg-aegis-surface-solid shrink-0">
        {weekOrder.map((d) => (
          <div key={d} className="py-2.5 text-center text-[12px] font-semibold text-aegis-text-dim uppercase tracking-wider">
            {getDayName(d, locale)}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {cells.map((cell, idx) => {
          const dayEvents = eventsForDate(filteredEvents, cell.dateStr);
          return (
            <div
              key={idx}
              onClick={() => {
                const [y, m, d] = cell.dateStr.split('-').map(Number);
                onDateClick(new Date(y, m - 1, d));
              }}
              className={clsx(
                'border-b border-aegis-border p-1.5 flex flex-col gap-0.5 cursor-pointer transition-colors min-h-0 overflow-hidden',
                'border-inline-start border-aegis-border',
                cell.isOther && 'opacity-20',
                cell.isToday && 'bg-[rgb(var(--aegis-overlay)/0.02)]',
                !cell.isOther && !cell.isToday && 'hover:bg-[rgb(var(--aegis-overlay)/0.015)]',
              )}
            >
              {/* Day number */}
              <div className={clsx(
                'w-7 h-7 flex items-center justify-center rounded-full text-[12px] font-medium shrink-0',
                cell.isToday ? 'bg-aegis-primary text-aegis-btn-primary-text font-bold' : 'text-aegis-text-muted',
              )}>
                {cell.day}
              </div>

              {/* Events (max 3) */}
              {dayEvents.slice(0, 3).map((ev) => (
                <EventCard key={ev.id} event={ev} variant="compact" onClick={() => onEventClick(ev)} />
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-aegis-text-dim px-1.5">
                  {t('calendar.moreEvents', { n: dayEvents.length - 3 })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

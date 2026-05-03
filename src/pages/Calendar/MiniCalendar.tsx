// ═══════════════════════════════════════════════════════════
// MiniCalendar — Compact sidebar calendar with event dots
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCalendarStore } from '@/stores/calendarStore';
import { daysInMonth, firstDayOffset, toDateStr, isSameDay, getWeekOrder, getDayName, getMonthName } from './calendarUtils';

interface MiniCalendarProps {
  onSelectDate: (date: Date) => void;
}

export function MiniCalendar({ onSelectDate }: MiniCalendarProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { selectedDate, settings, events } = useCalendarStore();

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const weekOrder = getWeekOrder(settings.weekStartDay);

  const totalDays = daysInMonth(year, month);
  const offset = firstDayOffset(year, month, settings.weekStartDay);
  const prevDays = daysInMonth(year, month - 1);

  const today = useMemo(() => toDateStr(new Date()), []);

  // Dates with events (for dot indicators)
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => { if (e.date && e.status !== 'cancelled') set.add(e.date.split('T')[0]); });
    return set;
  }, [events]);

  return (
    <div className="rounded-xl bg-aegis-elevated border border-aegis-border p-3">
      {/* Month header */}
      <div className="flex items-center justify-center mb-2 px-1">
        <span className="text-[13px] font-semibold text-aegis-text">
          {getMonthName(month, locale)} {year}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {/* Day headers */}
        {weekOrder.map((d) => (
          <div key={d} className="text-[10px] font-semibold text-aegis-text-dim py-1">
            {getDayName(d, locale, 'narrow')}
          </div>
        ))}

        {/* Previous month fill */}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`p${i}`} className="text-[11px] py-1 text-aegis-text-dim opacity-20">
            {prevDays - offset + 1 + i}
          </div>
        ))}

        {/* Current month days */}
        {Array.from({ length: totalDays }, (_, i) => {
          const d = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const isSelected = isSameDay(new Date(year, month, d), selectedDate);
          const hasEvent = eventDates.has(dateStr);

          return (
            <div
              key={d}
              onClick={() => onSelectDate(new Date(year, month, d))}
              className={clsx(
                'text-[11px] py-1 rounded-lg cursor-pointer relative transition-all',
                isToday
                  ? 'bg-aegis-primary text-aegis-btn-primary-text font-bold'
                  : isSelected
                    ? 'bg-aegis-primary-surface text-aegis-primary font-semibold'
                    : 'text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.04)]',
              )}
            >
              {d}
              {hasEvent && (
                <div
                  className={clsx(
                    'absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                    isToday ? 'bg-aegis-btn-primary-text' : 'bg-aegis-primary',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

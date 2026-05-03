// ═══════════════════════════════════════════════════════════
// EventCard — Reusable event display (compact/medium/full)
// Used in MonthView, WeekView, DayView, UpcomingEvents
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import { MapPin, Repeat } from 'lucide-react';
import { ReminderBadge } from './ReminderBadge';
import { getEventColor } from './calendarUtils';
import type { CalendarEvent } from './calendarTypes';

interface EventCardProps {
  event: CalendarEvent;
  variant?: 'compact' | 'medium' | 'full';
  showReminder?: boolean;
  onClick?: () => void;
}

export function EventCard({ event, variant = 'medium', showReminder = false, onClick }: EventCardProps) {
  const { t } = useTranslation();
  const color = getEventColor(event);

  // Compact: MonthView cells — single line
  if (variant === 'compact') {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap overflow-hidden text-ellipsis font-medium cursor-pointer hover:brightness-125 transition-all"
        style={{
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          borderInlineStart: `3px solid ${color}`,
        }}
        title={`${event.startTime || t('calendar.allDay')} — ${event.title}`}
      >
        {event.startTime ? `${event.startTime} ` : ''}{event.title || t('calendar.untitled')}
      </div>
    );
  }

  // Medium: WeekView events, UpcomingEvents
  if (variant === 'medium') {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className="rounded-md px-1.5 py-1 overflow-hidden cursor-pointer hover:brightness-110 transition-all"
        style={{
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          borderInlineStart: `3px solid ${color}`,
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold font-mono" style={{ color }}>{event.startTime || t('calendar.allDay')}</span>
          <div className="flex items-center gap-0.5">
            {event.recurrence && <Repeat size={9} style={{ color }} />}
            {showReminder && <ReminderBadge status={event.reminderStatus} size="sm" />}
          </div>
        </div>
        <div className="text-[11px] font-medium text-aegis-text truncate">{event.title || t('calendar.untitled')}</div>
        {event.location && (
          <div className="flex items-center gap-0.5 text-[9px] text-aegis-text-dim truncate">
            <MapPin size={8} className="shrink-0" /> {event.location}
          </div>
        )}
      </div>
    );
  }

  // Full: DayView events
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="rounded-lg px-3 py-2 cursor-pointer hover:brightness-110 transition-all"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderInlineStart: `4px solid ${color}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold font-mono" style={{ color }}>
            {event.startTime || t('calendar.allDay')}
            {event.endTime && ` – ${event.endTime}`}
          </span>
          <span className="text-[14px] font-semibold text-aegis-text">{event.title || t('calendar.untitled')}</span>
        </div>
        <div className="flex items-center gap-1">
          {event.recurrence && <Repeat size={12} style={{ color }} />}
          {showReminder && <ReminderBadge status={event.reminderStatus} />}
        </div>
      </div>
      {event.location && (
        <div className="flex items-center gap-1 text-[12px] text-aegis-text-dim mt-0.5">
          <MapPin size={11} className="shrink-0" /> {event.location}
        </div>
      )}
      {event.notes && (
        <div className="text-[11px] text-aegis-text-muted mt-1 line-clamp-2">{event.notes}</div>
      )}
    </div>
  );
}

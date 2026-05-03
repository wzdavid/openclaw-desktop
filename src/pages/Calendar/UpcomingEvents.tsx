// ═══════════════════════════════════════════════════════════
// UpcomingEvents — Sidebar list of next events
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Repeat } from 'lucide-react';
import { useCalendarStore } from '@/stores/calendarStore';
import { ReminderBadge } from './ReminderBadge';
import { toDateStr, getEventColor } from './calendarUtils';

interface UpcomingEventsProps {
  onEventClick: (event: any) => void;
  maxItems?: number;
}

export function UpcomingEvents({ onEventClick, maxItems = 8 }: UpcomingEventsProps) {
  const { t, i18n } = useTranslation();
  const events = useCalendarStore((s) => s.events);
  const locale = i18n.language || 'en';
  const todayStr = toDateStr(new Date());

  const upcoming = useMemo(() =>
    [...events]
      .filter((e) => e.date >= todayStr && e.status !== 'cancelled')
      .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
      .slice(0, maxItems),
    [events, todayStr, maxItems],
  );

  if (upcoming.length === 0) {
    return (
      <p className="text-[13px] text-aegis-text-dim text-center py-4">
        {t('calendar.noUpcoming')}
      </p>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto">
      {upcoming.map((ev) => {
        const d = new Date(ev.date + 'T00:00:00');
        const dateStr = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
        const color = getEventColor(ev);

        return (
          <div
            key={ev.id}
            onClick={() => onEventClick(ev)}
            className="p-2.5 rounded-xl bg-aegis-card border border-aegis-border hover:border-[rgb(var(--color-teal-400)/0.3)] hover:bg-aegis-primary-surface transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                {ev.startTime || t('calendar.allDay')} · {dateStr}
              </div>
              <div className="flex items-center gap-0.5">
                {ev.recurrence && <Repeat size={9} style={{ color }} />}
                <ReminderBadge status={ev.reminderStatus} size="sm" />
              </div>
            </div>
            <div className="text-[13px] font-medium text-aegis-text mt-0.5">
              {ev.title || t('calendar.untitled')}
            </div>
            {ev.location && (
              <div className="flex items-center gap-0.5 text-[11px] text-aegis-text-dim mt-0.5">
                <MapPin size={10} className="shrink-0" /> {ev.location}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

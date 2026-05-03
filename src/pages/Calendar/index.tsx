// ═══════════════════════════════════════════════════════════
// Calendar — Professional calendar with Cron-powered reminders
// Month/Week/Day views • Full i18n • RTL-aware • Offline-first
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, Plus, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageTransition } from '@/components/shared/PageTransition';
import { useCalendarStore } from '@/stores/calendarStore';
import { getMonthName, toDateStr } from './calendarUtils';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { EventModal } from './EventModal';
import { MiniCalendar } from './MiniCalendar';
import { UpcomingEvents } from './UpcomingEvents';
import type { CalendarEvent } from './calendarTypes';

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const isRtl = i18n.dir() === 'rtl' || locale.startsWith('ar');

  const {
    events, loading, error, selectedDate, view,
    setView, setSelectedDate, navigate, goToToday,
    loadEvents, syncPendingReminders,
  } = useCalendarStore();

  // Modal state (local — not in global store)
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [modalDate, setModalDate] = useState<Date | undefined>();

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  // Load events on mount + sync pending reminders
  useEffect(() => {
    loadEvents();
    syncPendingReminders().catch(() => {});
  }, []);

  // Event count for current month
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEventCount = useMemo(
    () => events.filter((e) => e.date.startsWith(monthPrefix) && e.status !== 'cancelled').length,
    [events, monthPrefix],
  );

  // ── Handlers ──

  const handleDateClick = useCallback((date: Date) => {
    setSelectedDate(date);
    if (view === 'month') setView('day');
  }, [view, setSelectedDate, setView]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setShowModal(true);
  }, []);

  const handleAddEvent = useCallback((date?: Date) => {
    setEditingEvent(null);
    setModalDate(date || selectedDate);
    setShowModal(true);
  }, [selectedDate]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingEvent(null);
    setModalDate(undefined);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when modal is open or input is focused
      if (showModal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowLeft': navigate(isRtl ? 1 : -1); break;
        case 'ArrowRight': navigate(isRtl ? -1 : 1); break;
        case 't': case 'T': goToToday(); break;
        case 'm': case 'M': setView('month'); break;
        case 'w': case 'W': setView('week'); break;
        case 'd': case 'D': setView('day'); break;
        case 'n': case 'N': handleAddEvent(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, isRtl, navigate, goToToday, setView, handleAddEvent]);

  // ── View title ──
  const viewTitle = useMemo(() => {
    if (view === 'month') return `${getMonthName(month, locale)} ${year}`;
    if (view === 'week') return `${getMonthName(selectedDate.getMonth(), locale)} ${selectedDate.getFullYear()}`;
    // Day: full localized date
    return selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [view, month, year, selectedDate, locale]);

  return (
    <PageTransition className="h-full flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-aegis-border bg-aegis-surface-solid shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg bg-aegis-elevated border border-aegis-border text-aegis-text-muted hover:text-aegis-primary hover:border-[rgb(var(--color-teal-400)/0.3)] transition-colors">
              {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <button onClick={goToToday}
              className="px-4 py-1.5 rounded-lg bg-aegis-primary-surface border border-[rgb(var(--color-teal-400)/0.2)] text-aegis-primary text-[13px] font-semibold hover:bg-[rgb(var(--color-teal-400)/0.15)] transition-colors">
              {t('calendar.today')}
            </button>
            <button onClick={() => navigate(1)}
              className="p-1.5 rounded-lg bg-aegis-elevated border border-aegis-border text-aegis-text-muted hover:text-aegis-primary hover:border-[rgb(var(--color-teal-400)/0.3)] transition-colors">
              {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
            <h1 className="text-[20px] font-bold text-aegis-text ms-2">{viewTitle}</h1>
            <span className="text-[13px] text-aegis-text-dim">— {t('calendar.eventCount', { count: monthEventCount })}</span>
          </div>

          {/* View tabs */}
          <div className="flex gap-0.5 bg-aegis-elevated rounded-xl p-1 border border-aegis-border">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={clsx(
                  'px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  view === v
                    ? 'bg-aegis-primary text-aegis-btn-primary-text font-semibold'
                    : 'text-aegis-text-dim hover:text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.04)]',
                )}>
                {t(`calendar.views.${v}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-5 py-2 bg-[rgb(var(--color-red-400)/0.1)] border-b border-[rgb(var(--color-red-400)/0.2)] flex items-center gap-2 text-[13px] text-[rgb(var(--color-red-400))]">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Calendar view */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-aegis-text-dim animate-pulse">{t('calendar.loading')}</div>
          </div>
        ) : view === 'month' ? (
          <MonthView onDateClick={handleDateClick} onEventClick={handleEventClick} />
        ) : view === 'week' ? (
          <WeekView onDateClick={handleDateClick} onEventClick={handleEventClick} />
        ) : (
          <DayView onEventClick={handleEventClick} />
        )}
      </div>

      {/* Sidebar */}
      <div className="w-[280px] bg-aegis-surface-solid flex flex-col p-5 gap-5 shrink-0"
        style={{ borderInlineStart: '1px solid var(--aegis-border)' }}>
        <button onClick={() => handleAddEvent()}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-aegis-primary text-aegis-btn-primary-text font-semibold text-[14px] hover:bg-aegis-primary-hover transition-colors shadow-md shadow-[rgb(var(--color-teal-400)/0.2)]">
          <Plus size={18} /> {t('calendar.addEvent')}
        </button>

        <MiniCalendar onSelectDate={(d) => { setSelectedDate(d); setView('day'); }} />

        <h3 className="text-[12px] font-semibold text-aegis-text-dim uppercase tracking-wider">
          📅 {t('calendar.upcoming')}
        </h3>
        <UpcomingEvents onEventClick={handleEventClick} />
      </div>

      {/* Modal */}
      {showModal && (
        <EventModal
          onClose={handleCloseModal}
          initialDate={modalDate}
          editEvent={editingEvent}
        />
      )}
    </PageTransition>
  );
}

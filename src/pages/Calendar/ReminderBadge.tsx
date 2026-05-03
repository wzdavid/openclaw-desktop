// ═══════════════════════════════════════════════════════════
// ReminderBadge — Cron job status indicator for events
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import type { ReminderStatus } from './calendarTypes';

interface ReminderBadgeProps {
  status: ReminderStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<ReminderStatus, { icon: string; colorClass: string; key: string }> = {
  scheduled: { icon: '🟢', colorClass: 'text-green-400', key: 'calendar.reminder.scheduled' },
  pending:   { icon: '🟡', colorClass: 'text-amber-400', key: 'calendar.reminder.pending' },
  fired:     { icon: '✅', colorClass: 'text-green-400', key: 'calendar.reminder.fired' },
  failed:    { icon: '🔴', colorClass: 'text-red-400',   key: 'calendar.reminder.failed' },
  none:      { icon: '',   colorClass: '',                key: '' },
};

export function ReminderBadge({ status, size = 'md' }: ReminderBadgeProps) {
  const { t } = useTranslation();

  if (status === 'none') return null;

  const cfg = STATUS_CONFIG[status];
  const sizeClass = size === 'sm' ? 'text-[8px]' : 'text-[10px]';

  return (
    <span className={`${sizeClass} ${cfg.colorClass} shrink-0`} title={t(cfg.key)}>
      {cfg.icon}
    </span>
  );
}

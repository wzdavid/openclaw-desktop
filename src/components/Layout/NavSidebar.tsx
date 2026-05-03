// ═══════════════════════════════════════════════════════════
// NavSidebar — Compact icon-only sidebar (64px)
// Matches conceptual design: icons + active bar + user avatar
// ═══════════════════════════════════════════════════════════

import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Kanban, DollarSign,
  Clock, Bot, Settings, Settings2, Brain, Puzzle,
  Terminal, FolderOpen, CalendarDays,
  PanelLeftOpen, PanelLeftClose,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDirection } from '@/i18n';
import { isFeatureEnabled, type EditionFeatureKey } from '@/config/edition';
import clsx from 'clsx';

interface NavItem {
  to: string;
  icon: any;
  labelKey: string;
  badge?: string;
  feature: EditionFeatureKey;
}

const navItemDefs: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', feature: 'dashboard' },
  { to: '/chat', icon: MessageCircle, labelKey: 'nav.chat', feature: 'chat' },
  { to: '/workshop', icon: Kanban, labelKey: 'nav.workshop', feature: 'workshop' },
  { to: '/cron', icon: Clock, labelKey: 'nav.cron', feature: 'cron' },
  { to: '/agents', icon: Bot, labelKey: 'nav.agents', feature: 'agents' },
  { to: '/costs', icon: DollarSign, labelKey: 'nav.costs', feature: 'analytics' },
  { to: '/skills', icon: Puzzle, labelKey: 'nav.skills', feature: 'skills' },
  { to: '/terminal', icon: Terminal, labelKey: 'nav.terminal', feature: 'terminal' },
  { to: '/memory', icon: Brain, labelKey: 'nav.memory', badge: '🧪', feature: 'memory' },
  { to: '/files', icon: FolderOpen, labelKey: 'nav.files', feature: 'files' },
  { to: '/calendar', icon: CalendarDays, labelKey: 'nav.calendar', feature: 'calendar' },
  { to: '/config', icon: Settings2, labelKey: 'nav.config', feature: 'configManager' },
];

const navItems = navItemDefs.filter((item) => isFeatureEnabled(item.feature));


// Prefetch heavy lazy chunks on hover (before click)
const PREFETCH_MAP: Record<string, () => void> = {
  '/chat': () => import('@/pages/ChatPage'),
  '/costs': () => import('@/pages/FullAnalytics'),
  '/cron': () => import('@/pages/CronMonitor'),
  '/terminal': () => import('@/pages/TerminalPage'),
};

export function NavSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { language, sidebarCollapsed, setSidebarCollapsed } = useSettingsStore();
  const dir = getDirection(language);
  const isRTL = dir === 'rtl';

  const borderClass = isRTL ? 'border-l' : 'border-r';

  return (
    <div
      className={clsx(
        'shrink-0 flex flex-col transition-all duration-200',
        sidebarCollapsed ? 'w-[64px] items-center' : 'w-[220px] items-stretch',
        'chrome-bg', borderClass, 'border-aegis-border',
        'py-3 relative'
      )}
    >
      {/* Collapse / Expand toggle */}
      <div className={clsx('mb-2 px-2', sidebarCollapsed ? 'w-full flex justify-center' : 'w-full')}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={clsx(
            'h-[36px] rounded-lg text-aegis-text-muted hover:text-aegis-text-secondary',
            'hover:bg-[rgb(var(--aegis-overlay)/0.04)] transition-colors',
            sidebarCollapsed
              ? 'w-[36px] flex items-center justify-center'
              : 'w-full px-2 flex items-center gap-2'
          )}
          title={sidebarCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
          aria-label={sidebarCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!sidebarCollapsed && (
            <span className="text-[11px] font-medium">
              {t('nav.collapseSidebar', 'Collapse sidebar')}
            </span>
          )}
        </button>
      </div>

      {/* Navigation Icons */}
      <nav className={clsx('flex-1 flex flex-col gap-1 px-2', sidebarCollapsed ? 'items-center' : 'items-stretch')}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onMouseEnter={() => PREFETCH_MAP[item.to]?.()}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'relative h-[44px] rounded-xl',
                'flex items-center',
                'transition-all duration-300 group',
                sidebarCollapsed ? 'w-[44px] justify-center' : 'w-full px-3 justify-start gap-2.5',
                isActive
                  ? 'nav-icon-active-glow text-aegis-primary'
                  : 'text-aegis-text-muted hover:text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
              )}
            >
              {/* Active indicator bar — animated slide */}
              {isActive && (
                <motion.div
                  layoutId="nav-active-bar"
                  className={clsx(
                    'absolute top-1/2 -translate-y-1/2',
                    'w-[3px] h-[20px] rounded-full',
                    'bg-aegis-primary',
                    'shadow-[0_0_12px_rgb(var(--aegis-primary)/0.4)]',
                    isRTL ? '-right-[12px]' : '-left-[12px]'
                  )}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              <div className="relative">
                <item.icon size={18} className={clsx(isActive && 'icon-halo-teal')} />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-2 text-[8px]">{item.badge}</span>
                )}
              </div>

              {!sidebarCollapsed && (
                <span className="text-[12px] font-medium truncate">{t(item.labelKey)}</span>
              )}

              {/* Tooltip on hover */}
              {sidebarCollapsed && (
                <div className={clsx(
                  'absolute top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg',
                  'bg-aegis-elevated-solid border border-aegis-border shadow-lg',
                  'text-aegis-text text-[11px] font-medium whitespace-nowrap',
                  'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50',
                  isRTL ? 'right-full mr-3' : 'left-full ml-3'
                )}>
                  {t(item.labelKey)}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom: Settings */}
      {isFeatureEnabled('settings') && (
      <div className={clsx('flex flex-col gap-1 pt-3 px-2', sidebarCollapsed ? 'items-center' : 'items-stretch')}>
        <NavLink
          to="/settings"
          aria-current={location.pathname === '/settings' ? 'page' : undefined}
          className={clsx(
            'relative h-[44px] rounded-xl',
            'flex items-center',
            'transition-all duration-300 group',
            sidebarCollapsed ? 'w-[44px] justify-center' : 'w-full px-3 justify-start gap-2.5',
            location.pathname === '/settings'
              ? 'nav-icon-active-glow text-aegis-primary'
              : 'text-aegis-text-muted hover:text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
          )}
        >
          {location.pathname === '/settings' && (
            <motion.div
              layoutId="nav-active-bar"
              className={clsx(
                'absolute top-1/2 -translate-y-1/2',
                'w-[3px] h-[20px] rounded-full',
                'bg-aegis-primary',
                'shadow-[0_0_12px_rgb(var(--aegis-primary)/0.4)]',
                isRTL ? '-right-[12px]' : '-left-[12px]'
              )}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Settings size={18} className={clsx(location.pathname === '/settings' && 'icon-halo-teal')} />
          {!sidebarCollapsed && <span className="text-[12px] font-medium truncate">{t('nav.settings')}</span>}
          {sidebarCollapsed && (
            <div className={clsx(
              'absolute top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg',
              'bg-aegis-elevated-solid border border-aegis-border shadow-lg',
              'text-aegis-text text-[11px] font-medium whitespace-nowrap',
              'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50',
              isRTL ? 'right-full mr-3' : 'left-full ml-3'
            )}>
              {t('nav.settings')}
            </div>
          )}
        </NavLink>
      </div>
      )}
    </div>
  );
}


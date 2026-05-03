// ═══════════════════════════════════════════════════════════
// CommandPalette — Ctrl+K quick action launcher
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Kanban, DollarSign, Clock, Bot, Brain,
  Settings, Wifi, WifiOff, Heart, Mail, Calendar, RefreshCw,
  Globe, Bell, BellOff, Command
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { gateway } from '@/services/gateway';
import { changeLanguage } from '@/i18n';
import { isFeatureEnabled, type EditionFeatureKey } from '@/config/edition';
import clsx from 'clsx';

const DEFAULT_GATEWAY_WS_URL = 'ws://127.0.0.1:18789';

interface PaletteCommand {
  id: string;
  icon: any;
  name: string;
  description?: string;
  shortcut?: string;
  keywords: string[];
  action: () => void;
  /** If set, command is hidden when the edition feature is off */
  feature?: EditionFeatureKey;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { commandPaletteOpen, setCommandPaletteOpen, language, setLanguage, notificationsEnabled, setNotificationsEnabled } = useSettingsStore();
  const { connected } = useChatStore();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reconnectWithBestConfig = async () => {
    const state = useSettingsStore.getState();
    const storeUrl = state.gatewayUrl?.trim();
    const storeToken = state.gatewayToken?.trim() || '';
    if (storeUrl) {
      gateway.connect(storeUrl, storeToken);
      return;
    }
    const config = await window.aegis?.config?.get();
    const cfgUrl = config?.gatewayUrl || config?.gatewayWsUrl || DEFAULT_GATEWAY_WS_URL;
    gateway.connect(cfgUrl, config?.gatewayToken || storeToken);
  };

  // Define commands — all names use i18n keys
  const commands: PaletteCommand[] = [
    // Navigation (aligned with `src/config/edition.ts` + NavSidebar)
    { id: 'nav-dashboard', feature: 'dashboard', icon: LayoutDashboard, name: t('nav.dashboard'), shortcut: 'Ctrl+1', keywords: ['dashboard', 'home', 'لوحة'], action: () => navigate('/') },
    { id: 'nav-chat', feature: 'chat', icon: MessageCircle, name: t('nav.chat'), shortcut: 'Ctrl+2', keywords: ['chat', 'شات', 'محادثة'], action: () => navigate('/chat') },
    { id: 'nav-workshop', feature: 'workshop', icon: Kanban, name: t('nav.workshop'), shortcut: 'Ctrl+3', keywords: ['workshop', 'kanban', 'ورشة', 'مهام'], action: () => navigate('/workshop') },
    { id: 'nav-costs', feature: 'analytics', icon: DollarSign, name: t('nav.costs'), shortcut: 'Ctrl+4', keywords: ['costs', 'تكاليف', 'tokens'], action: () => navigate('/costs') },
    { id: 'nav-cron', feature: 'cron', icon: Clock, name: t('nav.cron'), shortcut: 'Ctrl+5', keywords: ['cron', 'schedule', 'جدولة'], action: () => navigate('/cron') },
    { id: 'nav-agents', feature: 'agents', icon: Bot, name: t('nav.agents'), shortcut: 'Ctrl+6', keywords: ['agents', 'وكلاء', 'sessions'], action: () => navigate('/agents') },
    { id: 'nav-memory', feature: 'memory', icon: Brain, name: t('nav.memory'), shortcut: 'Ctrl+7', keywords: ['memory', 'ذاكرة', 'search'], action: () => navigate('/memory') },
    { id: 'nav-settings', feature: 'settings', icon: Settings, name: t('nav.settings'), shortcut: 'Ctrl+,', keywords: ['settings', 'إعدادات'], action: () => navigate('/settings') },

    // Actions
    { id: 'act-heartbeat', icon: Heart, name: t('palette.heartbeat'), keywords: ['heartbeat', 'فحص', 'check'], action: () => {
      window.dispatchEvent(new CustomEvent('aegis:quick-action', { detail: { message: 'Run a quick heartbeat check — emails, calendar, anything urgent?', autoSend: true } }));
    }},
    { id: 'act-emails', icon: Mail, name: t('palette.checkEmails'), keywords: ['email', 'إيميل', 'بريد'], action: () => {
      window.dispatchEvent(new CustomEvent('aegis:quick-action', { detail: { message: 'Check my unread emails and summarize anything important.', autoSend: true } }));
    }},
    { id: 'act-calendar', icon: Calendar, name: t('palette.checkCalendar'), keywords: ['calendar', 'تقويم', 'مواعيد'], action: () => {
      window.dispatchEvent(new CustomEvent('aegis:quick-action', { detail: { message: "What's on my calendar today and tomorrow?", autoSend: true } }));
    }},
    { id: 'act-compact', icon: RefreshCw, name: t('palette.compactContext'), keywords: ['compact', 'ضغط', 'context'], action: () => {
      window.dispatchEvent(new CustomEvent('aegis:quick-action', { detail: { message: 'Compact the main session context', autoSend: true } }));
    }},

    // Connection
    { id: 'conn-reconnect', icon: connected ? Wifi : WifiOff, name: connected ? t('palette.reconnect') : t('palette.connectGateway'), keywords: ['connect', 'reconnect', 'اتصال', 'gateway'], action: async () => {
      await reconnectWithBestConfig();
    }},

    // Settings
    { id: 'set-lang', icon: Globe, name: t('palette.toggleLanguage'), keywords: ['language', 'لغة', 'english', 'عربي'], action: () => {
      const newLang = language === 'ar' ? 'en' : 'ar';
      setLanguage(newLang);
      changeLanguage(newLang);
    }},
    { id: 'set-notif', icon: notificationsEnabled ? BellOff : Bell, name: t('palette.toggleNotifications'), keywords: ['notifications', 'إشعارات'], action: () => {
      setNotificationsEnabled(!notificationsEnabled);
    }},
  ];

  const enabledCommands = commands.filter((cmd) => !cmd.feature || isFeatureEnabled(cmd.feature));

  // Filter
  const filtered = query.trim()
    ? enabledCommands.filter((cmd) => {
        const q = query.toLowerCase();
        return cmd.name.toLowerCase().includes(q) ||
          cmd.keywords.some((k) => k.includes(q)) ||
          (cmd.description || '').toLowerCase().includes(q);
      })
    : enabledCommands;

  // Reset on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault();
      filtered[selectedIdx].action();
      setCommandPaletteOpen(false);
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  }, [filtered, selectedIdx, setCommandPaletteOpen]);

  // Keep selection in bounds
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
        onClick={() => setCommandPaletteOpen(false)}>
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onClick={(e) => e.stopPropagation()}
          className="w-[520px] rounded-2xl bg-aegis-bg border border-aegis-border/30 shadow-2xl overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-aegis-border/20">
            <Command size={16} className="text-aegis-text-dim shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('palette.searchPlaceholder')}
              className="flex-1 bg-transparent text-[15px] text-aegis-text placeholder:text-aegis-text-dim/40 focus:outline-none"
              dir="auto"
            />
            <kbd className="text-[10px] text-aegis-text-dim bg-aegis-surface/40 px-1.5 py-0.5 rounded border border-aegis-border/20">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[360px] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="text-center py-8 text-[13px] text-aegis-text-dim">{t('commandPaletteFooter.noResults')}</div>
            )}
            {filtered.slice(0, 12).map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => { cmd.action(); setCommandPaletteOpen(false); }}
                onMouseEnter={() => setSelectedIdx(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors',
                  i === selectedIdx ? 'bg-aegis-primary/10' : 'hover:bg-[rgb(var(--aegis-overlay)/0.03)]'
                )}
              >
                <cmd.icon size={16} className={clsx(i === selectedIdx ? 'text-aegis-primary' : 'text-aegis-text-dim')} />
                <div className="flex-1 min-w-0">
                  <span className={clsx('text-[13px]', i === selectedIdx ? 'text-aegis-text' : 'text-aegis-text-muted')}>
                    {cmd.name}
                  </span>
                </div>
                {cmd.shortcut && (
                  <kbd className="text-[10px] text-aegis-text-dim/60 bg-aegis-surface/30 px-1.5 py-0.5 rounded border border-aegis-border/15">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-aegis-border/15 text-[10px] text-aegis-text-dim/50">
            <span>↑↓ {t('commandPaletteFooter.navigate')}</span>
            <span>↵ {t('commandPaletteFooter.execute')}</span>
            <span>ESC {t('commandPaletteFooter.close')}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

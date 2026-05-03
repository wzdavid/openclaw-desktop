import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useGatewayDataStore } from '@/stores/gatewayDataStore';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDirection } from '@/i18n';

// ═══════════════════════════════════════════════════════════
// Typing Indicator — smooth animated dots
// ═══════════════════════════════════════════════════════════

export function TypingIndicator() {
  const { t } = useTranslation();
  const { language } = useSettingsStore();
  const agents = useGatewayDataStore((s) => s.agents);
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const dir = getDirection(language);
  const activeAgentId = (() => {
    if (!activeSessionKey) return 'main';
    const parts = activeSessionKey.split(':');
    return parts[0] === 'agent' && parts[1] ? parts[1] : 'main';
  })();
  const activeAgentName =
    agents.find((a) => a.id === activeAgentId)?.name
    || (activeAgentId === 'main' ? t('agents.mainAgent', 'Main Agent') : activeAgentId);
  const activeAgentLetter = activeAgentName.charAt(0) || 'M';

  return (
    <div className="flex items-start gap-3 px-5 py-2 animate-fade-in" dir={dir}>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-aegis-primary to-aegis-accent flex items-center justify-center shrink-0 mt-0.5 shadow-glow-sm">
        <span className="text-[10px] font-bold text-aegis-text">{activeAgentLetter}</span>
      </div>

      {/* Dots container */}
      <div className="bg-aegis-bot-bubble rounded-2xl rounded-tr-md px-5 py-3 border border-aegis-bot-border shadow-inner-glow">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[6px] h-[6px] bg-aegis-primary rounded-full animate-typing-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

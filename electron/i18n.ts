// ═══════════════════════════════════════════════════════════
// Main-process i18n — minimal translation layer
// Only the strings rendered in Electron's native UI:
//   • Splash screen  • Context menus  • Save dialogs
//   • Notifications  • Tray menu
// The React renderer uses its own i18next instance (src/i18n.ts).
// ═══════════════════════════════════════════════════════════

type SectionMap = Record<string, string>;
type LangMap    = Record<string, SectionMap>;

const translations: Record<string, LangMap> = {
  en: {
    splash: {
      loading: 'Loading...',
    },
    contextMenu: {
      openLink:  '🔗 Open Link',
      copyLink:  '📋 Copy Link',
      cut:       'Cut',
      copy:      'Copy',
      paste:     'Paste',
      selectAll: 'Select All',
    },
    dialog: {
      saveImage:  'Save Image',
      imageSaved: 'Image Saved',
    },
    tray: {
      open:  'OpenClaw Desktop',
      close: '❌ Quit',
    },
  },

  // Arabic kept for future use, but not exposed in the UI for now.
  ar: {
    splash: {
      loading: 'جاري التحميل...',
    },
    contextMenu: {
      openLink:  '🔗 فتح الرابط',
      copyLink:  '📋 نسخ الرابط',
      cut:       'قص',
      copy:      'نسخ',
      paste:     'لصق',
      selectAll: 'تحديد الكل',
    },
    dialog: {
      saveImage:  'حفظ الصورة',
      imageSaved: 'تم حفظ الصورة',
    },
    tray: {
      open:  'OpenClaw Desktop',
      close: '❌ إغلاق',
    },
  },

  zh: {
    splash: {
      loading: '正在加载…',
    },
    contextMenu: {
      openLink:  '🔗 打开链接',
      copyLink:  '📋 复制链接',
      cut:       '剪切',
      copy:      '复制',
      paste:     '粘贴',
      selectAll: '全选',
    },
    dialog: {
      saveImage:  '保存图片',
      imageSaved: '图片已保存',
    },
    tray: {
      open:  '打开 OpenClaw Desktop',
      close: '❌ 退出',
    },
  },
};

let _lang: 'en' | 'zh' | 'ar' = 'en';

/**
 * Initialise from the installer-language value already detected in main.ts.
 * Call this right after detectInstallerLanguage() / loadConfig().
 */
export function initI18n(
  installerLang: string | null,
  configLang?: string | null,
): void {
  // Priority: config (user-chosen in app) > installer > 'en'
  if (configLang === 'en' || configLang === 'zh' || configLang === 'ar') {
    _lang = configLang;
  } else if (installerLang) {
    const normalized = installerLang.toLowerCase();
    if (normalized.startsWith('zh')) _lang = 'zh';
    else if (normalized.startsWith('en')) _lang = 'en';
  }
  console.log(`[i18n] main-process language: ${_lang}`);
}

/**
 * Update the current language at runtime.
 * Wired to the 'i18n:setLanguage' IPC channel so the renderer
 * can push language changes to native menus.
 */
export function setLanguage(lang: string): void {
  if (lang === 'en' || lang === 'zh' || lang === 'ar') {
    _lang = lang as typeof _lang;
    console.log(`[i18n] language updated: ${_lang}`);
  }
}

/**
 * Translate a dotted key like 'contextMenu.copy'.
 * Falls back to English, then to the raw key string.
 */
export function t(key: string): string {
  const dot = key.indexOf('.');
  if (dot === -1) return key;

  const section = key.slice(0, dot);
  const subkey  = key.slice(dot + 1);

  return (
    translations[_lang]?.[section]?.[subkey] ??
    translations['en']?.[section]?.[subkey] ??
    key
  );
}

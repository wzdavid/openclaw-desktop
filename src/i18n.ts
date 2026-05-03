import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

// ═══════════════════════════════════════════════════════════
// i18n — Internationalization (EN + ZH, Arabic kept for later)
// ═══════════════════════════════════════════════════════════

type Lang = 'en' | 'zh' | 'ar';

const isSupported = (lang: string | null | undefined): lang is Lang =>
  lang === 'en' || lang === 'zh' || lang === 'ar';

// Detect language priority:
//   1. New install/upgrade: installer language wins (only EN/ZH; AR kept but not auto-selected)
//   2. Normal run: localStorage wins (user may have changed it in Settings; old AR choice respected)
//   3. First run (dev/no installer): system language (zh → ZH, otherwise EN)
//   4. Fallback: 'en'
const getInitialLang = (): Lang => {
  const stored = localStorage.getItem('aegis-language');
  const installerLang = (window as any).aegis?.installerLanguage as string | null;
  const currentVersion = (window as any).__APP_VERSION__ || '';
  const lastVersion = localStorage.getItem('aegis-installed-version');

  // New install or upgrade: honour installer language, but only enable EN/ZH by default
  if (installerLang && lastVersion !== currentVersion) {
    const normalized = installerLang.toLowerCase();
    if (normalized.startsWith('zh')) {
      localStorage.setItem('aegis-language', 'zh');
      localStorage.setItem('aegis-installed-version', currentVersion);
      return 'zh';
    }
    if (normalized.startsWith('en')) {
      localStorage.setItem('aegis-language', 'en');
      localStorage.setItem('aegis-installed-version', currentVersion);
      return 'en';
    }
  }

  // Normal run: use saved preference (including legacy Arabic users)
  if (stored && isSupported(stored)) {
    if (!lastVersion && currentVersion) {
      localStorage.setItem('aegis-installed-version', currentVersion);
    }
    return stored;
  }

  // First run dev/no installer: respect browser language (zh → ZH, otherwise EN)
  const browserLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
  if (browserLang.startsWith('zh')) {
    localStorage.setItem('aegis-language', 'zh');
    if (currentVersion) localStorage.setItem('aegis-installed-version', currentVersion);
    return 'zh';
  }

  // Default: English
  localStorage.setItem('aegis-language', 'en');
  if (currentVersion) localStorage.setItem('aegis-installed-version', currentVersion);
  return 'en';
};

const savedLang = getInitialLang();

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Helper: get direction for current language
export const getDirection = (lang?: string): 'rtl' | 'ltr' => {
  const current = (lang || i18n.language) as Lang;
  return current === 'ar' ? 'rtl' : 'ltr';
};

// Helper: change language and persist
export const changeLanguage = (lang: Lang) => {
  if (!isSupported(lang)) return;
  i18n.changeLanguage(lang);
  localStorage.setItem('aegis-language', lang);
  document.documentElement.dir = getDirection(lang);
  document.documentElement.lang = lang;
};

// Set initial direction
document.documentElement.dir = getDirection(savedLang);
document.documentElement.lang = savedLang;

export default i18n;

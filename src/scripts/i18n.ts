// src/scripts/i18n.ts
import { translations, type Lang } from './translations';

export const DEFAULT_LANG: Lang = 'en';
const STORAGE_KEY = 'speedflow_lang';

export function getCurrentLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (saved && (saved === 'en' || saved === 'id')) {
    return saved;
  }
  return DEFAULT_LANG;
}

export function setLanguage(lang: Lang) {
  if (typeof document === 'undefined') return;

  const dict = translations[lang] || translations[DEFAULT_LANG];
  document.documentElement.lang = lang;

  // 1. Update textContent for data-i18n elements
  const textElements = document.querySelectorAll<HTMLElement>('[data-i18n]');
  textElements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // 2. Update innerHTML for data-i18n-html elements
  const htmlElements = document.querySelectorAll<HTMLElement>('[data-i18n-html]');
  htmlElements.forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (key && dict[key] !== undefined) {
      el.innerHTML = dict[key];
    }
  });

  // 3. Update placeholder for data-i18n-placeholder elements
  const placeholderElements = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]');
  placeholderElements.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && dict[key] !== undefined) {
      el.placeholder = dict[key];
    }
  });

  // 4. Update active states on all language switchers
  const langButtons = document.querySelectorAll<HTMLButtonElement>('.lang-btn');
  langButtons.forEach(btn => {
    const btnLang = btn.getAttribute('data-lang');
    if (btnLang === lang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 5. Save preference in localStorage
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors in sandbox
  }

  // 6. Notify dynamic modules (e.g., github-release.ts)
  window.dispatchEvent(new CustomEvent('speedflow:langchange', { detail: { lang } }));
}

export function initI18n() {
  const currentLang = getCurrentLang();
  setLanguage(currentLang);

  // Setup click listeners for all language switcher buttons
  const langButtons = document.querySelectorAll<HTMLButtonElement>('.lang-btn');
  langButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetLang = btn.getAttribute('data-lang') as Lang;
      if (targetLang && (targetLang === 'en' || targetLang === 'id')) {
        setLanguage(targetLang);
      }
    });
  });
}

// Auto-run on DOM ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }
}

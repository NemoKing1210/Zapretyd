import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/zapretyd';
import { en, type TranslationKey } from './locales/en';
import { ru } from './locales/ru';

export type Locale = 'en' | 'ru';
export type LocalePreference = 'system' | Locale;

const catalogs: Record<Locale, Record<TranslationKey, string>> = { en, ru };
const errorKeys = new Set(Object.keys(en).filter((key) => key.startsWith('error.')));

let currentLocale: Locale = 'en';

export function detectLocale(systemLocale: string): Locale {
  return systemLocale.trim().toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function normalizeLocalePreference(value?: string): LocalePreference {
  if (value === 'en' || value === 'ru' || value === 'system') return value;
  return 'system';
}

export function resolveLocale(preference: LocalePreference, systemLocale: string): Locale {
  return preference === 'system' ? detectLocale(systemLocale) : preference;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
  locale: Locale = currentLocale,
): string {
  let text = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
}

export function translateError(error: string, locale: Locale = currentLocale): string {
  const [code, ...rest] = error.split('|');
  const detail = rest.join('|').trim();
  if (errorKeys.has(code)) {
    const translated = t(code as TranslationKey, undefined, locale);
    if (!detail) return translated;
    // Keep UI toasts/alerts readable; full multi-line diagnostics go to the error log.
    const short = detail.split(/\r?\n/, 1)[0]!.trim().slice(0, 160);
    return short ? `${translated}: ${short}` : translated;
  }
  return error;
}

type I18nContextValue = {
  locale: Locale;
  localePreference: LocalePreference;
  setLocalePreference: (preference: LocalePreference) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  translateError: (error: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>('system');
  const [systemLocale, setSystemLocale] = useState('en-US');

  const applyPreference = useCallback((preference: LocalePreference, nextSystemLocale: string) => {
    const next = resolveLocale(preference, nextSystemLocale);
    setLocale(next);
    setLocaleState(next);
    setLocalePreferenceState(preference);
  }, []);

  useEffect(() => {
    // Render immediately with English defaults; refine locale when IPC returns.
    // Avoid blank window if systemLocale/settings are slow.
    Promise.all([api.systemLocale(), api.settings()])
      .then(([nextSystemLocale, settings]) => {
        setSystemLocale(nextSystemLocale);
        applyPreference(normalizeLocalePreference(settings.locale), nextSystemLocale);
      })
      .catch(() => {
        setLocale('en');
        setLocaleState('en');
        setLocalePreferenceState('system');
      });
  }, [applyPreference]);

  const setLocalePreference = useCallback(
    (preference: LocalePreference) => {
      applyPreference(preference, systemLocale);
    },
    [applyPreference, systemLocale],
  );

  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => t(key, params, locale),
    [locale],
  );
  const translateErr = useCallback((error: string) => translateError(error, locale), [locale]);

  return createElement(
    I18nContext.Provider,
    {
      value: {
        locale,
        localePreference,
        setLocalePreference,
        t: translate,
        translateError: translateErr,
      },
    },
    children,
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}

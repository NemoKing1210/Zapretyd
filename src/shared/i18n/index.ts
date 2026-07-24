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

const catalogs: Record<Locale, Record<TranslationKey, string>> = { en, ru };
const errorKeys = new Set(Object.keys(en).filter((key) => key.startsWith('error.')));

let currentLocale: Locale = 'en';

export function detectLocale(systemLocale: string): Locale {
  return systemLocale.trim().toLowerCase().startsWith('ru') ? 'ru' : 'en';
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
  const detail = rest.join('|');
  if (errorKeys.has(code)) {
    const translated = t(code as TranslationKey, undefined, locale);
    return detail ? `${translated}: ${detail}` : translated;
  }
  return error;
}

type I18nContextValue = {
  locale: Locale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  translateError: (error: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .systemLocale()
      .then((systemLocale) => {
        const next = detectLocale(systemLocale);
        setLocale(next);
        setLocaleState(next);
      })
      .catch(() => setLocale('en'))
      .finally(() => setReady(true));
  }, []);

  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => t(key, params, locale),
    [locale],
  );
  const translateErr = useCallback((error: string) => translateError(error, locale), [locale]);

  if (!ready) return null;

  return createElement(
    I18nContext.Provider,
    { value: { locale, t: translate, translateError: translateErr } },
    children,
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}

import { describe, expect, it } from 'vitest';
import {
  detectLocale,
  normalizeLocalePreference,
  resolveLocale,
  setLocale,
  t,
  translateError,
} from './index';

describe('i18n', () => {
  it('detects Russian locale', () => {
    expect(detectLocale('ru-RU')).toBe('ru');
    expect(detectLocale('ru')).toBe('ru');
  });

  it('falls back to English', () => {
    expect(detectLocale('de-DE')).toBe('en');
    expect(detectLocale('')).toBe('en');
  });

  it('normalizes locale preference', () => {
    expect(normalizeLocalePreference('ru')).toBe('ru');
    expect(normalizeLocalePreference('en')).toBe('en');
    expect(normalizeLocalePreference('system')).toBe('system');
    expect(normalizeLocalePreference(undefined)).toBe('system');
    expect(normalizeLocalePreference('de')).toBe('system');
  });

  it('resolves system preference from OS locale', () => {
    expect(resolveLocale('system', 'ru-RU')).toBe('ru');
    expect(resolveLocale('system', 'en-US')).toBe('en');
    expect(resolveLocale('en', 'ru-RU')).toBe('en');
    expect(resolveLocale('ru', 'en-US')).toBe('ru');
  });

  it('translates known error codes', () => {
    setLocale('en');
    expect(translateError('error.library.notConfigured')).toBe('Library is not configured');
    setLocale('ru');
    expect(translateError('error.library.notConfigured')).toBe('Не настроена библиотека');
  });

  it('keeps a short technical detail for UI translation', () => {
    setLocale('en');
    expect(
      translateError(
        'error.release.rateLimited|HTTP status client error (403 rate limit exceeded)',
      ),
    ).toContain('HTTP status client error');
    expect(
      translateError('error.service.removeFailed|sc delete zapret\nexit=1\nstdout:\nFAILED 1072'),
    ).toBe('Failed to remove zapret service: sc delete zapret');
  });

  it('interpolates params', () => {
    setLocale('en');
    expect(t('overview.strategy', { name: 'general.bat' })).toBe('Strategy: general.bat');
  });
});

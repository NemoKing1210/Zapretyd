import { describe, expect, it } from 'vitest';
import { detectLocale, setLocale, t, translateError } from './index';

describe('i18n', () => {
  it('detects Russian locale', () => {
    expect(detectLocale('ru-RU')).toBe('ru');
    expect(detectLocale('ru')).toBe('ru');
  });

  it('falls back to English', () => {
    expect(detectLocale('de-DE')).toBe('en');
    expect(detectLocale('')).toBe('en');
  });

  it('translates known error codes', () => {
    setLocale('en');
    expect(translateError('error.library.notConfigured')).toBe('Library is not configured');
    setLocale('ru');
    expect(translateError('error.library.notConfigured')).toBe('Не настроена библиотека');
  });

  it('interpolates params', () => {
    setLocale('en');
    expect(t('overview.strategy', { name: 'general.bat' })).toBe('Strategy: general.bat');
  });
});

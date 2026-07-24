import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats megabytes in English', () => {
    setLocale('en');
    expect(formatBytes(2 * 1024 * 1024)).toMatch(/MB/i);
  });

  it('formats megabytes in Russian', () => {
    setLocale('ru');
    expect(formatBytes(2 * 1024 * 1024)).toMatch(/МБ/i);
  });
});

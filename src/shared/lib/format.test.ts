import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { formatBytes, formatVersionPath } from './format';

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

describe('formatVersionPath', () => {
  const library = String.raw`C:\Users\nemok\AppData\Roaming\dev.zapretyd.desktop\library`;
  const version = String.raw`${library}\versions\1.10.0`;

  it('shortens paths under the app library folder', () => {
    expect(formatVersionPath(version, library, true)).toBe(String.raw`versions\1.10.0`);
  });

  it('keeps full paths when shorten is off', () => {
    expect(formatVersionPath(version, library, false)).toBe(version);
  });
});

import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { formatBytes, formatDuration, formatVersionPath, pathsEqual } from './format';

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

describe('formatDuration', () => {
  it('formats seconds and mixed units in English', () => {
    setLocale('en');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(formatDuration(3_720_000)).toBe('1h 2m');
    expect(formatDuration(90_000_000)).toBe('1d 1h');
  });

  it('formats duration in Russian', () => {
    setLocale('ru');
    expect(formatDuration(45_000)).toBe('45 с');
    expect(formatDuration(125_000)).toBe('2 мин 5 с');
    expect(formatDuration(3_720_000)).toBe('1 ч 2 мин');
  });

  it('clamps negative values', () => {
    setLocale('en');
    expect(formatDuration(-1000)).toBe('0s');
  });
});

describe('pathsEqual', () => {
  it('compares Windows paths case-insensitively', () => {
    expect(
      pathsEqual(String.raw`C:\Zapretyd\library`, String.raw`c:/Zapretyd/library/`),
    ).toBe(true);
  });
});

describe('formatVersionPath', () => {
  const library = String.raw`C:\Users\user\AppData\Roaming\Zapretyd\library`;
  const version = String.raw`${library}\versions\1.10.0`;

  it('shortens paths under the app library folder', () => {
    expect(formatVersionPath(version, library, true)).toBe(String.raw`versions\1.10.0`);
  });

  it('keeps full paths when shorten is off', () => {
    expect(formatVersionPath(version, library, false)).toBe(version);
  });
});

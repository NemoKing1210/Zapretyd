import { getLocale, t } from '../i18n';

const intlLocale = () => (getLocale() === 'ru' ? 'ru-RU' : 'en-US');

const normalizePath = (value: string) => value.replace(/[/\\]+$/, '').replaceAll('/', '\\');

/** Case-insensitive path equality for Windows library folders. */
export function pathsEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

/** When using the app library folder, show a short path like `versions\1.10.0`. */
export function formatVersionPath(
  path: string,
  libraryPath: string | undefined,
  shorten: boolean,
): string {
  if (!shorten || !libraryPath) return path;
  const full = normalizePath(path);
  const root = normalizePath(libraryPath);
  if (full.toLowerCase().startsWith(root.toLowerCase() + '\\')) {
    return full.slice(root.length + 1);
  }
  if (pathsEqual(full, root)) return '.';
  return path;
}

export const formatBytes = (value: number) =>
  new Intl.NumberFormat(intlLocale(), {
    style: 'unit',
    unit: value > 1024 ** 2 ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(value / (value > 1024 ** 2 ? 1024 ** 2 : 1024));
export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

/** Compact elapsed time for service uptime (e.g. `2h 14m`, `45s`). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return t('format.duration.daysHours', { days, hours });
  }
  if (hours > 0) {
    return t('format.duration.hoursMinutes', { hours, minutes });
  }
  if (minutes > 0) {
    return t('format.duration.minutesSeconds', { minutes, seconds });
  }
  return t('format.duration.seconds', { seconds });
}

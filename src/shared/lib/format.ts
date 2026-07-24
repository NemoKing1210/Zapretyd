import { getLocale } from '../i18n';

const intlLocale = () => (getLocale() === 'ru' ? 'ru-RU' : 'en-US');

const normalizePath = (value: string) => value.replace(/[/\\]+$/, '').replaceAll('/', '\\');

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
  if (full.toLowerCase() === root.toLowerCase()) return '.';
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

import { getLocale } from '../i18n';

const intlLocale = () => (getLocale() === 'ru' ? 'ru-RU' : 'en-US');

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

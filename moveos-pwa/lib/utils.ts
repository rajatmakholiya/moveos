import type { Lang } from './i18n';

export function formatCurrency(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export function formatDate(value: string | Date, lang: Lang = 'en') {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatLongDate(value: string | Date, lang: Lang = 'en') {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTime(value: string | Date, lang: Lang = 'en') {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function copy(lang: Lang, en: string, hi: string) {
  return lang === 'hi' ? hi : en;
}

export function safeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function readString(value: unknown, keys: string[], fallback = '') {
  const record = safeRecord(value);
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const field = record[key];
    if (typeof field === 'string' && field.length > 0) {
      return field;
    }
  }

  return fallback;
}

export function readNumber(value: unknown, keys: string[], fallback = 0) {
  const record = safeRecord(value);
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const field = record[key];
    if (typeof field === 'number' && Number.isFinite(field)) {
      return field;
    }
    if (typeof field === 'string' && field.trim() !== '' && Number.isFinite(Number(field))) {
      return Number(field);
    }
  }

  return fallback;
}

export function readArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) {
    return value;
  }

  const record = safeRecord(value);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const field = record[key];
    if (Array.isArray(field)) {
      return field;
    }
  }

  return [];
}

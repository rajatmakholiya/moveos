export function safeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function unwrapData(payload: unknown) {
  const record = safeRecord(payload);
  return record && 'data' in record ? record.data : payload;
}

export function readString(value: unknown, keys: string[], fallback = '') {
  const record = safeRecord(value);
  if (!record) return fallback;

  for (const key of keys) {
    const field = record[key];
    if (typeof field === 'string' && field.length > 0) return field;
  }

  return fallback;
}

export function readNumber(value: unknown, keys: string[], fallback = 0) {
  const record = safeRecord(value);
  if (!record) return fallback;

  for (const key of keys) {
    const field = record[key];
    if (typeof field === 'number' && Number.isFinite(field)) return field;
    if (typeof field === 'string' && field.trim() !== '' && Number.isFinite(Number(field))) {
      return Number(field);
    }
  }

  return fallback;
}

export function readArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value;

  const record = safeRecord(value);
  if (!record) return [];

  for (const key of keys) {
    const field = record[key];
    if (Array.isArray(field)) return field;
  }

  return [];
}

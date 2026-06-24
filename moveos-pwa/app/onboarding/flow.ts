import type { LoginPayload, UserRole } from '../../lib/AuthContext';

export type OnboardingRole = Extract<UserRole, 'PASSENGER' | 'DRIVER'>;

export type OnboardingState = {
  phone: string;
  role: OnboardingRole;
  sessionId?: string;
  onboardingToken?: string;
  verificationId?: string;
  name?: string;
  devOtpCode?: string;
};

const STORAGE_KEY = 'pahadi_onboarding';

export function readOnboardingState(): OnboardingState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const phone = parsed.phone;
    const role = parsed.role;

    if (typeof phone !== 'string' || (role !== 'PASSENGER' && role !== 'DRIVER')) {
      return null;
    }

    return {
      phone,
      role,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
      onboardingToken: typeof parsed.onboardingToken === 'string' ? parsed.onboardingToken : undefined,
      verificationId: typeof parsed.verificationId === 'string' ? parsed.verificationId : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      devOtpCode: typeof parsed.devOtpCode === 'string' ? parsed.devOtpCode : undefined,
    };
  } catch {
    return null;
  }
}

export function writeOnboardingState(next: OnboardingState) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearOnboardingState() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(-10);
}

export function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 5) {
    return digits;
  }
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function maskPhone(value: string) {
  const digits = normalizePhone(value);
  return `+91 XXXXX X${digits.slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readStringField(value: unknown, keys: string[]) {
  const source = unwrapData(value);
  if (!isRecord(source)) {
    return undefined;
  }

  for (const key of keys) {
    const field = source[key];
    if (typeof field === 'string' && field.length > 0) {
      return field;
    }
  }

  return undefined;
}

export function readBooleanField(value: unknown, keys: string[]) {
  const source = unwrapData(value);
  if (!isRecord(source)) {
    return undefined;
  }

  for (const key of keys) {
    const field = source[key];
    if (typeof field === 'boolean') {
      return field;
    }
  }

  return undefined;
}

export function readLoginPayload(value: unknown, fallback: OnboardingState): LoginPayload | null {
  const source = unwrapData(value);
  if (!isRecord(source)) {
    return null;
  }

  const token = readStringField(source, ['token', 'accessToken', 'authToken', 'jwt']);
  const userValue = isRecord(source.user) ? source.user : source;
  const userId = readStringField(userValue, ['userId', 'id']);
  const roleValue = userValue.role ?? fallback.role;

  if (!token || !userId || (roleValue !== 'PASSENGER' && roleValue !== 'DRIVER' && roleValue !== 'AGENT' && roleValue !== 'ADMIN')) {
    return null;
  }

  return {
    token,
    refreshToken: readStringField(source, ['refreshToken']),
    userId,
    role: roleValue,
    passengerId: readStringField(userValue, ['passengerId']),
    driverId: readStringField(userValue, ['driverId']),
    name: readStringField(userValue, ['name']) ?? fallback.name,
    phone: readStringField(userValue, ['phone']) ?? fallback.phone,
  };
}

export function onboardingCopy(lang: 'en' | 'hi', en: string, hi: string) {
  return lang === 'hi' ? hi : en;
}

export function unwrapData(value: unknown) {
  if (isRecord(value) && isRecord(value.data)) {
    return value.data;
  }
  return value;
}

export function localeForLang(lang: 'en' | 'hi') {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

export function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
}

export function deviceFingerprint() {
  if (typeof window === 'undefined') {
    return 'web-device';
  }

  const key = 'pahadi_device_fingerprint';
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, next);
  return next;
}

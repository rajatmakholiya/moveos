import * as Keychain from 'react-native-keychain';
import { ENV } from '@/config/env';

// Thin wrapper so Reactotron calls compile away in production bundles
const tron = {
  log: (...args: unknown[]) => {
    if (__DEV__) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const R = require('reactotron-react-native').default;
      R?.log?.(...args);
    }
  },
  warn: (message: string, extra?: unknown) => {
    if (__DEV__) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const R = require('reactotron-react-native').default;
      R?.display?.({ name: '⚠️  API Warning', value: extra ?? {}, preview: message, important: false });
    }
  },
  error: (message: string, extra?: unknown) => {
    if (__DEV__) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const R = require('reactotron-react-native').default;
      R?.display?.({ name: '🔴 API Error', value: extra ?? {}, preview: message, important: true });
    }
  },
};

const BASE = ENV.API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: 'pahadi_token' });
  return creds ? creds.password : null;
}

export async function setStoredToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('pahadi', token, { service: 'pahadi_token' });
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('pahadi', token, { service: 'pahadi_refresh_token' });
}

async function getStoredRefreshToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: 'pahadi_refresh_token' });
  return creds ? creds.password : null;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newToken: string = data.accessToken ?? data.token;
    if (!newToken) return null;
    await setStoredToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

// ─── Core request ─────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  retries?: number;
};

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retries = 2 } = opts;
  const token = opts.token !== undefined ? opts.token : await getStoredToken();

  const execute = async (tkn: string | null, attempt: number): Promise<T> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tkn) headers['Authorization'] = `Bearer ${tkn}`;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && attempt === 0) {
      tron.warn(`401 on ${method} ${path} — attempting token refresh`);
      const newToken = await refreshAccessToken();
      if (newToken) {
        tron.log(`Token refreshed, retrying ${method} ${path}`);
        return execute(newToken, 1);
      }
      tron.error(`Token refresh failed — ${method} ${path}`);
      throw new ApiError(401, null);
    }

    if (!res.ok) {
      if (method === 'GET' && res.status >= 500 && attempt < retries) {
        tron.warn(`${res.status} on ${method} ${path} — retry ${attempt + 1}/${retries}`);
        await new Promise<void>(r => { setTimeout(r, 500 * (attempt + 1)); });
        return execute(tkn, attempt + 1);
      }
      let errBody: unknown;
      try {
        errBody = await res.json();
      } catch {
        errBody = null;
      }
      tron.error(`${method} ${path} → ${res.status}`, errBody);
      throw new ApiError(res.status, errBody);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };

  return execute(token, 0);
}

// Unwraps the { ok: true, data: T } envelope that ApiResponseInterceptor adds
// to every non-onboarding endpoint. Onboarding endpoints bypass the interceptor
// and return { status: 'ok', data: ... } which is handled explicitly in screens.
async function unwrap<T>(promise: Promise<{ ok: boolean; data: T }>): Promise<T> {
  const res = await promise;
  return res.data;
}

export const api = {
  get: <T>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'POST', body, token }),
  put: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'PUT', body, token }),
  patch: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'PATCH', body, token }),
  delete: <T>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'DELETE', token }),

  // Variants that unwrap the { ok, data } envelope from ApiResponseInterceptor
  getd: <T>(path: string, token?: string | null) =>
    unwrap(apiRequest<{ ok: boolean; data: T }>(path, { method: 'GET', token })),
  postd: <T>(path: string, body?: unknown, token?: string | null) =>
    unwrap(apiRequest<{ ok: boolean; data: T }>(path, { method: 'POST', body, token })),
  putd: <T>(path: string, body?: unknown, token?: string | null) =>
    unwrap(apiRequest<{ ok: boolean; data: T }>(path, { method: 'PUT', body, token })),
  patchd: <T>(path: string, body?: unknown, token?: string | null) =>
    unwrap(apiRequest<{ ok: boolean; data: T }>(path, { method: 'PATCH', body, token })),
  deleted: <T>(path: string, token?: string | null) =>
    unwrap(apiRequest<{ ok: boolean; data: T }>(path, { method: 'DELETE', token })),
};

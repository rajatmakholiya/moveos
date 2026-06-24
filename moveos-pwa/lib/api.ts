export type ApiErrorCode = 'NETWORK_ERROR' | 'UNAUTHORIZED' | 'HTTP_ERROR' | string;

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: unknown;
};

type ApiSuccessEnvelope = {
  ok: true;
  data: unknown;
};

type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type UnauthorizedHandler = () => void;
type RefreshHandler = () => Promise<string | null>;

export function isRetryableMethod(method: HttpMethod): boolean {
  return method === 'GET' || method === 'HEAD';
}

declare const process: {
  env?: {
    NEXT_PUBLIC_API_URL?: string;
    NODE_ENV?: string;
  };
} | undefined;

function resolveApiBase(): string {
  const url = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_API_URL : undefined;
  if (!url) {
    const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
    if (isProd) {
      throw new Error('[MoveOS] NEXT_PUBLIC_API_URL is not set. Add it to your deployment environment (e.g. https://api.yourdomain.com/api).');
    }
    return 'http://localhost:3000/api';
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`[MoveOS] NEXT_PUBLIC_API_URL "${url}" is not a valid URL. It must start with http:// or https://.`);
  }
  return url.replace(/\/$/, '');
}

const API_BASE = resolveApiBase();
const RETRY_DELAY_MS = 1000;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let refreshHandler: RefreshHandler | null = null;
let isRefreshing = false;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

function readStoredToken() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem('pahadi_auth');
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === 'string' ? parsed.token : undefined;
  } catch {
    return undefined;
  }
}

function toApiError(value: unknown, status?: number): ApiError {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (record.ok === false) {
      return {
        code: typeof record.errorCode === 'string' ? record.errorCode : 'HTTP_ERROR',
        message: typeof record.message === 'string' ? record.message : 'Something went wrong',
        status: typeof record.statusCode === 'number' ? record.statusCode : status,
        details: record.details ?? value,
      };
    }

    const rawMessage = record.message;
    const nestedMessage = typeof rawMessage === 'object' && rawMessage !== null ? (rawMessage as Record<string, unknown>).message : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : typeof nestedMessage === 'string'
          ? nestedMessage
          : 'Something went wrong';
    const code = typeof record.code === 'string'
      ? record.code
      : typeof rawMessage === 'object' && rawMessage !== null && typeof (rawMessage as Record<string, unknown>).error_code === 'string'
        ? String((rawMessage as Record<string, unknown>).error_code)
        : typeof record.error === 'string'
          ? record.error
          : 'HTTP_ERROR';

    return {
      code,
      message,
      status,
      details: record.details ?? value,
    };
  }

  return {
    code: 'HTTP_ERROR',
    message: 'Something went wrong',
    status,
  };
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return typeof value === 'object' && value !== null && (value as ApiSuccessEnvelope).ok === true && 'data' in value;
}

function normalizeSuccessPayload(payload: unknown) {
  if (isApiSuccessEnvelope(payload)) {
    return { status: 'ok', data: payload.data };
  }
  return payload;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status === 204) {
    return undefined;
  }

  if (contentType.includes('application/json')) {
    return response.json() as Promise<unknown>;
  }

  return response.text();
}

async function request<T>(method: HttpMethod, path: string, body?: unknown, token?: string, hasRetried = false, hasRefreshed = false): Promise<T> {
  const authToken = token ?? readStoredToken();
  const headers = new Headers();

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
    throw {
      code: 'NETWORK_ERROR',
      message: error instanceof TypeError
        ? (isDev
            ? 'Could not reach the API. Check that the gateway is running and CORS allows this frontend.'
            : 'We could not connect to the server. Please check your internet connection and try again.')
        : 'No internet connection',
    } satisfies ApiError;
  }

  if (response.status >= 500 && !hasRetried && isRetryableMethod(method)) {
    await delay(RETRY_DELAY_MS);
    return request<T>(method, path, body, token, true);
  }

  const payload = await parseResponse(response);

  if (response.status === 401) {
    if (!hasRefreshed && !isRefreshing && refreshHandler) {
      isRefreshing = true;
      const newToken = await refreshHandler();
      isRefreshing = false;
      if (newToken) {
        return request<T>(method, path, body, newToken, false, true);
      }
    }
    unauthorizedHandler?.();
    const apiError = toApiError(payload, response.status);
    throw {
      code: 'UNAUTHORIZED',
      message: apiError.message === 'Something went wrong' ? 'Session expired' : apiError.message,
      status: response.status,
      details: payload,
    } satisfies ApiError;
  }

  if (!response.ok) {
    throw toApiError(payload, response.status);
  }

  return normalizeSuccessPayload(payload) as T;
}

function getRequest<T>(path: string, token?: string): Promise<T> {
  const authToken = token ?? readStoredToken() ?? '';
  const key = `${authToken}:${path}`;
  const existing = inFlightGetRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = request<T>('GET', path, undefined, token).finally(() => {
    inFlightGetRequests.delete(key);
  });
  inFlightGetRequests.set(key, promise);
  return promise;
}

export const api = {
  get: <T>(path: string, token?: string) => getRequest<T>(path, token),
  post: <T>(path: string, body: unknown, token?: string) => request<T>('POST', path, body, token),
  put: <T>(path: string, body: unknown, token?: string) => request<T>('PUT', path, body, token),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>('PATCH', path, body, token),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, undefined, token),
};

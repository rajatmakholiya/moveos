'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, setRefreshHandler } from './api';
import { isPushConfigured, registerPushToken } from './push';

export type UserRole = 'PASSENGER' | 'DRIVER' | 'AGENT' | 'ADMIN';

export type AuthUser = {
  userId: string;
  role: UserRole;
  passengerId?: string;
  driverId?: string;
  name?: string;
  phone?: string;
};

export type LoginPayload = AuthUser & {
  token: string;
  refreshToken?: string;
};

type StoredAuth = {
  token: string;
  refreshToken?: string;
  user: AuthUser;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isReady: boolean;
  login: (payload: LoginPayload) => void;
  logout: () => void;
};

const STORAGE_KEY = 'pahadi_auth';

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isReady: false,
  login: () => undefined,
  logout: () => undefined,
});

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return window.atob(padded);
}

function isTokenExpired(token: string) {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as { exp?: unknown };
    if (typeof payload.exp !== 'number') {
      return false;
    }

    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function isRole(value: unknown): value is UserRole {
  return value === 'PASSENGER' || value === 'DRIVER' || value === 'AGENT' || value === 'ADMIN';
}

// Normalize legacy RIDER role to PASSENGER. Stored auth predating the role
// migration may still contain 'RIDER'; normalize it to keep the local cache
// consistent with what the backend now issues.
function normalizeRole(value: unknown): unknown {
  return value === 'RIDER' ? 'PASSENGER' : value;
}

function parseStoredAuth(raw: string): StoredAuth | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = parsed.token;
    const user = parsed.user;

    if (typeof token !== 'string' || typeof user !== 'object' || user === null) {
      return null;
    }

    const userRecord = user as Record<string, unknown>;
    const normalizedRole = normalizeRole(userRecord.role);
    if (typeof userRecord.userId !== 'string' || !isRole(normalizedRole)) {
      return null;
    }

    return {
      token,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      user: {
        userId: userRecord.userId,
        role: normalizedRole,
        passengerId: typeof userRecord.passengerId === 'string' ? userRecord.passengerId : undefined,
        driverId: typeof userRecord.driverId === 'string' ? userRecord.driverId : undefined,
        name: typeof userRecord.name === 'string' ? userRecord.name : undefined,
        phone: typeof userRecord.phone === 'string' ? userRecord.phone : undefined,
      },
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const login = useCallback((payload: LoginPayload) => {
    const nextUser: AuthUser = {
      userId: payload.userId,
      role: payload.role,
      passengerId: payload.passengerId,
      driverId: payload.driverId,
      name: payload.name,
      phone: payload.phone,
    };
    const nextAuth: StoredAuth = { token: payload.token, refreshToken: payload.refreshToken, user: nextUser };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
    setToken(payload.token);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsReady(true);
      return;
    }

    const stored = parseStoredAuth(raw);
    if (!stored) {
      window.localStorage.removeItem(STORAGE_KEY);
      setIsReady(true);
      return;
    }

    if (isTokenExpired(stored.token) && !stored.refreshToken) {
      window.localStorage.removeItem(STORAGE_KEY);
      setIsReady(true);
      return;
    }

    setToken(stored.token);
    setUser(stored.user);
    setIsReady(true);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Best-effort push registration once authenticated. No-op unless the
  // NEXT_PUBLIC_FIREBASE_* env vars are configured.
  useEffect(() => {
    if (!token || !user || !isPushConfigured()) return;
    void registerPushToken(token);
  }, [token, user]);

  useEffect(() => {
    const handler = async (): Promise<string | null> => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const stored = parseStoredAuth(raw);
      if (!stored?.refreshToken) return null;
      try {
        const res = await api.post<{ accessToken: string }>('/auth/refresh', { refreshToken: stored.refreshToken });
        const updated: StoredAuth = { ...stored, token: res.accessToken };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setToken(res.accessToken);
        return res.accessToken;
      } catch {
        return null;
      }
    };
    setRefreshHandler(handler);
    return () => setRefreshHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, token, isReady, login, logout }), [user, token, isReady, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

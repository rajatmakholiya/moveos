'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setRefreshHandler, type ApiError } from './api';

export interface AdminUser {
  userId: string;
  name?: string;
  phone: string;
  role: 'SUPER_ADMIN' | 'ORG_ADMIN';
  defaultOrganizationId?: string;
  memberships?: Array<{
    id: string;
    organizationId: string;
    role: string;
    organization?: {
      id: string;
      legalName: string;
      tradeName?: string;
      status: string;
    };
  }>;
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  isReady: boolean;
  login: (phone: string, otp: string, mode?: 'super_admin' | 'organization') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  isReady: false,
  login: async () => {},
  logout: () => {},
});

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';
const REFRESH_KEY = 'admin_refresh_token';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as AdminUser;
        setToken(storedToken);
        setUser(parsed);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      // Guard: don't redirect if we're already on the login page.
      if (typeof window !== 'undefined' && window.location.pathname === '/') return;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(REFRESH_KEY);
      setToken(null);
      setUser(null);
      sessionStorage.setItem('auth:session_expired', '1');
      window.location.href = '/';
    };
    window.addEventListener('admin:session-expired', handleSessionExpired);
    return () => window.removeEventListener('admin:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    const handler = async (): Promise<string | null> => {
      const storedRefresh = localStorage.getItem(REFRESH_KEY);
      if (!storedRefresh) return null;
      try {
        const res = await api.post<{ accessToken: string }>('/auth/refresh', { refreshToken: storedRefresh });
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        setToken(res.accessToken);
        return res.accessToken;
      } catch {
        return null;
      }
    };
    setRefreshHandler(handler);
    return () => setRefreshHandler(null);
  }, []);

  const login = async (phone: string, otp: string, mode: 'super_admin' | 'organization' = 'super_admin') => {
    const path = mode === 'organization' ? '/auth/organization/otp/verify' : '/auth/admin/otp/verify';
    const res = await api.post<{
      accessToken: string;
      refreshToken?: string;
      role: string;
      name?: string;
      userId: string;
      defaultOrganizationId?: string;
      memberships?: AdminUser['memberships'];
    }>(
      path,
      { phone, otp },
    );
    if (mode === 'super_admin' && res.role !== 'SUPER_ADMIN') {
      throw { message: 'Access denied: SUPER_ADMIN role required', status: 403 } as ApiError;
    }
    if (mode === 'organization' && res.role !== 'ORG_ADMIN') {
      throw { message: 'Access denied: organization admin membership required', status: 403 } as ApiError;
    }
    const adminUser: AdminUser = {
      userId: res.userId,
      name: res.name,
      phone,
      role: res.role as AdminUser['role'],
      defaultOrganizationId: res.defaultOrganizationId,
      memberships: res.memberships,
    };
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(adminUser));
    if (res.refreshToken) {
      localStorage.setItem(REFRESH_KEY, res.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
    setToken(res.accessToken);
    setUser(adminUser);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, isReady, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireSuperAdmin() {
  const { user, isReady } = useAuth();
  return { user, isReady, authorized: isReady && user?.role === 'SUPER_ADMIN' };
}

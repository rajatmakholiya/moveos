import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, AuthPayload } from '@/types';

type AuthStore = {
  user: AuthUser | null;
  token: string | null;
  isReady: boolean;
  login: (payload: AuthPayload) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

function normalizeRole(user: AuthUser): AuthUser {
  // Normalize legacy RIDER role to PASSENGER
  if ((user.role as string) === 'RIDER') {
    return { ...user, role: 'PASSENGER' };
  }
  return user;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isReady: false,

  hydrate: async () => {
    try {
      const tokenCreds = await Keychain.getGenericPassword({ service: 'pahadi_token' });
      const token = tokenCreds ? tokenCreds.password : null;

      const userStr = await AsyncStorage.getItem('pahadi_user');
      const raw: AuthUser | null = userStr ? JSON.parse(userStr) : null;
      const user = raw ? normalizeRole(raw) : null;

      set({ token, user, isReady: true });
    } catch {
      set({ isReady: true });
    }
  },

  login: async (payload: AuthPayload) => {
    const user = normalizeRole(payload.user);

    await Keychain.setGenericPassword('pahadi', payload.token, {
      service: 'pahadi_token',
    });
    if (payload.refreshToken) {
      await Keychain.setGenericPassword('pahadi', payload.refreshToken, {
        service: 'pahadi_refresh_token',
      });
    }
    await AsyncStorage.setItem('pahadi_user', JSON.stringify(user));
    set({ token: payload.token, user, isReady: true });
  },

  logout: async () => {
    await Keychain.resetGenericPassword({ service: 'pahadi_token' });
    await Keychain.resetGenericPassword({ service: 'pahadi_refresh_token' });
    await AsyncStorage.removeItem('pahadi_user');
    set({ token: null, user: null });
  },
}));

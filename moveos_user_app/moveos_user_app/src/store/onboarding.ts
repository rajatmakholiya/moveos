import { create } from 'zustand';

// In-memory only — never persisted to disk (mirrors PWA sessionStorage behaviour)
type OnboardingStore = {
  sessionId: string | null;
  onboardingToken: string | null;
  phone: string | null;
  role: 'PASSENGER' | 'DRIVER';
  intendedRoute: { screen: string; params?: Record<string, unknown> } | null;

  setSession: (sessionId: string, onboardingToken: string) => void;
  setPhone: (phone: string) => void;
  setRole: (role: 'PASSENGER' | 'DRIVER') => void;
  setIntendedRoute: (route: { screen: string; params?: Record<string, unknown> } | null) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  sessionId: null,
  onboardingToken: null,
  phone: null,
  role: 'PASSENGER',
  intendedRoute: null,

  setSession: (sessionId, onboardingToken) => set({ sessionId, onboardingToken }),
  setPhone: (phone) => set({ phone }),
  setRole: (role) => set({ role }),
  setIntendedRoute: (intendedRoute) => set({ intendedRoute }),
  reset: () =>
    set({
      sessionId: null,
      onboardingToken: null,
      phone: null,
      role: 'PASSENGER',
      intendedRoute: null,
    }),
}));

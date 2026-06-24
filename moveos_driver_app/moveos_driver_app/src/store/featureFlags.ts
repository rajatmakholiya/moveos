import { create } from 'zustand';
import { api } from '@/lib/api';
import type { FeatureFlags } from '@/types';

const CACHE_TTL_MS = 5 * 60 * 1000;

type FlagStore = {
  flags: FeatureFlags;
  fetchedAt: number | null;
  fetch: (token: string) => Promise<void>;
};

export const useFeatureFlagStore = create<FlagStore>((set, get) => ({
  flags: {},
  fetchedAt: null,

  fetch: async (token: string) => {
    const { fetchedAt } = get();
    if (fetchedAt && Date.now() - fetchedAt < CACHE_TTL_MS) return;
    try {
      const flags = await api.get<FeatureFlags>('/me/feature-flags', token);
      set({ flags, fetchedAt: Date.now() });
    } catch {
      // silent — flags are optional enhancements
    }
  },
}));

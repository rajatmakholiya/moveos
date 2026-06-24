import useSWR from 'swr';
import { api } from './api';
import { useAuth } from './AuthContext';

export type FeatureFlags = {
  enableLocationNudge?: boolean;
  enableWalletPrompt?: boolean;
  [key: string]: boolean | undefined;
};

export function useFeatureFlags(): { flags: FeatureFlags; isLoading: boolean } {
  const { token } = useAuth();
  const { data, isLoading } = useSWR<FeatureFlags>(
    token ? 'feature-flags' : null,
    async () => {
      const res = await api.get<{ flags: FeatureFlags }>('/me/feature-flags', token!);
      return (res as { flags?: FeatureFlags }).flags ?? {};
    },
    { dedupingInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );
  return { flags: data ?? {}, isLoading };
}

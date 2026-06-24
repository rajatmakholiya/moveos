import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';

// Runs once on app mount. Hydrates all persisted stores in parallel.
export function useAppInitializer() {
  const hydrateAuth = useAuthStore((s: { hydrate: () => Promise<void> }) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s: { hydrate: () => Promise<void> }) => s.hydrate);

  useEffect(() => {
    void Promise.all([hydrateAuth(), hydrateLanguage()]);
  }, [hydrateAuth, hydrateLanguage]);

  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        // Re-hydrate auth on foreground to catch token expiry
        void hydrateAuth();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [hydrateAuth]);
}

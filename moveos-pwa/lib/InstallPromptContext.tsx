'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallPromptContextValue = {
  canInstall: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
  triggerInstall: () => Promise<void>;
  dismissInstall: () => void;
};

const DISMISS_KEY = 'pahadi_install_dismissed';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const InstallPromptContext = createContext<InstallPromptContextValue>({
  canInstall: false,
  isIosSafari: false,
  isStandalone: false,
  triggerInstall: async () => undefined,
  dismissInstall: () => undefined,
});

function wasRecentlyDismissed() {
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const timestamp = raw ? Number(raw) : 0;
  return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_WINDOW_MS;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectIosSafari() {
  const userAgent = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  return isIos && isSafari;
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosSafari, setIosSafari] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setDismissed(wasRecentlyDismissed());
    setIosSafari(detectIosSafari());
    setStandalone(isStandalone());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!wasRecentlyDismissed() && !isStandalone()) {
        setDeferredPrompt(event as BeforeInstallPromptEvent);
      }
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismissInstall = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferredPrompt(null);
    setDismissed(true);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const value = useMemo<InstallPromptContextValue>(
    () => ({
      canInstall: !dismissed && !standalone && (deferredPrompt !== null || iosSafari),
      isIosSafari: iosSafari,
      isStandalone: standalone,
      triggerInstall,
      dismissInstall,
    }),
    [deferredPrompt, dismissInstall, dismissed, iosSafari, standalone, triggerInstall],
  );

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export const useInstallPrompt = () => useContext(InstallPromptContext);

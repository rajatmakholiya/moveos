'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SplashScreen } from './SplashScreen';

const FIRST_VISIT_KEY = 'pahadi_splash_seen';
const skipPrefixes = ['/onboarding', '/driver', '/api'];

export function SplashGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [showSplash, setShowSplash] = useState(false);
  const handleDone = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    const shouldSkip = skipPrefixes.some((prefix) => pathname.startsWith(prefix));
    const seen = window.localStorage.getItem(FIRST_VISIT_KEY) === 'true';
    setShowSplash(!shouldSkip && !seen);
  }, [pathname]);

  return (
    <>
      {children}
      {showSplash ? <SplashScreen onDone={handleDone} /> : null}
    </>
  );
}

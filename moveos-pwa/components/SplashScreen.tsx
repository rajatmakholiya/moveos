'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { tx } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';

export interface SplashScreenProps {
  onDone: () => void;
}

const FIRST_VISIT_KEY = 'pahadi_splash_seen';

export function SplashScreen({ onDone }: SplashScreenProps) {
  const { lang } = useLanguage();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hasSeenSplash = window.localStorage.getItem(FIRST_VISIT_KEY) === 'true';
    const minimumDelay = hasSeenSplash ? 800 : 2000;
    const startedAt = Date.now();
    let ready = document.readyState === 'complete';
    let timeoutId: number | undefined;
    let exitTimeoutId: number | undefined;
    let hardStopId: number | undefined;
    let done = false;

    const finish = () => {
      if (done) {
        return;
      }
      const remaining = Math.max(0, minimumDelay - (Date.now() - startedAt));
      timeoutId = window.setTimeout(() => {
        done = true;
        window.localStorage.setItem(FIRST_VISIT_KEY, 'true');
        setLeaving(true);
        exitTimeoutId = window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pahadi:splash-done'));
          onDone();
        }, 300);
      }, remaining);
    };

    const handleLoad = () => {
      ready = true;
      finish();
    };

    if (ready) {
      finish();
    } else {
      window.addEventListener('load', handleLoad, { once: true });
      timeoutId = window.setTimeout(() => {
        ready = document.readyState === 'complete';
        finish();
      }, minimumDelay);
      hardStopId = window.setTimeout(() => {
        ready = true;
        finish();
      }, 3500);
    }

    return () => {
      window.removeEventListener('load', handleLoad);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (exitTimeoutId) {
        window.clearTimeout(exitTimeoutId);
      }
      if (hardStopId) {
        window.clearTimeout(hardStopId);
      }
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--brand)] px-8 text-center"
      initial={{ opacity: 1, scale: 1 }}
      animate={leaving ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
      aria-label={tx('splashLoading', lang)}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <svg width="220" height="112" viewBox="0 0 220 112" role="img" aria-label={tx('appName', lang)} className="mb-7">
          <circle cx="176" cy="20" r="4" fill="var(--teal-100)" opacity="0.9" />
          <path d="M20 88L78 28C82 24 87 25 91 31L120 67L156 16C160 10 166 10 171 17L204 88H20Z" fill="white" opacity="0.95" />
          <path d="M78 28L98 64L111 51L120 67L91 31C87 25 82 24 78 28Z" fill="var(--teal-100)" opacity="0.7" />
          <path d="M156 16L171 54L184 43L171 17C166 10 160 10 156 16Z" fill="var(--teal-100)" opacity="0.7" />
          <path d="M35 88C69 73 96 72 125 79C153 86 180 84 204 88H35Z" fill="var(--teal-800)" opacity="0.45" />
        </svg>
        <h1 className="font-display text-[28px] font-bold leading-tight text-white">{tx('appName', lang)}</h1>
        <p className="mt-2 text-body text-[var(--teal-100)]">{tx('tagline', lang)}</p>
      </div>
      <div className="mb-10 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--teal-800)]">
        <motion.div
          className="h-full rounded-full bg-[var(--teal-400)]"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 1.8, ease: [0, 0, 0.2, 1] }}
        />
      </div>
    </motion.div>
  );
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../lib/InstallPromptContext';
import { useLanguage } from '../lib/LanguageContext';
import { useToast } from '../lib/ToastContext';
import { tx } from '../lib/i18n';
import { Button } from './ui/Button';

export function InstallBanner() {
  const { canInstall, isIosSafari, triggerInstall, dismissInstall } = useInstallPrompt();
  const { lang } = useLanguage();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const handleSplashDone = () => setSplashDone(true);
    window.addEventListener('pahadi:splash-done', handleSplashDone);
    return () => window.removeEventListener('pahadi:splash-done', handleSplashDone);
  }, []);

  useEffect(() => {
    if (!canInstall || !splashDone) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(timer);
  }, [canInstall, splashDone]);

  useEffect(() => {
    const handleInstalled = () => {
      toast.success(lang === 'hi' ? 'पहाड़ी राइड्स इंस्टॉल हो गई!' : 'Pahadi Rides installed!');
      setVisible(false);
    };

    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, [lang, toast]);

  const handleInstall = async () => {
    await triggerInstall();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissInstall();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible ? (
        <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-[480px] justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={tx('installTitle', lang)}
            initial={{ opacity: 0, y: 120 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 120 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.18)]"
          >
            {isIosSafari ? (
              <IosInstallGuide onDismiss={handleDismiss} />
            ) : (
              <div className="flex gap-4">
                <MountainIcon />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-heading text-[var(--text-primary)]">{tx('installTitle', lang)}</h2>
                  <p className="mt-1 text-small text-[var(--text-secondary)]">{tx('installDesc', lang)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button size="sm" onClick={handleInstall} fullWidth>
                      {tx('installBtn', lang)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDismiss} fullWidth>
                      {tx('installDismiss', lang)}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function MountainIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="mt-0.5 shrink-0">
      <rect width="34" height="34" rx="12" fill="var(--brand-light)" />
      <path d="M6 25L15 11L20 18L23 14L29 25H6Z" fill="var(--brand)" />
      <path d="M15 11L18 18L20 16L20 18L15 11Z" fill="white" opacity="0.75" />
    </svg>
  );
}

function IosInstallGuide({ onDismiss }: { onDismiss: () => void }) {
  const { lang } = useLanguage();

  return (
    <div>
      <div className="flex items-center gap-3">
        <MountainIcon />
        <h2 className="font-display text-heading text-[var(--text-primary)]">
          {lang === 'hi' ? 'पहाड़ी राइड्स इंस्टॉल करें' : 'Install Pahadi Rides'}
        </h2>
      </div>
      <ol className="mt-5 space-y-3 text-body text-[var(--text-primary)]">
        <li className="flex gap-3">
          <span className="font-mono text-[var(--brand)]">1</span>
          <span>{lang === 'hi' ? 'नीचे शेयर आइकन पर टैप करें' : 'Tap the Share icon below'}</span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--brand)]" aria-hidden="true">
            ↑
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-[var(--brand)]">2</span>
          <span>{lang === 'hi' ? '"Add to Home Screen" चुनें' : 'Scroll down and tap "Add to Home Screen"'}</span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-[var(--brand)]">3</span>
          <span>{lang === 'hi' ? 'कन्फर्म करने के लिए "Add" टैप करें' : 'Tap "Add" to confirm'}</span>
        </li>
      </ol>
      <Button className="mt-5" fullWidth onClick={onDismiss}>
        {lang === 'hi' ? 'समझ गया' : 'Got it'}
      </Button>
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { tx } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { onboardingCopy } from './flow';

export default function OnboardingWelcomePage() {
  const { lang } = useLanguage();
  const { user, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && user) {
      router.replace('/');
    }
  }, [isReady, router, user]);

  return (
    <main className="min-h-screen bg-[var(--brand)]">
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="font-display text-heading text-white">{tx('appName', lang)}</span>
          <LanguageToggle />
        </div>
        <div className="flex min-h-[50vh] flex-1 items-center justify-center px-5">
          <HeroRoad ariaLabel={onboardingCopy(lang, 'Mountain taxi road', 'पहाड़ी टैक्सी सड़क')} />
        </div>
        <motion.section
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="rounded-t-[2rem] bg-[var(--surface)] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-7 shadow-[0_-12px_40px_rgba(0,0,0,0.2)]"
        >
          <h1 className="font-display text-[28px] font-bold leading-tight text-[var(--brand)]">{tx('appName', lang)}</h1>
          <p className="mt-2 text-body text-[var(--text-secondary)]">{tx('tagline', lang)}</p>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            <FeaturePill label={onboardingCopy(lang, 'Hill routes', 'पहाड़ी मार्ग')} />
            <FeaturePill label={onboardingCopy(lang, 'Live tracking', 'लाइव ट्रैकिंग')} />
            <FeaturePill label={onboardingCopy(lang, 'Instant booking', 'तुरंत बुकिंग')} />
          </div>
          <div className="mt-7 space-y-3">
            <Button fullWidth onClick={() => router.push('/onboarding/phone')}>
              {onboardingCopy(lang, 'Get started', 'शुरू करें')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => router.push('/onboarding/phone?role=DRIVER')}>
              {onboardingCopy(lang, "I'm a driver", 'मैं ड्राइवर हूँ')}
            </Button>
          </div>
        </motion.section>
      </div>
    </main>
  );
}

function FeaturePill({ label }: { label: string }) {
  return <span className="shrink-0 rounded-full bg-[var(--brand-light)] px-3 py-2 text-small font-medium text-[var(--brand)]">{label}</span>;
}

function HeroRoad({ ariaLabel }: { ariaLabel: string }) {
  return (
    <svg viewBox="0 0 360 300" className="h-auto w-full max-w-[360px]" role="img" aria-label={ariaLabel}>
      <rect width="360" height="300" rx="28" fill="var(--teal-50)" />
      <circle cx="300" cy="54" r="18" fill="var(--amber-400)" opacity="0.8" />
      <path d="M0 180L82 82L135 150L192 52L288 180H0Z" fill="white" />
      <path d="M192 52L217 136L241 104L288 180L192 52Z" fill="var(--teal-100)" opacity="0.9" />
      <path d="M0 300V198C56 175 101 179 146 198C198 220 248 215 360 184V300H0Z" fill="var(--teal-700)" />
      <path d="M142 300C154 260 173 223 202 188C222 164 235 143 236 122C257 154 279 198 294 300H142Z" fill="var(--stone-900)" opacity="0.88" />
      <path d="M212 190C230 219 245 256 254 300" stroke="var(--stone-50)" strokeWidth="5" strokeLinecap="round" strokeDasharray="16 16" />
      <g transform="translate(75 199)">
        <path d="M26 36H112C121 36 127 30 126 22L123 15C120 6 113 0 103 0H49C39 0 31 6 27 15L18 17C10 19 5 25 5 33C5 35 7 36 10 36H26Z" fill="var(--stone-900)" />
        <rect x="47" y="8" width="27" height="15" rx="3" fill="var(--teal-100)" />
        <rect x="79" y="8" width="26" height="15" rx="3" fill="var(--teal-100)" />
        <circle cx="35" cy="38" r="10" fill="var(--stone-800)" />
        <circle cx="102" cy="38" r="10" fill="var(--stone-800)" />
        <circle cx="35" cy="38" r="4" fill="var(--stone-300)" />
        <circle cx="102" cy="38" r="4" fill="var(--stone-300)" />
        <circle cx="15" cy="28" r="3" fill="var(--amber-400)" />
      </g>
    </svg>
  );
}

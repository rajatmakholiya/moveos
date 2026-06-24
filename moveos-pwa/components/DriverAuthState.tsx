'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '../lib/LanguageContext';
import { copy } from '../lib/utils';
import { Button } from './ui/Button';
import { SkeletonCard } from './ui/SkeletonCard';

export function DriverAuthLoading() {
  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <SkeletonCard />
    </main>
  );
}

export function DriverAuthRequired() {
  const router = useRouter();
  const { lang } = useLanguage();

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <section className="mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-light)] font-display text-title text-[var(--brand)]">⌂</div>
        <h1 className="mt-5 font-display text-title text-[var(--text-primary)]">{copy(lang, 'Driver sign in required', 'ड्राइवर साइन इन चाहिए')}</h1>
        <p className="mt-2 text-body text-[var(--text-secondary)]">{copy(lang, 'Sign in as a driver to view dashboard, offerings, requests, and parcels.', 'डैशबोर्ड, ऑफरिंग, रिक्वेस्ट और पार्सल देखने के लिए ड्राइवर के रूप में साइन इन करें।')}</p>
        <Button className="mt-6" fullWidth onClick={() => router.push('/onboarding/phone?role=DRIVER')}>
          {copy(lang, 'Continue as driver', 'ड्राइवर के रूप में जारी रखें')}
        </Button>
        <Button className="mt-3" fullWidth variant="ghost" onClick={() => router.push('/')}>
          {copy(lang, 'Go to customer home', 'कस्टमर होम पर जाएं')}
        </Button>
      </section>
    </main>
  );
}

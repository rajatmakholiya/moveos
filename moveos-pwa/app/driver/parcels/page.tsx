'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { useLanguage } from '../../../lib/LanguageContext';
import { copy, formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { LanguageToggle } from '../../../components/ui/LanguageToggle';
import { Pill } from '../../../components/ui/Pill';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';

export default function DriverParcelsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [requests, setRequests] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (user && user.role !== 'DRIVER') {
      router.replace('/');
    }
  }, [isReady, router, user]);

  useEffect(() => {
    if (user?.role !== 'DRIVER') {
      return;
    }

    api.get<{ requests?: Array<Record<string, unknown>> }>('/driver/requests?type=PARCEL', token ?? undefined)
      .then((payload) => setRequests(Array.isArray(payload.requests) ? payload.requests : []))
      .catch(() => setRequests([]));
  }, [token, user?.role]);

  if (!isReady) {
    return <DriverAuthLoading />;
  }

  if (!user || user.role !== 'DRIVER') {
    return <DriverAuthRequired />;
  }

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Parcel quotes', 'पार्सल कोट')}</h1>
          <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Quotation-based parcel carrying requests', 'कोटेशन बेस्ड पार्सल कैरी रिक्वेस्ट')}</p>
        </div>
        <LanguageToggle />
      </header>
      <section className="mt-5 space-y-4">
        {requests.map((request) => (
          <article key={String(request.id)} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-heading text-[var(--text-primary)]">
                  {String(request.from ?? '')} → {String(request.to ?? '')}
                </h2>
                <p className="text-small text-[var(--text-secondary)]">
                  {formatDate(String(request.requestedFor), lang)} · {formatTime(String(request.requestedFor), lang)}
                </p>
              </div>
              <Pill color="teal" label={copy(lang, 'Quote', 'कोट')} />
            </div>
            <div className="mt-4 rounded-xl bg-[var(--surface-raised)] p-4">
              <p className="font-medium text-[var(--text-primary)]">{String(request.parcelDetails ?? '')}</p>
              <p className="mt-1 text-small text-[var(--text-secondary)]">
                {String(request.passengerName ?? '')} · {copy(lang, 'budget', 'बजट')} {formatCurrency(typeof request.budgetPaise === 'number' ? request.budgetPaise : 0)}
              </p>
            </div>
            <Button className="mt-4" fullWidth>
              {copy(lang, 'Send parcel quote', 'पार्सल कोट भेजें')}
            </Button>
          </article>
        ))}
      </section>
    </main>
  );
}

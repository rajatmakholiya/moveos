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
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';

type RequestRecord = Record<string, unknown>;
type RequestTab = 'OPEN' | 'ACCEPTED';

function readRequests(payload: { data?: { requests?: RequestRecord[] }; requests?: RequestRecord[] }): RequestRecord[] {
  if (Array.isArray((payload.data as any)?.requests)) return (payload.data as any).requests;
  if (Array.isArray(payload.requests)) return payload.requests;
  return [];
}

export default function DriverRequestsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [tab, setTab] = useState<RequestTab>('OPEN');
  const [openRequests, setOpenRequests] = useState<RequestRecord[]>([]);
  const [acceptedRequests, setAcceptedRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady) return;
    if (user && user.role !== 'DRIVER') router.replace('/');
  }, [isReady, router, user]);

  useEffect(() => {
    if (user?.role !== 'DRIVER') return;
    setLoading(true);
    Promise.all([
      api.get<any>('/driver/requests?type=FULL_VEHICLE', token ?? undefined).catch(() => ({ requests: [] })),
      api.get<any>('/driver/requests?status=ACCEPTED', token ?? undefined).catch(() => ({ requests: [] })),
    ]).then(([openPayload, acceptedPayload]) => {
      setOpenRequests(readRequests(openPayload));
      setAcceptedRequests(readRequests(acceptedPayload));
    }).finally(() => setLoading(false));
  }, [token, user?.role]);

  const handleAction = async (requestId: string, action: 'accept' | 'reject') => {
    await api.post(`/driver/requests/${encodeURIComponent(requestId)}/${action}`, {}, token ?? undefined);
    setOpenRequests((current) => current.filter((r) => r.id !== requestId));
    if (action === 'accept') {
      // Reload accepted requests to pick up enriched driver/vehicle data
      api.get<any>('/driver/requests?status=ACCEPTED', token ?? undefined)
        .then((payload) => setAcceptedRequests(readRequests(payload)))
        .catch(() => {});
    }
  };

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const requests = tab === 'OPEN' ? openRequests : acceptedRequests;

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Vehicle requests', 'वाहन रिक्वेस्ट')}</h1>
          <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Full vehicle bookings for family and business trips', 'फैमिली और बिजनेस ट्रिप के लिए पूरा वाहन')}</p>
        </div>
        <LanguageToggle />
      </header>

      <div className="mt-5 grid grid-cols-2 rounded-xl bg-[var(--surface-inset)] p-1">
        {(['OPEN', 'ACCEPTED'] as RequestTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={['rounded-lg px-4 py-2 text-small font-medium transition-colors', tab === t ? 'bg-[var(--surface)] text-[var(--brand)] shadow-card' : 'text-[var(--text-secondary)]'].join(' ')}
          >
            {t === 'OPEN'
              ? copy(lang, `Open (${openRequests.length})`, `ओपन (${openRequests.length})`)
              : copy(lang, `Accepted (${acceptedRequests.length})`, `स्वीकार (${acceptedRequests.length})`)}
          </button>
        ))}
      </div>

      <section className="mt-5 space-y-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : requests.length === 0 ? (
          <EmptyState tab={tab} lang={lang} />
        ) : tab === 'OPEN' ? (
          requests.map((request) => (
            <OpenRequestCard key={String(request.id)} request={request} lang={lang} onAction={handleAction} />
          ))
        ) : (
          requests.map((request) => (
            <AcceptedRequestCard key={String(request.id)} request={request} lang={lang} />
          ))
        )}
      </section>
    </main>
  );
}

function OpenRequestCard({ request, lang, onAction }: { request: RequestRecord; lang: 'en' | 'hi'; onAction: (id: string, action: 'accept' | 'reject') => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const act = async (action: 'accept' | 'reject') => {
    setBusy(true);
    await onAction(String(request.id), action).catch(() => {});
    setBusy(false);
  };

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-heading text-[var(--text-primary)]">
            {String(request.from ?? '')} → {String(request.to ?? '')}
          </h2>
          <p className="text-small text-[var(--text-secondary)]">
            {formatDate(String(request.requestedFor), lang)} · {formatTime(String(request.requestedFor), lang)}
          </p>
        </div>
        <Pill color="amber" label={copy(lang, 'Open', 'ओपन')} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Requester', 'रिक्वेस्टर')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{copy(lang, 'Hidden until accepted', 'स्वीकार करने तक छिपा')}</span>
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Passengers', 'यात्री')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{String(request.seats ?? '')}</span>
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Expected budget', 'बजट')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(typeof request.budgetPaise === 'number' ? request.budgetPaise : 0)}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button fullWidth disabled={busy} onClick={() => void act('accept')}>{copy(lang, 'Accept', 'स्वीकार')}</Button>
        <Button fullWidth variant="ghost" disabled={busy} onClick={() => void act('reject')}>{copy(lang, 'Reject', 'रिजेक्ट')}</Button>
      </div>
    </article>
  );
}

function AcceptedRequestCard({ request, lang }: { request: RequestRecord; lang: 'en' | 'hi' }) {
  const driver = request.driver && typeof request.driver === 'object' ? (request.driver as Record<string, unknown>) : null;
  const vehicle = request.vehicle && typeof request.vehicle === 'object' ? (request.vehicle as Record<string, unknown>) : null;

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-heading text-[var(--text-primary)]">
            {String(request.from ?? '')} → {String(request.to ?? '')}
          </h2>
          <p className="text-small text-[var(--text-secondary)]">
            {formatDate(String(request.requestedFor), lang)} · {formatTime(String(request.requestedFor), lang)}
          </p>
        </div>
        <Pill color="teal" label={copy(lang, 'Accepted', 'स्वीकार')} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Passenger', 'यात्री')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{String(request.passengerName ?? copy(lang, 'Passenger', 'यात्री'))}</span>
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Phone', 'फोन')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{String(request.passengerPhone ?? '-')}</span>
        <span className="text-[var(--text-secondary)]">{copy(lang, 'Seats', 'सीट')}</span>
        <span className="text-right font-medium text-[var(--text-primary)]">{String(request.seats ?? '-')}</span>
        {typeof request.budgetPaise === 'number' ? (
          <>
            <span className="text-[var(--text-secondary)]">{copy(lang, 'Budget', 'बजट')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(request.budgetPaise)}</span>
          </>
        ) : null}
        {request.note ? (
          <>
            <span className="text-[var(--text-secondary)]">{copy(lang, 'Note', 'नोट')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{String(request.note)}</span>
          </>
        ) : null}
        {vehicle ? (
          <>
            <span className="text-[var(--text-secondary)]">{copy(lang, 'Your vehicle', 'आपका वाहन')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{String(vehicle.vehicleNumber ?? vehicle.plate ?? '-')}</span>
          </>
        ) : null}
      </div>
      {request.bookingId ? (
        <p className="mt-3 text-small text-[var(--text-secondary)]">
          {copy(lang, 'Booking ID', 'बुकिंग ID')}: <span className="font-medium text-[var(--text-primary)]">{String(request.bookingId)}</span>
        </p>
      ) : null}
    </article>
  );
}

function EmptyState({ tab, lang }: { tab: RequestTab; lang: 'en' | 'hi' }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-card">
      <svg viewBox="0 0 220 120" className="mx-auto h-28 w-56" aria-hidden="true">
        <rect x="30" y="20" width="160" height="80" rx="12" fill="var(--teal-50)" />
        <rect x="50" y="40" width="80" height="8" rx="4" fill="var(--stone-300)" />
        <rect x="50" y="56" width="55" height="8" rx="4" fill="var(--stone-200)" />
        <circle cx="165" cy="72" r="18" fill="var(--brand)" opacity="0.15" />
        <path d="M158 72h14M165 65v14" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h2 className="mt-4 font-display text-heading text-[var(--text-primary)]">
        {tab === 'OPEN'
          ? copy(lang, 'No open requests', 'कोई ओपन रिक्वेस्ट नहीं')
          : copy(lang, 'No accepted requests', 'कोई स्वीकार रिक्वेस्ट नहीं')}
      </h2>
      <p className="mt-1 text-small text-[var(--text-secondary)]">
        {tab === 'OPEN'
          ? copy(lang, 'New full vehicle requests will appear here.', 'नई फुल वाहन रिक्वेस्ट यहाँ दिखेगी।')
          : copy(lang, 'Requests you accept will appear here.', 'आपके द्वारा स्वीकार रिक्वेस्ट यहाँ दिखेगी।')}
      </p>
    </div>
  );
}

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { tx } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { parseRoutes, parseTrips, type RouteOption, type SeatType, type Trip } from '../../lib/pahadi';
import { copy, formatDate } from '../../lib/utils';
import { TripCard } from '../../components/TripCard';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { SkeletonCard } from '../../components/ui/SkeletonCard';

type SeatFilter = 'ALL' | SeatType;
type SortMode = 'EARLIEST' | 'CHEAPEST';

export default function TripsPage() {
  return (
    <Suspense fallback={<TripsPageFallback />}>
      <TripsPageContent />
    </Suspense>
  );
}

function TripsPageFallback() {
  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-5">
      <SkeletonCard />
    </main>
  );
}

function TripsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const routeId = searchParams.get('routeId') ?? '';
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const [route, setRoute] = useState<RouteOption | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seatFilter, setSeatFilter] = useState<SeatFilter>((searchParams.get('seatType') as SeatType | null) ?? 'ALL');
  const [sortMode, setSortMode] = useState<SortMode>('EARLIEST');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<SeatType>('BACK');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const routeResponse = await api.get<unknown>('/routes');
        const routeOptions = parseRoutes(routeResponse);
        const currentRoute = routeOptions.find((item) => item.id === routeId) ?? null;
        const tripResponse = currentRoute
          ? await api.get<unknown>(`/trips/available?routeId=${encodeURIComponent(routeId)}&date=${encodeURIComponent(date)}`)
          : { trips: [] };
        if (!active) {
          return;
        }
        setRoute(currentRoute);
        setTrips(parseTrips(tripResponse, currentRoute ?? undefined));
      } catch {
        if (active) {
          setTrips([]);
          setError(copy(lang, 'No connection. Pull down or retry.', 'कनेक्शन नहीं है। फिर कोशिश करें।'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [date, lang, routeId]);

  const visibleTrips = useMemo(() => {
    const filtered = trips.filter((trip) => {
      if (seatFilter === 'FRONT') {
        return trip.frontSeatsLeft > 0;
      }
      if (seatFilter === 'BACK') {
        return trip.backSeatsLeft > 0;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'CHEAPEST') {
        return Math.min(a.frontFarePaise, a.backFarePaise) - Math.min(b.frontFarePaise, b.backFarePaise);
      }
      return new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime();
    });
  }, [seatFilter, sortMode, trips]);

  const openSeatSheet = (trip: Trip, seatType?: SeatType) => {
    setSelectedTrip(trip);
    setSelectedSeatType(seatType ?? (trip.backSeatsLeft > 0 ? 'BACK' : 'FRONT'));
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]" aria-label={copy(lang, 'Back', 'वापस')}>
            ←
          </button>
          <div className="min-w-0 text-center">
            <h1 className="truncate font-display text-heading text-[var(--text-primary)]">
              {route ? `${route.from} → ${route.to}` : copy(lang, 'Route unavailable', 'मार्ग उपलब्ध नहीं')}
            </h1>
            <p className="text-small text-[var(--text-secondary)]">
              {formatDate(date, lang)} · {visibleTrips.length} {tx('tripsAvailable', lang)}
            </p>
          </div>
          <LanguageToggle />
        </div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto">
          {(['ALL', 'FRONT', 'BACK'] as SeatFilter[]).map((filter) => (
            <button key={filter} type="button" onClick={() => setSeatFilter(filter)} className={['rounded-full px-3 py-2 text-small font-medium', seatFilter === filter ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'].join(' ')}>
              {filter === 'ALL' ? copy(lang, 'All', 'सभी') : filter === 'FRONT' ? tx('tripsFront', lang) : tx('tripsBack', lang)}
            </button>
          ))}
          <button type="button" onClick={() => setSortMode((current) => (current === 'EARLIEST' ? 'CHEAPEST' : 'EARLIEST'))} className="rounded-full bg-[var(--surface-raised)] px-3 py-2 text-small font-medium text-[var(--text-secondary)]">
            {sortMode === 'EARLIEST' ? copy(lang, 'Earliest', 'सबसे पहले') : copy(lang, 'Cheapest', 'सबसे सस्ता')}
          </button>
        </div>
      </header>
      <section className="space-y-4 px-5 pt-5">
        {error ? <p className="rounded-xl bg-[var(--amber-50)] px-4 py-3 text-small text-[var(--stone-800)]">{error}</p> : null}
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : visibleTrips.length === 0 ? (
          <EmptyTrips route={route} date={date} lang={lang} onSearchAnother={() => router.push('/')} onRequest={route ? () => router.push(`/requests/new?type=SEAT&routeId=${encodeURIComponent(route.id)}&date=${encodeURIComponent(date)}`) : undefined} />
        ) : (
          visibleTrips.map((trip) => <TripCard key={trip.id} trip={trip} lang={lang} onBook={openSeatSheet} />)
        )}
      </section>
      <BottomSheet open={selectedTrip !== null} onClose={() => setSelectedTrip(null)} title={copy(lang, 'Select your seat', 'अपनी सीट चुनें')}>
        {selectedTrip ? (
          <div className="space-y-4">
            <SeatOption
              label={tx('tripsFront', lang)}
              fare={selectedTrip.frontFarePaise}
              seats={selectedTrip.frontSeatsLeft}
              selected={selectedSeatType === 'FRONT'}
              onSelect={() => setSelectedSeatType('FRONT')}
              lang={lang}
            />
            <SeatOption
              label={tx('tripsBack', lang)}
              fare={selectedTrip.backFarePaise}
              seats={selectedTrip.backSeatsLeft}
              selected={selectedSeatType === 'BACK'}
              onSelect={() => setSelectedSeatType('BACK')}
              lang={lang}
            />
            <p className="rounded-xl bg-[var(--surface-raised)] p-3 text-small text-[var(--text-secondary)]">
              {copy(lang, 'Luggage', 'सामान')}: {selectedTrip.luggagePolicy}
            </p>
            <Button fullWidth disabled={!selectedTrip.id} onClick={() => router.push(`/trips/${selectedTrip.id}/book?seatType=${selectedSeatType}`)}>
              {copy(lang, 'Continue', 'जारी रखें')} →
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </main>
  );
}

function SeatOption({ label, fare, seats, selected, onSelect, lang }: { label: string; fare: number; seats: number; selected: boolean; onSelect: () => void; lang: 'en' | 'hi' }) {
  return (
    <button type="button" disabled={seats <= 0} onClick={onSelect} className={['flex w-full items-center gap-4 rounded-xl border p-4 text-left disabled:opacity-50', selected ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface)]'].join(' ')}>
      <span className="text-title">{selected ? '●' : '○'}</span>
      <span>
        <span className="block font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-small text-[var(--text-secondary)]">
          ₹{(fare / 100).toLocaleString('en-IN')} · {seats} {copy(lang, 'available', 'उपलब्ध')}
        </span>
      </span>
    </button>
  );
}

function EmptyTrips({ route, date, lang, onSearchAnother, onRequest }: { route: RouteOption | null; date: string; lang: 'en' | 'hi'; onSearchAnother: () => void; onRequest?: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-card">
      <svg viewBox="0 0 220 110" className="mx-auto h-28 w-56" aria-hidden="true">
        <path d="M14 79L70 26L103 64L137 18L204 79H14Z" fill="var(--teal-50)" />
        <path d="M0 110C55 82 112 81 220 100V110H0Z" fill="var(--stone-100)" />
        <path d="M74 108C87 88 101 76 117 70C127 82 139 96 145 108H74Z" fill="var(--stone-300)" />
      </svg>
      <h2 className="font-display text-heading text-[var(--text-primary)]">{tx('tripsNoResults', lang)}</h2>
      <p className="mt-1 text-small text-[var(--text-secondary)]">
        {route
          ? copy(lang, `No trips are available for ${route.from} to ${route.to} on ${formatDate(date, lang)}.`, `${formatDate(date, lang)} को ${route.from} से ${route.to} के लिए कोई यात्रा उपलब्ध नहीं है।`)
          : copy(lang, 'No route was returned by the backend for this search.', 'इस खोज के लिए बैकेंड से कोई मार्ग नहीं मिला।')}
      </p>
      <div className="mt-5 grid gap-3">
        {onRequest ? <Button onClick={onRequest}>{copy(lang, 'Request this route', 'इस रूट की रिक्वेस्ट करें')}</Button> : null}
        <Button variant="secondary" onClick={onSearchAnother}>
          {copy(lang, 'Search another date', 'दूसरी तारीख खोजें')}
        </Button>
      </div>
    </div>
  );
}

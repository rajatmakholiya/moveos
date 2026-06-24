'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useFeatureFlags } from '../lib/useFeatureFlags';
import { tx } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';
import { parseBookings, parseRoutes, type Booking, type RouteOption } from '../lib/pahadi';
import { addDays, copy, formatDate, toIsoDate } from '../lib/utils';
import { BookingCard } from '../components/BookingCard';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { LanguageToggle } from '../components/ui/LanguageToggle';
import { Pill } from '../components/ui/Pill';

async function loadRouteOptions() {
  const response = await api.get<unknown>('/routes');
  return parseRoutes(response);
}

export default function HomePage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token } = useAuth();
  const { flags } = useFeatureFlags();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeError, setRouteError] = useState('');
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [selectedDate, setSelectedDate] = useState(toIsoDate(new Date()));
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const {
    data: cachedRoutes,
    error: routesError,
    isLoading: loadingRoutes,
    mutate: retryRoutes,
  } = useSWR<RouteOption[]>('routes', loadRouteOptions, {
    dedupingInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
  });

  const selectedDateObject = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);

  useEffect(() => {
    const nextRoutes = cachedRoutes ?? [];
    setRoutes(nextRoutes);
    setSelectedRoute((current) => nextRoutes.find((route) => route.id === current?.id) ?? nextRoutes[0] ?? null);
  }, [cachedRoutes]);

  useEffect(() => {
    setRouteError(routesError ? copy(lang, 'Unable to load routes. Please retry.', 'मार्ग लोड नहीं हो सके। फिर कोशिश करें।') : '');
  }, [lang, routesError]);

  useEffect(() => {
    if (user?.role === 'DRIVER') {
      router.replace('/driver');
      return;
    }

    if (!user || !token) {
      return;
    }

    let active = true;
    async function loadRecentBooking() {
      try {
        const response = await api.get<unknown>('/passenger/bookings', token ?? undefined);
        const all = parseBookings(response);
        if (active) {
          setRecentBookings(all.slice(0, 5));
        }
      } catch {
        if (active) {
          setRecentBookings([]);
        }
      }
    }

    void loadRecentBooking();
    return () => {
      active = false;
    };
  }, [router, token, user]);

  const searchTrips = () => {
    if (!selectedRoute) {
      setRouteError(copy(lang, 'No routes are available yet.', 'अभी कोई मार्ग उपलब्ध नहीं है।'));
      return;
    }
    router.push(`/trips?routeId=${encodeURIComponent(selectedRoute.id)}&date=${encodeURIComponent(selectedDate)}`);
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <header className="rounded-b-[2rem] bg-[var(--brand)] px-5 pb-7 pt-5 text-white">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-heading">⌂ {tx('appName', lang)}</h1>
          <LanguageToggle />
        </div>
        <p className="mt-8 font-display text-display">{tx('homeSearchTitle', lang)}</p>
      </header>
      {flags.enableLocationNudge && <LocationNudge lang={lang} />}
      <section className="-mt-5 px-5">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          {routeError ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--amber-50)] px-3 py-2 text-small text-[var(--stone-800)]">
              <span>{routeError}</span>
              <button type="button" className="font-medium text-[var(--brand)]" onClick={() => void retryRoutes()}>
                {copy(lang, 'Retry', 'फिर कोशिश')}
              </button>
            </div>
          ) : null}
          <SearchField label={tx('homeFrom', lang)} value={selectedRoute?.from ?? copy(lang, 'No routes available', 'कोई मार्ग उपलब्ध नहीं')} onClick={() => setRouteSheetOpen(true)} />
          <SearchField label={tx('homeTo', lang)} value={selectedRoute?.to ?? copy(lang, 'No routes available', 'कोई मार्ग उपलब्ध नहीं')} onClick={() => setRouteSheetOpen(true)} />
          <SearchField label={tx('homeDate', lang)} value={formatDate(selectedDateObject, lang)} onClick={() => setDateSheetOpen(true)} />
          <Button className="mt-4" fullWidth loading={loadingRoutes} disabled={!selectedRoute || loadingRoutes} onClick={searchTrips}>
            {tx('homeSearchBtn', lang)}
          </Button>
        </div>
      </section>
      <section className="mt-7 px-5">
        <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'What do you need?', 'आपको क्या चाहिए?')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <CustomerModeCard title={copy(lang, 'Single seat', 'एक सीट')} detail={copy(lang, 'Book pickup-wise seats', 'पिकअप के हिसाब से सीट')} active disabled={!selectedRoute} onClick={searchTrips} />
          <CustomerModeCard title={copy(lang, 'Full vehicle', 'पूरा वाहन')} detail={copy(lang, 'Family or business trip', 'फैमिली या बिजनेस ट्रिप')} disabled={!selectedRoute} onClick={() => selectedRoute ? router.push(`/requests/new?type=FULL_VEHICLE&routeId=${selectedRoute.id}&date=${selectedDate}`) : undefined} />
          <CustomerModeCard title={copy(lang, 'Parcel', 'पार्सल')} detail={copy(lang, 'Request a quote', 'कोटेशन लें')} disabled={!selectedRoute} onClick={() => selectedRoute ? router.push(`/requests/new?type=PARCEL&routeId=${selectedRoute.id}&date=${selectedDate}`) : undefined} />
        </div>
      </section>
      {flags.enableWalletPrompt && <WalletPromoBanner lang={lang} />}
      <section className="mt-7 px-5">
        <h2 className="font-display text-heading text-[var(--text-primary)]">{tx('homePopularRoutes', lang)}</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {routes.length === 0 && !loadingRoutes ? (
            <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-small text-[var(--text-secondary)]">
              {copy(lang, 'No routes are available yet.', 'अभी कोई मार्ग उपलब्ध नहीं है।')}
            </p>
          ) : routes.slice(0, 5).map((route) => (
            <button
              key={route.id}
              type="button"
              onClick={() => {
                setSelectedRoute(route);
                router.push(`/trips?routeId=${encodeURIComponent(route.id)}&date=${encodeURIComponent(selectedDate)}`);
              }}
              className="shrink-0 rounded-full bg-[var(--brand-light)] px-4 py-2 text-small font-medium text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            >
              {route.from} → {route.to}
            </button>
          ))}
        </div>
      </section>
      {recentBookings.length > 0 ? (
        <section className="mt-7">
          {/* Active trip banner — shown above the carousel when a trip is in progress */}
          {recentBookings.some((b) => b.tripStatus === 'DEPARTED' && b.status !== 'CANCELLED' && b.status !== 'COMPLETED') ? (
            <div className="mx-5 mb-3 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
                </span>
                <div>
                  <p className="text-small font-semibold text-amber-900">{copy(lang, 'Trip in progress', 'यात्रा जारी है')}</p>
                  <p className="text-xs text-amber-700">{copy(lang, 'Your driver is on the way', 'आपका ड्राइवर रास्ते में है')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const active = recentBookings.find((b) => b.tripStatus === 'DEPARTED' && b.status !== 'CANCELLED' && b.status !== 'COMPLETED');
                  if (active) router.push(`/track/${active.id}`);
                }}
                className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-small font-medium text-white"
              >
                {copy(lang, 'Track →', 'ट्रैक →')}
              </button>
            </div>
          ) : null}

          {/* Recent bookings carousel */}
          <div className="flex items-center justify-between px-5">
            <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Recent bookings', 'हाल की बुकिंग')}</h2>
            <button type="button" onClick={() => router.push('/bookings')} className="text-small font-medium text-[var(--brand)]">
              {copy(lang, 'See all →', 'सभी देखें →')}
            </button>
          </div>
          <div className="-mx-0 mt-3 flex gap-3 overflow-x-auto px-5 pb-2" style={{ scrollSnapType: 'x mandatory' }}>
            {recentBookings.map((booking) => {
              const isOngoing = booking.tripStatus === 'DEPARTED' && booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED';
              return (
                <div
                  key={booking.id}
                  className="w-[82vw] max-w-[320px] shrink-0"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {isOngoing && (
                    <div className="mb-1.5 flex items-center gap-1.5 rounded-t-xl border border-b-0 border-amber-200 bg-amber-50 px-3 py-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      <span className="text-xs font-medium text-amber-700">{copy(lang, 'In progress', 'जारी')}</span>
                    </div>
                  )}
                  <BookingCard
                    booking={booking}
                    lang={lang}
                    onView={(b) => router.push(isOngoing ? `/track/${b.id}` : `/bookings/${b.id}/confirm`)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <BottomSheet open={routeSheetOpen} onClose={() => setRouteSheetOpen(false)} title={copy(lang, 'Select route', 'मार्ग चुनें')}>
        <div className="space-y-3">
          {routes.length === 0 ? (
            <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
              {copy(lang, 'No routes are available from the backend.', 'बैकेंड से कोई मार्ग उपलब्ध नहीं है।')}
            </p>
          ) : routes.map((route) => (
            <button
              key={route.id}
              type="button"
              onClick={() => {
                setSelectedRoute(route);
                setRouteSheetOpen(false);
              }}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            >
              <span>
                <span className="block font-medium text-[var(--text-primary)]">
                  {route.from} → {route.to}
                </span>
                <span className="text-small text-[var(--text-secondary)]">
                  {route.durationHours} hrs · ~{route.distanceKm} km
                </span>
              </span>
              {route.id === selectedRoute?.id ? <Pill color="teal" label={copy(lang, 'Selected', 'चयनित')} /> : null}
            </button>
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={dateSheetOpen} onClose={() => setDateSheetOpen(false)} title={copy(lang, 'Travel date', 'यात्रा की तारीख')}>
        <DatePicker
          lang={lang}
          selectedDate={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            setDateSheetOpen(false);
          }}
        />
      </BottomSheet>
    </main>
  );
}

function SearchField({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 flex min-h-[52px] w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
      <span>
        <span className="block text-micro uppercase text-[var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--text-primary)]">{value}</span>
      </span>
      <span className="text-[var(--text-secondary)]">⌄</span>
    </button>
  );
}

function CustomerModeCard({ title, detail, active = false, disabled = false, onClick }: { title: string; detail: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={['min-h-[116px] rounded-2xl border p-3 text-left shadow-card disabled:opacity-50', active ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface)]'].join(' ')}>
      <span className="block font-display text-body text-[var(--text-primary)]">{title}</span>
      <span className="mt-2 block text-small leading-snug text-[var(--text-secondary)]">{detail}</span>
    </button>
  );
}

function LocationNudge({ lang }: { lang: 'en' | 'hi' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const handleAllow = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => setDismissed(true), () => setDismissed(true));
    } else {
      setDismissed(true);
    }
  };
  return (
    <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--brand-light)] px-4 py-3">
      <span className="text-small text-[var(--brand)]">
        {copy(lang, 'Enable location for better pickup suggestions', 'बेहतर पिकअप सुझावों के लिए स्थान सक्षम करें')}
      </span>
      <div className="flex shrink-0 gap-3">
        <button type="button" onClick={handleAllow} className="text-xs font-semibold text-[var(--brand)]">
          {copy(lang, 'Allow', 'अनुमति')}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-xs text-[var(--text-secondary)]">✕</button>
      </div>
    </div>
  );
}

function WalletPromoBanner({ lang }: { lang: 'en' | 'hi' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="mx-5 mt-7 flex items-center justify-between gap-3 rounded-2xl border border-[var(--brand)] bg-[var(--brand-light)] px-4 py-3">
      <div>
        <span className="block font-medium text-[var(--brand)]">
          {copy(lang, '5% cashback on wallet reloads', 'वॉलेट रिलोड पर 5% कैशबैक')}
        </span>
        <span className="text-small text-[var(--brand)]">
          {copy(lang, 'Limited time offer — reload now', 'सीमित समय का ऑफर — अभी रिलोड करें')}
        </span>
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 text-[var(--text-secondary)]">✕</button>
    </div>
  );
}

function DatePicker({ lang, selectedDate, onSelect }: { lang: 'en' | 'hi'; selectedDate: string; onSelect: (date: string) => void }) {
  const today = new Date();
  const days = Array.from({ length: 31 }, (_, index) => addDays(today, index));
  const quick = [
    { label: tx('homeToday', lang), date: today },
    { label: tx('homeTomorrow', lang), date: addDays(today, 1) },
    { label: copy(lang, 'This weekend', 'इस सप्ताहांत'), date: addDays(today, Math.max(1, 6 - today.getDay())) },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {quick.map((item) => (
          <button key={item.label} type="button" onClick={() => onSelect(toIsoDate(item.date))} className="rounded-full bg-[var(--brand-light)] px-3 py-2 text-small font-medium text-[var(--brand)]">
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((date) => {
          const iso = toIsoDate(date);
          const selected = iso === selectedDate;
          return (
            <button key={iso} type="button" onClick={() => onSelect(iso)} className={['flex aspect-square flex-col items-center justify-center rounded-full text-small transition-colors', selected ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-primary)]'].join(' ')}>
              <span>{new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'narrow' }).format(date)}</span>
              <span className="font-medium">{date.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

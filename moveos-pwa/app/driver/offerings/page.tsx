'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { useLanguage } from '../../../lib/LanguageContext';
import { parseTrips, type Trip } from '../../../lib/pahadi';
import { copy, formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { LanguageToggle } from '../../../components/ui/LanguageToggle';
import { Pill } from '../../../components/ui/Pill';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';

type OfferingTab = 'SEATS' | 'FULL' | 'PARCEL' | 'CLUSTER';
type SeatRequest = {
  id: string;
  from: string;
  to: string;
  passengerName: string;
  seats: number;
  requestedFor: string;
  distanceKm?: number;
  pickup?: { label?: string; address?: string };
  dropoff?: { label?: string; address?: string };
};
type TransportRequest = SeatRequest & {
  status?: string;
  budgetPaise?: number;
};

export default function DriverOfferingsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [tab, setTab] = useState<OfferingTab>('SEATS');
  const [seatRequests, setSeatRequests] = useState<SeatRequest[]>([]);
  const [fullVehicleRequests, setFullVehicleRequests] = useState<TransportRequest[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locating, setLocating] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (user && user.role !== 'DRIVER') {
      router.replace('/');
    }
  }, [isReady, router, user]);

  const groups = useMemo(() => {
    return trips.reduce<Record<string, Trip[]>>((acc, trip) => {
      const key = `${trip.from} → ${trip.to}`;
      acc[key] = [...(acc[key] ?? []), trip];
      return acc;
    }, {});
  }, [trips]);

  const loadSeatRequests = (location?: { lat: number; lng: number }) => {
    const suffix = location ? `&lat=${location.lat}&lng=${location.lng}` : '';
    api.get<{ data?: { requests?: SeatRequest[] }; requests?: SeatRequest[] }>(`/driver/requests?type=SEAT${suffix}`, token ?? undefined)
      .then((payload) => setSeatRequests(readRequests(payload)))
      .catch(() => setSeatRequests([]));
  };

  const loadFullVehicleRequests = () => {
    api.get<{ data?: { requests?: TransportRequest[] }; requests?: TransportRequest[] }>('/driver/requests?type=FULL_VEHICLE', token ?? undefined)
      .then((payload) => setFullVehicleRequests(readRequests(payload)))
      .catch(() => setFullVehicleRequests([]));
  };

  useEffect(() => {
    if (user?.role === 'DRIVER' && token) {
      loadSeatRequests();
      loadFullVehicleRequests();
      api.get<unknown>('/driver/trips?scope=future', token)
        .then((payload) => setTrips(parseTrips(payload)))
        .catch(() => setTrips([]));
    }
  }, [token, user?.role]);

  const sortByCurrentLocation = () => {
    if (!navigator.geolocation) {
      loadSeatRequests();
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadSeatRequests({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        loadSeatRequests();
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const acceptSeatRequest = async (requestId: string) => {
    setAcceptError('');
    try {
      await api.post(`/driver/requests/${encodeURIComponent(requestId)}/accept`, {}, token ?? undefined);
      setSeatRequests((current) => current.filter((request) => request.id !== requestId));
    } catch (err: unknown) {
      const msg = (err as Record<string, unknown>)?.message;
      setAcceptError(typeof msg === 'string' ? msg : copy(lang, 'Could not accept request. Please try again.', 'रिक्वेस्ट स्वीकार नहीं हो सकी। फिर कोशिश करें।'));
    }
  };

  const acceptFullVehicleRequest = async (requestId: string) => {
    setAcceptError('');
    try {
      await api.post(`/driver/requests/${encodeURIComponent(requestId)}/accept`, {}, token ?? undefined);
      setFullVehicleRequests((current) => current.filter((request) => request.id !== requestId));
    } catch (err: unknown) {
      const msg = (err as Record<string, unknown>)?.message;
      setAcceptError(typeof msg === 'string' ? msg : copy(lang, 'Could not accept request. Please try again.', 'रिक्वेस्ट स्वीकार नहीं हो सकी। फिर कोशिश करें।'));
    }
  };

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
          <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Offerings', 'ऑफरिंग')}</h1>
          <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Pick the work type you want to accept', 'किस तरह का काम लेना है चुनें')}</p>
        </div>
        <LanguageToggle />
      </header>

      <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-card">
        <TabButton active={tab === 'SEATS'} label={copy(lang, 'Seats', 'सीट')} onClick={() => { setTab('SEATS'); setAcceptError(''); }} />
        <TabButton active={tab === 'FULL'} label={copy(lang, 'Vehicle', 'वाहन')} onClick={() => { setTab('FULL'); setAcceptError(''); }} />
        <TabButton active={tab === 'PARCEL'} label={copy(lang, 'Parcel', 'पार्सल')} onClick={() => { setTab('PARCEL'); setAcceptError(''); }} />
        <TabButton active={tab === 'CLUSTER'} label={copy(lang, 'Cluster', 'क्लस्टर')} onClick={() => { setTab('CLUSTER'); setAcceptError(''); }} />
      </div>

      {acceptError ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="mt-0.5 text-red-500">⚠</span>
          <div className="flex-1">
            <p className="text-small font-medium text-red-700">{acceptError}</p>
          </div>
          <button type="button" onClick={() => setAcceptError('')} className="text-red-400 hover:text-red-600" aria-label="Dismiss">✕</button>
        </div>
      ) : null}

      {tab === 'SEATS' ? (
        <section className="mt-5 space-y-4">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Nearby rider demand', 'नजदीकी राइडर डिमांड')}</h2>
                <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Accept individual seats to fill your car.', 'कार भरने के लिए अलग-अलग सीट स्वीकार करें।')}</p>
              </div>
              <Pill color="teal" label={`${seatRequests.length} ${copy(lang, 'open', 'खुली')}`} />
            </div>
            <Button className="mt-4" fullWidth variant="secondary" loading={locating} onClick={sortByCurrentLocation}>
              {copy(lang, 'Sort by my location', 'मेरी लोकेशन से sort करें')}
            </Button>
            <div className="mt-4 space-y-3">
              {seatRequests.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">{copy(lang, 'No open seat requests right now.', 'अभी कोई खुली सीट रिक्वेस्ट नहीं है।')}</p>
              ) : (
                seatRequests.map((request) => (
                  <div key={request.id} className="rounded-xl bg-[var(--surface-raised)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {request.from} → {request.to}
                        </p>
                        <p className="text-small text-[var(--text-secondary)]">
                          {formatTime(request.requestedFor, lang)} · {request.seats} {copy(lang, 'seat(s)', 'सीट')}
                        </p>
                      </div>
                      <Pill color="amber" label={request.distanceKm === undefined ? copy(lang, 'Near route', 'रूट पर') : `${request.distanceKm} km`} />
                    </div>
                    <p className="mt-3 text-small text-[var(--text-secondary)]">
                      {copy(lang, 'Pickup', 'पिकअप')}: {request.pickup?.label ?? request.pickup?.address ?? '-'}
                    </p>
                    <p className="text-small text-[var(--text-secondary)]">
                      {copy(lang, 'Drop', 'ड्रॉप')}: {request.dropoff?.label ?? request.dropoff?.address ?? '-'}
                    </p>
                    <Button className="mt-4" fullWidth onClick={() => void acceptSeatRequest(request.id)}>
                      {copy(lang, 'Accept and assign booking', 'स्वीकार करें और बुकिंग असाइन करें')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </article>
          {Object.keys(groups).length === 0 ? (
            <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-small text-[var(--text-secondary)] shadow-card">
              {copy(lang, 'No active seat offerings are available from the backend.', 'बैकेंड से कोई सक्रिय सीट ऑफरिंग उपलब्ध नहीं है।')}
            </p>
          ) : Object.entries(groups).map(([route, trips]) => (
            <article key={route} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-heading text-[var(--text-primary)]">{route}</h2>
                  <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Individual bookings by pickup spot', 'पिकअप स्पॉट के हिसाब से बुकिंग')}</p>
                </div>
                <Pill color="teal" label={`${trips.reduce((sum, trip) => sum + trip.frontSeatsLeft + trip.backSeatsLeft, 0)} ${copy(lang, 'open', 'खाली')}`} />
              </div>
              <div className="mt-4 space-y-3">
                {trips.map((trip) => (
                  <button key={trip.id} type="button" onClick={() => router.push(`/driver/trips/${trip.id}/manifest`)} className="w-full rounded-xl bg-[var(--surface-raised)] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-[var(--text-primary)]">
                        {formatDate(trip.departureAt, lang)} · {formatTime(trip.departureAt, lang)}
                      </span>
                      <span className="text-small text-[var(--text-secondary)]">{formatCurrency(Math.min(trip.frontFarePaise, trip.backFarePaise))}+</span>
                    </div>
                    <p className="mt-1 text-small text-[var(--text-secondary)]">
                      {trip.pickupPoint} · {trip.frontSeatsLeft + trip.backSeatsLeft} {copy(lang, 'seats available', 'सीट उपलब्ध')}
                    </p>
                  </button>
                ))}
              </div>
            </article>
          ))}
          <Button fullWidth variant="secondary" onClick={() => router.push('/driver/post-trip')}>
            {copy(lang, 'Post a seat offering', 'सीट ऑफरिंग पोस्ट करें')}
          </Button>
        </section>
      ) : null}

      {tab === 'FULL' ? (
        <section className="mt-5 space-y-4">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Complete vehicle requests', 'पूरे वाहन की रिक्वेस्ट')}</h2>
                <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Accept before another driver takes it.', 'दूसरे ड्राइवर से पहले स्वीकार करें।')}</p>
              </div>
              <Pill color="teal" label={`${fullVehicleRequests.length} ${copy(lang, 'open', 'खुली')}`} />
            </div>
            <div className="mt-4 space-y-3">
              {fullVehicleRequests.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">{copy(lang, 'No full vehicle requests right now.', 'अभी कोई पूरी वाहन रिक्वेस्ट नहीं है।')}</p>
              ) : fullVehicleRequests.map((request) => (
                <div key={request.id} className="rounded-xl bg-[var(--surface-raised)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{request.from} → {request.to}</p>
                      <p className="text-small text-[var(--text-secondary)]">{formatDate(request.requestedFor, lang)} · {formatTime(request.requestedFor, lang)}</p>
                    </div>
                    <Pill color="amber" label={copy(lang, 'Open', 'खुली')} />
                  </div>
                  <p className="mt-3 text-small text-[var(--text-secondary)]">{copy(lang, 'Passengers', 'यात्री')}: {request.seats}</p>
                  <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Expected budget', 'बजट')}: {formatCurrency(request.budgetPaise ?? 0)}</p>
                  <Button className="mt-4" fullWidth onClick={() => void acceptFullVehicleRequest(request.id)}>
                    {copy(lang, 'Accept full vehicle request', 'पूरी वाहन रिक्वेस्ट स्वीकार करें')}
                  </Button>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
      {tab === 'PARCEL' ? <ActionPanel title={copy(lang, 'Parcel quotation requests', 'पार्सल कोटेशन रिक्वेस्ट')} body={copy(lang, 'Quote parcel carrying requests based on size, route, and timing.', 'साइज, रूट और समय के हिसाब से पार्सल कोट करें।')} action={copy(lang, 'View parcels', 'पार्सल देखें')} onClick={() => router.push('/driver/parcels')} /> : null}
      {tab === 'CLUSTER' ? <LockedCluster lang={lang} /> : null}
    </main>
  );
}

function readRequests<T>(payload: { data?: { requests?: T[] }; requests?: T[] }) {
  if (Array.isArray(payload.data?.requests)) return payload.data.requests;
  if (Array.isArray(payload.requests)) return payload.requests;
  return [];
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={['min-h-11 rounded-xl px-2 text-small font-medium', active ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)]'].join(' ')}>
      {label}
    </button>
  );
}

function ActionPanel({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <h2 className="font-display text-heading text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 text-small text-[var(--text-secondary)]">{body}</p>
      <Button className="mt-5" fullWidth onClick={onClick}>
        {action}
      </Button>
    </section>
  );
}

function LockedCluster({ lang }: { lang: 'en' | 'hi' }) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Clustered bookings', 'क्लस्टर्ड बुकिंग')}</h2>
          <p className="mt-2 text-small text-[var(--text-secondary)]">{copy(lang, 'System-generated route clusters that combine nearby pickup demand.', 'नजदीकी पिकअप डिमांड को जोड़ने वाले सिस्टम जनरेटेड क्लस्टर।')}</p>
        </div>
        <Pill color="amber" label={copy(lang, 'Locked', 'लॉक')} />
      </div>
      <Button className="mt-5" fullWidth disabled>
        {copy(lang, 'Premium upgrade required', 'प्रीमियम अपग्रेड चाहिए')}
      </Button>
    </section>
  );
}

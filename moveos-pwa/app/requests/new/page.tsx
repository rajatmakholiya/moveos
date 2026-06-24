'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useLanguage } from '../../../lib/LanguageContext';
import { parseRoutes, type RouteOption } from '../../../lib/pahadi';
import { copy, formatDate, toIsoDate } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

type RequestType = 'SEAT' | 'FULL_VEHICLE' | 'PARCEL';

type PlaceResult = { id: string; label: string; address: string; lat: number; lng: number };
type Coordinate = { lat: number; lng: number };

function NewRequestFallback() {
  return <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-5" />;
}

export default function NewRequestPage() {
  return (
    <Suspense fallback={<NewRequestFallback />}>
      <NewRequestContent />
    </Suspense>
  );
}

function NewRequestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const type = useMemo<RequestType>(() => {
    const raw = searchParams.get('type');
    return raw === 'FULL_VEHICLE' || raw === 'PARCEL' ? raw : 'SEAT';
  }, [searchParams]);
  const routeId = searchParams.get('routeId') ?? '';
  const [form, setForm] = useState({
    route: null as RouteOption | null,
    pickupQuery: '',
    pickupPlaceId: '',
    pickupLat: undefined as number | undefined,
    pickupLng: undefined as number | undefined,
    dropoffQuery: '',
    dropoffPlaceId: '',
    dropoffLat: undefined as number | undefined,
    dropoffLng: undefined as number | undefined,
    name: '',
    phone: '',
    date: searchParams.get('date') ?? toIsoDate(new Date()),
    seats: type === 'FULL_VEHICLE' ? 4 : 1,
    parcelDetails: '',
  });
  const [pickupOptions, setPickupOptions] = useState<PlaceResult[]>([]);
  const [dropoffOptions, setDropoffOptions] = useState<PlaceResult[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const pickupSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropoffSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRequestIdRef = useRef({ pickup: 0, dropoff: 0 });

  useEffect(() => {
    let active = true;
    async function loadRoute() {
      try {
        const response = await api.get<unknown>('/routes');
        const routes = parseRoutes(response);
        const route = routes.find((item) => item.id === routeId) ?? null;
        if (active) {
          setForm((current) => ({ ...current, route }));
        }
      } catch {
        if (active) {
          setForm((current) => ({ ...current, route: null }));
        }
      }
    }
    void loadRoute();
    return () => {
      active = false;
    };
  }, [routeId]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => { /* permission denied or unavailable; route context still works */ },
      { maximumAge: 60_000, timeout: 5_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(pickupSearchDebounceRef.current);
      clearTimeout(dropoffSearchDebounceRef.current);
    };
  }, []);

  const searchPlaces = async (kind: 'pickup' | 'dropoff', query: string) => {
    const requestId = searchRequestIdRef.current[kind] + 1;
    searchRequestIdRef.current[kind] = requestId;

    if (!form.route || query.trim().length < 2) {
      kind === 'pickup' ? setPickupOptions([]) : setDropoffOptions([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        q: query,
        routeId: form.route.id,
        intent: kind,
        searchRadiusKm: '180',
      });
      if (currentLocation) {
        params.set('currentLat', String(currentLocation.lat));
        params.set('currentLng', String(currentLocation.lng));
      }
      if (form.pickupLat !== undefined && form.pickupLng !== undefined) {
        params.set('originLat', String(form.pickupLat));
        params.set('originLng', String(form.pickupLng));
      }
      if (form.dropoffLat !== undefined && form.dropoffLng !== undefined) {
        params.set('destinationLat', String(form.dropoffLat));
        params.set('destinationLng', String(form.dropoffLng));
      }

      const response = await api.get<{ data?: { places?: PlaceResult[] } }>(`/geo/search?${params.toString()}`);
      if (searchRequestIdRef.current[kind] !== requestId) return;
      kind === 'pickup'
        ? setPickupOptions(response.data?.places ?? [])
        : setDropoffOptions(response.data?.places ?? []);
    } catch {
      if (searchRequestIdRef.current[kind] !== requestId) return;
      kind === 'pickup' ? setPickupOptions([]) : setDropoffOptions([]);
    }
  };

  const queuePlaceSearch = (kind: 'pickup' | 'dropoff', query: string) => {
    const ref = kind === 'pickup' ? pickupSearchDebounceRef : dropoffSearchDebounceRef;
    clearTimeout(ref.current);
    ref.current = setTimeout(() => {
      void searchPlaces(kind, query);
    }, 350);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      setCurrentLocation({ lat: latitude, lng: longitude });
      try {
        const response = await api.get<{ data?: { place?: PlaceResult } }>(
          `/geo/reverse?lat=${latitude}&lng=${longitude}`,
        );
        const place = response.data?.place;
        if (!place) return;
        setForm((current) => ({
          ...current,
          pickupQuery: place.label,
          pickupPlaceId: place.id,
          pickupLat: place.lat,
          pickupLng: place.lng,
        }));
        setPickupOptions([]);
      } catch {
        // silently ignore — user can type manually
      }
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!form.route) {
      setError(copy(lang, 'Route is not available. Please search again.', 'मार्ग उपलब्ध नहीं है। फिर खोजें।'));
      return;
    }

    if (!form.pickupQuery.trim() || !form.dropoffQuery.trim() || !form.name.trim() || form.phone.replace(/\D/g, '').length !== 10) {
      setError(copy(lang, 'Pickup, drop, name, and 10-digit phone are required.', 'पिकअप, ड्रॉप, नाम और 10 अंकों का फोन जरूरी है।'));
      return;
    }

    setSubmitting(true);
    try {
      const requestedFor = new Date(`${form.date}T09:00:00`).toISOString();
      await api.post('/requests', {
        type,
        routeId: form.route.id,
        from: form.route.from,
        to: form.route.to,
        pickup: {
          label: form.pickupQuery,
          address: form.pickupQuery,
          city: form.route.from,
          lat: form.pickupLat,
          lng: form.pickupLng,
        },
        dropoff: {
          label: form.dropoffQuery,
          address: form.dropoffQuery,
          city: form.route.to,
          lat: form.dropoffLat,
          lng: form.dropoffLng,
        },
        requestedFor,
        passengerName: form.name.trim(),
        passengerPhone: `+91${form.phone.replace(/\D/g, '').slice(-10)}`,
        seats: type === 'PARCEL' ? 0 : form.seats,
        parcelDetails: type === 'PARCEL' ? form.parcelDetails : undefined,
      });
      router.replace('/bookings');
    } catch {
      setError(copy(lang, 'Could not create request. Please try again.', 'रिक्वेस्ट नहीं बन सकी। फिर कोशिश करें।'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <button type="button" onClick={() => router.back()} className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
        ←
      </button>
      <h1 className="font-display text-title text-[var(--text-primary)]">{titleFor(type, lang)}</h1>
      <p className="mt-1 text-small text-[var(--text-secondary)]">
        {form.route ? `${form.route.from} → ${form.route.to}` : copy(lang, 'Route unavailable', 'मार्ग उपलब्ध नहीं')} · {formatDate(form.date, lang)}
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <Input
            label={copy(lang, 'Exact pickup point', 'सटीक पिकअप पॉइंट')}
            value={form.pickupQuery}
            autoComplete="off"
            suffix={
              <button
                type="button"
                className="text-small font-medium text-[var(--brand)]"
                onClick={() => void useCurrentLocation()}
                aria-label={copy(lang, 'Use my location', 'मेरी लोकेशन')}
              >
                GPS
              </button>
            }
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => ({ ...current, pickupQuery: value, pickupPlaceId: '', pickupLat: undefined, pickupLng: undefined }));
              queuePlaceSearch('pickup', value);
            }}
          />
          <PlaceOptions
            options={pickupOptions}
            onSelect={(place) => {
              setForm((current) => ({ ...current, pickupQuery: place.label, pickupPlaceId: place.id, pickupLat: place.lat, pickupLng: place.lng }));
              setPickupOptions([]);
            }}
          />
        </div>
        <div>
          <Input
            label={copy(lang, 'Exact drop point', 'सटीक ड्रॉप पॉइंट')}
            value={form.dropoffQuery}
            autoComplete="off"
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => ({ ...current, dropoffQuery: value, dropoffPlaceId: '', dropoffLat: undefined, dropoffLng: undefined }));
              queuePlaceSearch('dropoff', value);
            }}
          />
          <PlaceOptions
            options={dropoffOptions}
            onSelect={(place) => {
              setForm((current) => ({ ...current, dropoffQuery: place.label, dropoffPlaceId: place.id, dropoffLat: place.lat, dropoffLng: place.lng }));
              setDropoffOptions([]);
            }}
          />
        </div>
        <Input label={copy(lang, 'Your name', 'आपका नाम')} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        <Input label={copy(lang, 'Phone number', 'फोन नंबर')} inputMode="numeric" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
        {type !== 'PARCEL' ? <Input label={copy(lang, 'Seats needed', 'कितनी सीटें')} inputMode="numeric" value={String(form.seats)} onChange={(event) => setForm((current) => ({ ...current, seats: Number(event.target.value) || 1 }))} /> : null}
        {type === 'PARCEL' ? <Input label={copy(lang, 'Parcel details', 'पार्सल विवरण')} value={form.parcelDetails} onChange={(event) => setForm((current) => ({ ...current, parcelDetails: event.target.value }))} /> : null}
        {error ? <p className="text-small font-medium text-[var(--red-600)]">{error}</p> : null}
        <Button type="submit" fullWidth loading={submitting} disabled={!form.route || submitting}>
          {copy(lang, 'Create request', 'रिक्वेस्ट बनाएं')}
        </Button>
      </form>
    </main>
  );
}

function PlaceOptions({ options, onSelect }: { options: PlaceResult[]; onSelect: (place: PlaceResult) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {options.map((place) => (
        <button key={place.id} type="button" className="block w-full border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0" onClick={() => onSelect(place)}>
          <span className="block text-small font-medium text-[var(--text-primary)]">{place.label}</span>
          <span className="text-small text-[var(--text-secondary)]">{place.address}</span>
        </button>
      ))}
    </div>
  );
}

function titleFor(type: RequestType, lang: 'en' | 'hi') {
  if (type === 'FULL_VEHICLE') {
    return copy(lang, 'Request complete vehicle', 'पूरा वाहन रिक्वेस्ट करें');
  }
  if (type === 'PARCEL') {
    return copy(lang, 'Send parcel request', 'पार्सल रिक्वेस्ट भेजें');
  }
  return copy(lang, 'Request seat availability', 'सीट उपलब्धता रिक्वेस्ट करें');
}

'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/AuthContext';
import { useLanguage } from '../../../../../lib/LanguageContext';
import { parseTrip, type PaymentMethod, type SeatType, type Trip } from '../../../../../lib/pahadi';
import { copy, formatCurrency, formatPhone, formatTime, readArray, readNumber, readString, safeRecord } from '../../../../../lib/utils';
import { BottomSheet } from '../../../../../components/ui/BottomSheet';
import { Button } from '../../../../../components/ui/Button';
import { LanguageToggle } from '../../../../../components/ui/LanguageToggle';
import { Pill } from '../../../../../components/ui/Pill';
import { SkeletonCard } from '../../../../../components/ui/SkeletonCard';
import { DriverAuthLoading, DriverAuthRequired } from '../../../../../components/DriverAuthState';

type BookingStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

type Coordinate = { lat: number; lng: number };
type PickupLocation = Coordinate & { label: string; address: string };

type ManifestPassenger = {
  id: string;
  name: string;
  phone: string;
  pickup: PickupLocation | null;
  dropoff: PickupLocation | null;
  pickupPoint: string;
  seatType: SeatType;
  luggage: string;
  totalPaise: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'CASH_PENDING' | 'CANCELLED';
  bookingStatus: BookingStatus;
  arrivedAtPickupAt: string | null;
  pickedUpAt: string | null;
  arrivedAtDropoffAt: string | null;
  droppedOffAt: string | null;
};

type NavTarget = { passenger: ManifestPassenger; kind: 'pickup' | 'dropoff' };
type PendingAction = 'depart' | 'optimize' | NavTarget;

const LOCATION_PRESETS: { label: string; coord: Coordinate }[] = [
  { label: 'ISBT Dehradun', coord: { lat: 30.2891, lng: 77.9986 } },
  { label: 'Dehradun Centre', coord: { lat: 30.3165, lng: 78.0322 } },
  { label: 'Hyderabad', coord: { lat: 17.3850, lng: 78.4867 } },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function readLocation(value: unknown): PickupLocation | null {
  const record = safeRecord(value);
  if (!record) return null;
  const lat = readNumber(record, ['lat', 'latitude'], Number.NaN);
  const lng = readNumber(record, ['lng', 'lon', 'longitude'], Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = readString(record, ['label', 'name', 'address'], `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  return { lat, lng, label, address: readString(record, ['address', 'formattedAddress', 'description'], label) };
}

function parsePremiumPickupRouting(payload: unknown) {
  const record = safeRecord(safeRecord(payload)?.data ?? payload);
  return safeRecord(record?.premiumFeatures)?.pickupRouting === true;
}

function parsePassengers(payload: unknown): ManifestPassenger[] {
  const data = safeRecord(payload)?.data;
  const items = readArray(data ?? payload, ['passengers', 'bookings', 'data']);
  return items.flatMap((item) => {
    const id = readString(item, ['id', 'bookingId']);
    if (!id) return [];
    const rawSeat = readString(item, ['seatType'], 'BACK');
    const payment = readString(item, ['paymentMethod'], 'CASH');
    const bookingStatus = readString(item, ['status', 'bookingStatus'], 'CONFIRMED') as BookingStatus;
    const paymentStatus = readString(item, ['paymentStatus'], payment === 'UPI' ? 'PAID' : 'CASH_PENDING');
    return [{
      id,
      name: readString(item, ['passengerName', 'name']),
      phone: readString(item, ['phone', 'contactNumber', 'passengerPhone']),
      pickup: readLocation(safeRecord(item)?.pickup),
      dropoff: readLocation(safeRecord(item)?.dropoff),
      pickupPoint: readString(item, ['pickupPoint', 'pickupLabel'], readString(safeRecord(item)?.pickup, ['label', 'address'])),
      seatType: rawSeat === 'FRONT' ? 'FRONT' : 'BACK',
      luggage: readString(item, ['luggageSize', 'luggage']),
      totalPaise: readNumber(item, ['totalPaise', 'amountPaise', 'farePaise'], 0),
      paymentMethod: payment === 'UPI' ? 'UPI' : 'CASH',
      paymentStatus: paymentStatus === 'CANCELLED' ? 'CANCELLED' : payment === 'UPI' || paymentStatus === 'PAID' ? 'PAID' : 'CASH_PENDING',
      bookingStatus,
      arrivedAtPickupAt: readString(item, ['arrivedAtPickupAt']) || null,
      pickedUpAt: readString(item, ['pickedUpAt']) || null,
      arrivedAtDropoffAt: readString(item, ['arrivedAtDropoffAt']) || null,
      droppedOffAt: readString(item, ['droppedOffAt']) || null,
    }];
  });
}

function distanceKm(a: Coordinate, b: Coordinate) {
  const toRad = (v: number) => v * Math.PI / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function etaLabel(km: number) {
  const m = Math.round((km / 40) * 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}min`;
}

function nearestPickupOrder(origin: Coordinate, passengers: ManifestPassenger[]) {
  const remaining = passengers.filter((p) => p.pickup);
  const order: string[] = [];
  let current = origin;
  while (remaining.length > 0) {
    remaining.sort((a, b) => distanceKm(current, a.pickup!) - distanceKm(current, b.pickup!));
    const next = remaining.shift()!;
    order.push(next.id);
    current = next.pickup!;
  }
  return order;
}

function nearestDropoffOrder(origin: Coordinate, passengers: ManifestPassenger[]) {
  const remaining = passengers.filter((p) => p.dropoff);
  const order: string[] = [];
  let current = origin;
  while (remaining.length > 0) {
    remaining.sort((a, b) => distanceKm(current, a.dropoff!) - distanceKm(current, b.dropoff!));
    const next = remaining.shift()!;
    order.push(next.id);
    current = next.dropoff!;
  }
  return order;
}

function googleMapsEmbedUrl(dest: Coordinate, origin: Coordinate | null) {
  const p = new URLSearchParams({ output: 'embed', f: 'd', source: 's_d', daddr: `${dest.lat},${dest.lng}` });
  if (origin) p.set('saddr', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps?${p.toString()}`;
}

function googleMapsNativeUrl(dest: Coordinate, origin: Coordinate) {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&origin=${origin.lat},${origin.lng}&travelmode=driving`;
}

function getCurrentPosition(): Promise<Coordinate | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 },
    );
  });
}

function canDepart(trip: Trip) {
  return Math.abs(Date.now() - new Date(trip.departureAt).getTime()) <= 30 * 60 * 1000;
}

// How long the driver has been waiting in ms (0 if not arrived)
function waitedMs(arrivedAtPickupAt: string | null) {
  if (!arrivedAtPickupAt) return 0;
  return Date.now() - new Date(arrivedAtPickupAt).getTime();
}

// ── main page ────────────────────────────────────────────────────────────────

export default function DriverManifestPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<ManifestPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [departing, setDeparting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [pickupRoutingEnabled, setPickupRoutingEnabled] = useState(false);
  const [pickupOrder, setPickupOrder] = useState<string[]>([]);
  const [dropoffOrder, setDropoffOrder] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);

  // Location & navigation
  const [driverLocation, setDriverLocation] = useState<Coordinate | null>(null);
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [navTarget, setNavTarget] = useState<NavTarget | null>(null);

  // Drop-off flow per passenger
  const [arrivingDropoffId, setArrivingDropoffId] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);

  // Pickup flow per passenger (local state overlay — confirmed by manifest refresh)
  const [arrivingId, setArrivingId] = useState<string | null>(null);
  const [otpRequestingId, setOtpRequestingId] = useState<string | null>(null);
  const [otpVerifyingId, setOtpVerifyingId] = useState<string | null>(null);
  const [devOtpMap, setDevOtpMap] = useState<Record<string, string>>({});
  const [otpInputMap, setOtpInputMap] = useState<Record<string, string>>({});

  // No-show flow
  const [noShowOpenId, setNoShowOpenId] = useState<string | null>(null);
  const [noShowReason, setNoShowReason] = useState('');
  const [noShowSubmitting, setNoShowSubmitting] = useState(false);
  const [noShowError, setNoShowError] = useState('');
  // Tick every second to update countdown timers
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Continuous GPS streaming while the trip is in progress
  const watchIdRef = useRef<number | null>(null);
  const lastLocationPostRef = useRef(0);

  useEffect(() => {
    if (!isReady) return;
    if (user && user.role !== 'DRIVER') router.replace('/');
  }, [isReady, router, user]);

  const loadManifest = useCallback(async () => {
    try {
      const response = await api.get<unknown>(`/driver/trips/${encodeURIComponent(params.tripId)}/manifest`, token ?? undefined);
      const record = safeRecord(response);
      setTrip(parseTrip(record?.trip ?? response));
      setPassengers(parsePassengers(response));
      setPickupRoutingEnabled(parsePremiumPickupRouting(response));
      setPickupOrder([]);
    } catch {
      setTrip(null);
      setPassengers([]);
      setPickupRoutingEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [params.tripId, token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadManifest().then(() => { if (!active) return; });
    return () => { active = false; };
  }, [loadManifest]);

  // Start tick timer while any passenger has arrivedAtPickupAt but not pickedUpAt
  useEffect(() => {
    const needsTick = passengers.some((p) => p.arrivedAtPickupAt && !p.pickedUpAt && p.bookingStatus === 'CONFIRMED');
    if (needsTick && !tickRef.current) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else if (!needsTick && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [passengers]);

  // Stream the driver's GPS to telemetry while the trip is DEPARTED so passengers
  // and fleet admins see the live vehicle position (Uber/Rapido style). Throttled
  // to limit network/battery; also feeds the local driverLocation for ETA & nav.
  useEffect(() => {
    if (trip?.status !== 'DEPARTED') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const THROTTLE_MS = 12_000;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        const now = Date.now();
        if (now - lastLocationPostRef.current < THROTTLE_MS) return;
        lastLocationPostRef.current = now;
        void api.post('/telemetry/location', loc, token ?? undefined);
      },
      () => { /* permission denied — driver can still set location manually */ },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [trip?.status, token]);

  const totalToCollect = useMemo(
    () => passengers.filter((p) => p.paymentStatus === 'CASH_PENDING' && p.bookingStatus === 'CONFIRMED').reduce((sum, p) => sum + p.totalPaise, 0),
    [passengers],
  );
  const routeablePassengers = useMemo(() => passengers.filter((p) => p.pickup), [passengers]);
  const confirmedPassengers = useMemo(() => passengers.filter((p) => p.bookingStatus === 'CONFIRMED'), [passengers]);
  // Drop-off begins once every onboard passenger has been picked up.
  const allPickedUp = useMemo(
    () => confirmedPassengers.length > 0 && confirmedPassengers.every((p) => p.pickedUpAt),
    [confirmedPassengers],
  );
  const droppablePassengers = useMemo(() => passengers.filter((p) => p.dropoff && p.pickedUpAt), [passengers]);

  const orderedPassengers = useMemo(() => {
    // During the drop phase order by the optimised drop sequence; otherwise pickup order.
    const order = allPickedUp && dropoffOrder.length > 0 ? dropoffOrder : pickupOrder;
    if (order.length === 0) return passengers;
    const byId = new Map(passengers.map((p) => [p.id, p]));
    const ordered = order.flatMap((id) => { const p = byId.get(id); if (!p) return []; byId.delete(id); return [p]; });
    return [...ordered, ...Array.from(byId.values())];
  }, [passengers, pickupOrder, dropoffOrder, allPickedUp]);

  const runOptimize = useCallback(async (origin: Coordinate) => {
    setOptimizing(true);
    setPickupOrder(nearestPickupOrder(origin, passengers));
    try {
      await api.post('/location/route-optimizer', {
        locations: [origin, ...routeablePassengers.map((p) => p.pickup)],
        source: 'first', destination: 'any', roundTrip: false,
        mode: 'driving', steps: false, overview: 'simplified', routePreference: 'fastest',
      }, token ?? undefined);
    } catch { /* Local order is still valid */ }
    finally { setOptimizing(false); }
  }, [passengers, routeablePassengers, token]);

  const handleLocationConfirmed = useCallback((loc: Coordinate) => {
    setDriverLocation(loc);
    setLocationPromptOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action === 'depart') { void departTripWithLocation(); }
    else if (action === 'optimize') { void runOptimize(loc); }
    else { setNavTarget(action); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, runOptimize]);

  const departTripWithLocation = async () => {
    if (!trip) return;
    setDeparting(true);
    const prev = trip;
    setTrip({ ...trip, status: 'DEPARTED' });
    try { await api.post(`/driver/trips/${encodeURIComponent(trip.id)}/depart`, {}, token ?? undefined); }
    catch { setTrip(prev); }
    finally { setDeparting(false); }
  };

  const handleDepartClick = () => {
    if (!driverLocation) { setPendingAction('depart'); setLocationPromptOpen(true); }
    else { void departTripWithLocation(); }
  };

  const handleOptimizeClick = () => {
    if (routeablePassengers.length < 2) return;
    if (driverLocation) { void runOptimize(driverLocation); }
    else { setPendingAction('optimize'); setLocationPromptOpen(true); }
  };

  const handleNavigateClick = (passenger: ManifestPassenger, kind: 'pickup' | 'dropoff' = 'pickup') => {
    const coord = kind === 'pickup' ? passenger.pickup : passenger.dropoff;
    if (!coord) return;
    const target: NavTarget = { passenger, kind };
    if (driverLocation) { setNavTarget(target); }
    else { setPendingAction(target); setLocationPromptOpen(true); }
  };

  const handleDropOptimizeClick = () => {
    const origin = driverLocation;
    if (!origin) { setLocationPromptOpen(true); return; }
    setDropoffOrder(nearestDropoffOrder(origin, passengers.filter((p) => p.pickedUpAt && !p.droppedOffAt)));
  };

  // ── Pickup actions ─────────────────────────────────────────────────────────

  const handleArrive = async (bookingId: string) => {
    setArrivingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/arrive-pickup`, {}, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.id === bookingId ? { ...p, arrivedAtPickupAt: new Date().toISOString() } : p));
      setOtpRequestingId(bookingId);
      try {
        const res = await api.post<{ devOtpCode?: string }>(`/bookings/${bookingId}/request-pickup-otp`, {}, token ?? undefined);
        if (res?.devOtpCode) setDevOtpMap((m) => ({ ...m, [bookingId]: res.devOtpCode! }));
      } catch { /* allow driver to retry with Resend OTP */ }
      finally { setOtpRequestingId(null); }
    } catch { /* ignore */ }
    finally { setArrivingId(null); }
  };

  const handleRequestOtp = async (bookingId: string) => {
    setOtpRequestingId(bookingId);
    try {
      const res = await api.post<{ devOtpCode?: string }>(`/bookings/${bookingId}/request-pickup-otp`, {}, token ?? undefined);
      if (res?.devOtpCode) setDevOtpMap((m) => ({ ...m, [bookingId]: res.devOtpCode! }));
    } catch { /* ignore */ }
    finally { setOtpRequestingId(null); }
  };

  const handleVerifyOtp = async (bookingId: string) => {
    const otp = otpInputMap[bookingId] ?? '';
    if (otp.length !== 6) return;
    setOtpVerifyingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/verify-pickup-otp`, { otp }, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.id === bookingId ? { ...p, pickedUpAt: new Date().toISOString() } : p));
      setDevOtpMap((m) => { const n = { ...m }; delete n[bookingId]; return n; });
      setOtpInputMap((m) => { const n = { ...m }; delete n[bookingId]; return n; });
    } catch { /* invalid OTP — user retries */ }
    finally { setOtpVerifyingId(null); }
  };

  // ── Drop-off actions ─────────────────────────────────────────────────────────

  const handleArriveDropoff = async (bookingId: string) => {
    setArrivingDropoffId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/arrive-dropoff`, {}, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.id === bookingId ? { ...p, arrivedAtDropoffAt: new Date().toISOString() } : p));
    } catch { /* ignore — driver can retry */ }
    finally { setArrivingDropoffId(null); }
  };

  const handleDropOff = async (bookingId: string) => {
    setDroppingId(bookingId);
    try {
      await api.post(`/bookings/${bookingId}/drop-off`, {}, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.id === bookingId ? { ...p, droppedOffAt: new Date().toISOString() } : p));
    } catch { /* ignore */ }
    finally { setDroppingId(null); }
  };

  const handleNoShow = async () => {
    if (!noShowOpenId || !trip) return;
    setNoShowError('');
    if (!noShowReason.trim()) { setNoShowError(copy(lang, 'Please enter a reason', 'कृपया कारण दर्ज करें')); return; }
    setNoShowSubmitting(true);
    try {
      await api.post(`/driver/trips/${encodeURIComponent(trip.id)}/bookings/${encodeURIComponent(noShowOpenId)}/no-show`, { reason: noShowReason.trim() }, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.id === noShowOpenId ? { ...p, bookingStatus: 'NO_SHOW' } : p));
      setNoShowOpenId(null);
      setNoShowReason('');
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? copy(lang, 'Could not mark no-show', 'नो-शो मार्क नहीं हो सका');
      setNoShowError(msg);
    } finally { setNoShowSubmitting(false); }
  };

  // ── Trip actions ───────────────────────────────────────────────────────────

  const cancelTrip = async () => {
    if (!trip) return;
    setCancelling(true);
    const prev = trip;
    setTrip({ ...trip, status: 'CANCELLED' });
    try { await api.post(`/driver/trips/${encodeURIComponent(trip.id)}/cancel`, {}, token ?? undefined); setCancelOpen(false); }
    catch { setTrip(prev); }
    finally { setCancelling(false); }
  };

  const completeTrip = async () => {
    if (!trip) return;
    setCompleting(true);
    const prev = trip;
    setTrip({ ...trip, status: 'COMPLETED' });
    try {
      await api.post(`/driver/trips/${encodeURIComponent(trip.id)}/complete`, {}, token ?? undefined);
      setPassengers((prev) => prev.map((p) => p.bookingStatus === 'CONFIRMED' ? { ...p, bookingStatus: 'COMPLETED' } : p));
      setCompleteOpen(false);
    } catch { setTrip(prev); }
    finally { setCompleting(false); }
  };

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const tripStatus = trip?.status;
  const isDeparted = tripStatus === 'DEPARTED';
  const isOpen = tripStatus === 'OPEN';
  const isDone = tripStatus === 'COMPLETED' || tripStatus === 'CANCELLED';
  // Once everyone is aboard the manifest flips to drop-off mode.
  const dropPhase = isDeparted && allPickedUp;

  const noShowPassenger = passengers.find((p) => p.id === noShowOpenId);
  const noShowWaitedMs = noShowPassenger ? waitedMs(noShowPassenger.arrivedAtPickupAt) : 0;
  const noShowUnlocked = noShowWaitedMs >= 5 * 60 * 1000;
  const noShowSecondsLeft = noShowUnlocked ? 0 : Math.ceil((5 * 60 * 1000 - noShowWaitedMs) / 1000);

  return (
    <>
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5">
        <header className="print:hidden">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={() => router.back()} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]" aria-label={copy(lang, 'Back', 'वापस')}>←</button>
            <div className="min-w-0 text-center">
              <h1 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Trip passengers', 'यात्रियों की सूची')}</h1>
              {trip ? <p className="truncate text-small text-[var(--text-secondary)]">{trip.from} → {trip.to} · {formatTime(trip.departureAt, lang)}</p> : null}
            </div>
            <LanguageToggle />
          </div>
          {trip ? (
            <div className="mt-3 flex items-center justify-center gap-3">
              <TripStatusBadge status={tripStatus ?? 'OPEN'} lang={lang} />
              {driverLocation ? (
                <button type="button" onClick={() => setLocationPromptOpen(true)} className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-small text-teal-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                  {copy(lang, 'Location set', 'स्थान सेट')}
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="mt-5 print:mt-0">
          {loading ? <SkeletonCard /> : (
            <>
              {passengers.length === 0 ? (
                <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-small text-[var(--text-secondary)] shadow-card">
                  {copy(lang, 'No passengers yet.', 'अभी कोई यात्री नहीं है।')}
                </p>
              ) : (
                <div className="space-y-3">
                  {pickupRoutingEnabled && isDeparted && !dropPhase ? (
                    <PickupRoutingPanel lang={lang} passengerCount={routeablePassengers.length} optimizing={optimizing} hasOrder={pickupOrder.length > 0} onOptimize={handleOptimizeClick} />
                  ) : null}
                  {pickupRoutingEnabled && dropPhase ? (
                    <DropoffRoutingPanel lang={lang} passengerCount={droppablePassengers.length} hasOrder={dropoffOrder.length > 0} onOptimize={handleDropOptimizeClick} />
                  ) : null}
                  {orderedPassengers.map((passenger, index) => (
                    <PassengerCard
                      key={passenger.id}
                      passenger={passenger}
                      index={index + 1}
                      routePosition={
                        dropPhase
                          ? (dropoffOrder.includes(passenger.id) ? dropoffOrder.indexOf(passenger.id) + 1 : null)
                          : (pickupOrder.includes(passenger.id) ? pickupOrder.indexOf(passenger.id) + 1 : null)
                      }
                      pickupRoutingEnabled={pickupRoutingEnabled}
                      tripStarted={isDeparted}
                      dropPhase={dropPhase}
                      lang={lang}
                      tick={tick}
                      arriving={arrivingId === passenger.id}
                      otpRequesting={otpRequestingId === passenger.id}
                      otpVerifying={otpVerifyingId === passenger.id}
                      arrivingDropoff={arrivingDropoffId === passenger.id}
                      dropping={droppingId === passenger.id}
                      devOtp={devOtpMap[passenger.id]}
                      otpInput={otpInputMap[passenger.id] ?? ''}
                      onOtpInputChange={(v) => setOtpInputMap((m) => ({ ...m, [passenger.id]: v }))}
                      onArrive={() => void handleArrive(passenger.id)}
                      onRequestOtp={() => void handleRequestOtp(passenger.id)}
                      onVerifyOtp={() => void handleVerifyOtp(passenger.id)}
                      onNoShowOpen={() => { setNoShowOpenId(passenger.id); setNoShowReason(''); setNoShowError(''); }}
                      onNavigate={() => handleNavigateClick(passenger)}
                      onArriveDropoff={() => void handleArriveDropoff(passenger.id)}
                      onDropOff={() => void handleDropOff(passenger.id)}
                      onNavigateDropoff={() => handleNavigateClick(passenger, 'dropoff')}
                    />
                  ))}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
                <p className="font-medium text-[var(--text-primary)]">{copy(lang, 'Total passengers', 'कुल यात्री')}: {passengers.length}</p>
                {totalToCollect > 0 && <p className="mt-1 text-small text-[var(--text-secondary)]">{copy(lang, 'Cash to collect', 'नकद लेना है')}: {formatCurrency(totalToCollect)}</p>}
              </div>

              {!isDone && (
                <div className="mt-5 grid gap-3 print:hidden">
                  {isOpen && (
                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="primary" loading={departing} disabled={!trip || !canDepart(trip)} onClick={handleDepartClick}>{copy(lang, 'Start journey', 'यात्रा शुरू करें')}</Button>
                      <Button variant="danger" onClick={() => setCancelOpen(true)}>{copy(lang, 'Cancel trip', 'यात्रा रद्द करें')}</Button>
                    </div>
                  )}
                  {isOpen && trip && !canDepart(trip) && (
                    <p className="text-center text-small text-[var(--text-secondary)]">{copy(lang, 'Start journey available ±30 min of departure time', 'प्रस्थान समय के ±30 मिनट में यात्रा शुरू करें')}</p>
                  )}
                  {isDeparted && <Button variant="primary" onClick={() => setCompleteOpen(true)}>{copy(lang, 'Complete trip', 'यात्रा पूरी करें')}</Button>}
                </div>
              )}
            </>
          )}
        </section>

        {/* No-show sheet */}
        <BottomSheet open={!!noShowOpenId} onClose={() => { setNoShowOpenId(null); setNoShowError(''); }} title={copy(lang, 'Mark no-show', 'अनुपस्थित चिह्नित करें')}>
          {!noShowUnlocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="font-medium text-amber-800">{copy(lang, 'Minimum wait time not reached', 'न्यूनतम प्रतीक्षा समय पूरा नहीं हुआ')}</p>
              <p className="mt-1 text-small text-amber-700">
                {copy(lang, `Wait ${Math.floor(noShowSecondsLeft / 60)}m ${noShowSecondsLeft % 60}s more`, `${Math.floor(noShowSecondsLeft / 60)}मि ${noShowSecondsLeft % 60}से और प्रतीक्षा करें`)}
              </p>
            </div>
          ) : (
            <>
              <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'You have waited the required 5 minutes. Please enter the reason.', 'आपने आवश्यक 5 मिनट प्रतीक्षा की है। कारण दर्ज करें।')}</p>
              <textarea
                value={noShowReason}
                onChange={(e) => setNoShowReason(e.target.value)}
                rows={3}
                placeholder={copy(lang, 'e.g. Passenger not at location after repeated calls', 'जैसे: बार-बार कॉल के बाद भी यात्री स्थान पर नहीं था')}
                className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-small text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              />
              {noShowError && <p className="mt-2 text-small text-red-600">{noShowError}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="danger" loading={noShowSubmitting} disabled={!noShowReason.trim()} onClick={() => void handleNoShow()}>{copy(lang, 'Confirm no-show', 'नो-शो पुष्टि करें')}</Button>
                <Button variant="ghost" onClick={() => setNoShowOpenId(null)}>{copy(lang, 'Cancel', 'रद्द करें')}</Button>
              </div>
            </>
          )}
        </BottomSheet>

        <BottomSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={copy(lang, 'Cancel trip?', 'यात्रा रद्द करें?')}>
          <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'All confirmed bookings will be cancelled.', 'सभी कन्फर्म बुकिंग रद्द हो जाएंगी।')}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="danger" loading={cancelling} onClick={() => void cancelTrip()}>{copy(lang, 'Yes, cancel', 'हाँ, रद्द करें')}</Button>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>{copy(lang, 'Keep trip', 'यात्रा रखें')}</Button>
          </div>
        </BottomSheet>

        <BottomSheet open={completeOpen} onClose={() => setCompleteOpen(false)} title={copy(lang, 'Complete trip?', 'यात्रा पूरी करें?')}>
          <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'All confirmed bookings will be marked as completed.', 'सभी कन्फर्म बुकिंग पूरी मानी जाएंगी।')}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="primary" loading={completing} onClick={() => void completeTrip()}>{copy(lang, 'Yes, complete', 'हाँ, पूरी करें')}</Button>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>{copy(lang, 'Not yet', 'अभी नहीं')}</Button>
          </div>
        </BottomSheet>
      </main>

      <LocationPromptModal open={locationPromptOpen} lang={lang} onConfirm={handleLocationConfirmed} onClose={() => { setLocationPromptOpen(false); setPendingAction(null); }} />
      {navTarget && driverLocation && (navTarget.kind === 'pickup' ? navTarget.passenger.pickup : navTarget.passenger.dropoff) ? (
        <NavigationModal target={navTarget} origin={driverLocation} lang={lang} onClose={() => setNavTarget(null)} />
      ) : null}
    </>
  );
}

// ── TripStatusBadge ──────────────────────────────────────────────────────────

function TripStatusBadge({ status, lang }: { status: string; lang: 'en' | 'hi' }) {
  const map: Record<string, { color: string; en: string; hi: string }> = {
    OPEN: { color: 'bg-[var(--brand-light)] text-[var(--brand)]', en: 'Open for boarding', hi: 'बोर्डिंग खुली है' },
    DEPARTED: { color: 'bg-amber-100 text-amber-800', en: 'In progress', hi: 'यात्रा जारी है' },
    COMPLETED: { color: 'bg-teal-100 text-teal-800', en: 'Completed', hi: 'पूर्ण' },
    CANCELLED: { color: 'bg-stone-100 text-stone-600', en: 'Cancelled', hi: 'रद्द' },
  };
  const cfg = map[status] ?? map.OPEN;
  return <span className={`rounded-full px-4 py-1 text-small font-medium ${cfg.color}`}>{lang === 'hi' ? cfg.hi : cfg.en}</span>;
}

// ── PickupRoutingPanel ───────────────────────────────────────────────────────

function PickupRoutingPanel({ lang, passengerCount, optimizing, hasOrder, onOptimize }: {
  lang: 'en' | 'hi'; passengerCount: number; optimizing: boolean; hasOrder: boolean; onOptimize: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-[var(--text-primary)]">{copy(lang, 'Pickup routing', 'पिकअप रूटिंग')}</h2>
          <p className="mt-1 text-small text-[var(--text-secondary)]">
            {passengerCount > 0 ? copy(lang, `${passengerCount} pickup locations`, `${passengerCount} स्थान`) : copy(lang, 'No pickup locations yet', 'अभी कोई स्थान नहीं')}
          </p>
        </div>
        <Button variant="ghost" loading={optimizing} disabled={passengerCount < 2 || optimizing} onClick={onOptimize}>
          {hasOrder ? copy(lang, 'Reorder', 'फिर क्रम दें') : copy(lang, 'Best order', 'सबसे अच्छा क्रम')}
        </Button>
      </div>
    </section>
  );
}

// ── DropoffRoutingPanel ──────────────────────────────────────────────────────

function DropoffRoutingPanel({ lang, passengerCount, hasOrder, onOptimize }: {
  lang: 'en' | 'hi'; passengerCount: number; hasOrder: boolean; onOptimize: () => void;
}) {
  return (
    <section className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-teal-800">{copy(lang, 'All passengers aboard — drop-off started', 'सभी यात्री सवार — ड्रॉप शुरू')}</h2>
          <p className="mt-1 text-small text-teal-700">
            {passengerCount > 0
              ? copy(lang, `${passengerCount} drop-off points`, `${passengerCount} ड्रॉप स्थान`)
              : copy(lang, 'Heading to the destination', 'गंतव्य की ओर')}
          </p>
        </div>
        <Button variant="ghost" disabled={passengerCount < 2} onClick={onOptimize}>
          {hasOrder ? copy(lang, 'Reorder', 'फिर क्रम दें') : copy(lang, 'Best order', 'सबसे अच्छा क्रम')}
        </Button>
      </div>
    </section>
  );
}

// ── PassengerCard ────────────────────────────────────────────────────────────

function PassengerCard({
  passenger, index, routePosition, pickupRoutingEnabled, tripStarted, dropPhase, lang, tick,
  arriving, otpRequesting, otpVerifying, arrivingDropoff, dropping, devOtp, otpInput,
  onOtpInputChange, onArrive, onRequestOtp, onVerifyOtp, onNoShowOpen, onNavigate,
  onArriveDropoff, onDropOff, onNavigateDropoff,
}: {
  passenger: ManifestPassenger; index: number; routePosition: number | null;
  pickupRoutingEnabled: boolean; tripStarted: boolean; dropPhase: boolean; lang: 'en' | 'hi'; tick: number;
  arriving: boolean; otpRequesting: boolean; otpVerifying: boolean;
  arrivingDropoff: boolean; dropping: boolean;
  devOtp?: string; otpInput: string;
  onOtpInputChange: (v: string) => void;
  onArrive: () => void; onRequestOtp: () => void; onVerifyOtp: () => void;
  onNoShowOpen: () => void; onNavigate: () => void;
  onArriveDropoff: () => void; onDropOff: () => void; onNavigateDropoff: () => void;
}) {
  void tick; // triggers re-render for live countdown
  const bs = passenger.bookingStatus;
  const isPickedUp = !!passenger.pickedUpAt;
  const isDroppedOff = !!passenger.droppedOffAt;
  const isArrivedDropoff = !!passenger.arrivedAtDropoffAt && !isDroppedOff;
  const isArrived = !!passenger.arrivedAtPickupAt && !isPickedUp;
  const waitMs = passenger.arrivedAtPickupAt ? Date.now() - new Date(passenger.arrivedAtPickupAt).getTime() : 0;
  const waitMin = Math.floor(waitMs / 60000);
  const waitSec = Math.floor((waitMs % 60000) / 1000);
  const noShowUnlocked = waitMs >= 5 * 60 * 1000;

  const statusColor =
    isDroppedOff || bs === 'COMPLETED' ? 'teal' :
    isArrivedDropoff ? 'amber' :
    isPickedUp ? 'teal' :
    bs === 'NO_SHOW' ? 'stone' :
    bs === 'CANCELLED' ? 'stone' :
    isArrived ? 'amber' :
    passenger.paymentStatus === 'PAID' ? 'teal' : 'amber';

  const statusLabel =
    isDroppedOff ? copy(lang, 'Dropped off', 'ड्रॉप हो गया') :
    isArrivedDropoff ? copy(lang, 'At drop point', 'ड्रॉप पर') :
    isPickedUp ? copy(lang, 'In vehicle', 'वाहन में') :
    bs === 'COMPLETED' ? copy(lang, 'Completed', 'पूर्ण') :
    bs === 'NO_SHOW' ? copy(lang, 'No-show', 'अनुपस्थित') :
    bs === 'CANCELLED' ? copy(lang, 'Cancelled', 'रद्द') :
    isArrived ? copy(lang, 'Driver arrived', 'ड्राइवर पहुंचा') :
    passenger.paymentStatus === 'PAID' ? copy(lang, 'Paid', 'भुगतान') : copy(lang, 'Cash pending', 'नकद बाकी');

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card print:break-inside-avoid">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display ${isPickedUp ? 'bg-teal-100 text-teal-700' : 'bg-[var(--brand-light)] text-[var(--brand)]'}`}>{index}</span>
        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium text-[var(--text-primary)]">{passenger.name}</h2>
              <a href={`tel:${passenger.phone.replace(/\s+/g, '')}`} className="text-small text-[var(--brand)] print:text-[var(--text-secondary)]">{formatPhone(passenger.phone)}</a>
            </div>
            <Pill color={statusColor} label={statusLabel} />
          </div>

          {/* Fare + seat */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-small text-[var(--text-secondary)]">
            <span>{passenger.seatType === 'FRONT' ? copy(lang, 'Front seat', 'आगे की सीट') : copy(lang, 'Back seat', 'पीछे की सीट')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(passenger.totalPaise)}</span>
            <span>{passenger.luggage}</span>
            <span className="text-right">{passenger.paymentMethod === 'UPI' ? 'UPI' : copy(lang, 'Cash', 'नकद')}</span>
          </div>

          {/* Pickup location + navigate */}
          {pickupRoutingEnabled && tripStarted && !isPickedUp && bs === 'CONFIRMED' ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-small font-medium text-[var(--text-primary)]">
                  {routePosition ? `${copy(lang, 'Stop', 'स्टॉप')} ${routePosition}` : copy(lang, 'Pickup', 'पिकअप')}
                </p>
                <p className="truncate text-small text-[var(--text-secondary)]">{passenger.pickup?.label || passenger.pickupPoint || '—'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!passenger.pickup} onClick={onNavigate}>
                {copy(lang, 'Navigate', 'नेविगेट')}
              </Button>
            </div>
          ) : null}

          {/* ── Pickup flow (only when trip is DEPARTED + booking CONFIRMED) ─ */}
          {tripStarted && bs === 'CONFIRMED' && (
            <div className="mt-3 space-y-2">

              {/* State A: not yet arrived */}
              {!passenger.arrivedAtPickupAt && (
                <Button size="sm" variant="secondary" fullWidth loading={arriving} onClick={onArrive}>
                  {copy(lang, 'I\'ve arrived at pickup', 'मैं पिकअप पर पहुंचा')}
                </Button>
              )}

              {/* State B: arrived, not yet picked up */}
              {isArrived && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  {/* Arrival timer */}
                  <div className="flex items-center justify-between">
                    <p className="text-small font-medium text-amber-800">{copy(lang, 'Waiting at pickup', 'पिकअप पर प्रतीक्षा')}</p>
                    <span className="font-display text-small font-bold text-amber-700">{waitMin}m {waitSec}s</span>
                  </div>

                  {/* Dev OTP preview */}
                  {devOtp && (
                    <div className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-center">
                      <p className="text-xs text-amber-600">{copy(lang, 'Dev OTP', 'Dev OTP')}</p>
                      <p className="font-display text-2xl font-bold tracking-[0.3em] text-[var(--brand)]">{devOtp}</p>
                    </div>
                  )}

                  {/* OTP entry */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => onOtpInputChange(e.target.value.replace(/\D/g, ''))}
                      placeholder={copy(lang, 'Enter 6-digit OTP', '6 अंक OTP दर्ज करें')}
                      className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-small text-center tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                    />
                    <Button size="sm" variant="primary" loading={otpVerifying} disabled={otpInput.length !== 6} onClick={onVerifyOtp}>
                      {copy(lang, 'Verify', 'सत्यापित')}
                    </Button>
                  </div>

                  {/* Request OTP + No-show row */}
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="flex-1" loading={otpRequesting} onClick={onRequestOtp}>
                      {copy(lang, 'Resend OTP', 'OTP फिर भेजें')}
                    </Button>
                    <Button
                      size="sm"
                      variant={noShowUnlocked ? 'danger' : 'ghost'}
                      className="flex-1"
                      disabled={!noShowUnlocked}
                      onClick={onNoShowOpen}
                    >
                      {copy(lang, 'No-show', 'अनुपस्थित')}
                    </Button>
                  </div>
                  {!noShowUnlocked && (
                    <p className="text-center text-xs text-amber-600">
                      {copy(lang, `No-show available in ${Math.ceil((5 * 60 * 1000 - waitMs) / 1000)}s`, `${Math.ceil((5 * 60 * 1000 - waitMs) / 1000)}से बाद`)}
                    </p>
                  )}
                </div>
              )}

              {/* State C: picked up — drop-off has not started yet */}
              {isPickedUp && !isDroppedOff && !dropPhase && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-center">
                  <p className="text-small font-medium text-teal-700">{copy(lang, 'Passenger boarded ✓', 'यात्री सवार हो गया ✓')}</p>
                </div>
              )}

              {/* State D: drop-off phase — navigate to drop, confirm arrival & drop */}
              {dropPhase && isPickedUp && !isDroppedOff && (
                <div className="rounded-xl border-2 border-teal-200 bg-teal-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-small font-medium text-teal-800">
                        {routePosition ? `${copy(lang, 'Drop', 'ड्रॉप')} ${routePosition}` : copy(lang, 'Drop-off', 'ड्रॉप')}
                      </p>
                      <p className="truncate text-small text-teal-700">{passenger.dropoff?.label || copy(lang, 'Destination', 'गंतव्य')}</p>
                    </div>
                    {passenger.dropoff ? (
                      <Button size="sm" variant="secondary" onClick={onNavigateDropoff}>
                        {copy(lang, 'Navigate', 'नेविगेट')}
                      </Button>
                    ) : null}
                  </div>

                  {!isArrivedDropoff ? (
                    <Button size="sm" variant="secondary" fullWidth loading={arrivingDropoff} onClick={onArriveDropoff}>
                      {copy(lang, "I've reached the drop point", 'मैं ड्रॉप पर पहुंचा')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" fullWidth loading={dropping} onClick={onDropOff}>
                      {copy(lang, 'Mark dropped off', 'ड्रॉप पूरा करें')}
                    </Button>
                  )}
                </div>
              )}

              {/* State E: dropped off */}
              {isDroppedOff && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-center">
                  <p className="text-small font-medium text-teal-700">{copy(lang, 'Passenger dropped off ✓', 'यात्री ड्रॉप हो गया ✓')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── LocationPromptModal ──────────────────────────────────────────────────────

function LocationPromptModal({ open, lang, onConfirm, onClose }: {
  open: boolean; lang: 'en' | 'hi'; onConfirm: (loc: Coordinate) => void; onClose: () => void;
}) {
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'found' | 'failed'>('loading');
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');

  useEffect(() => {
    if (!open) return;
    setGpsStatus('loading');
    setLatStr(''); setLngStr('');
    getCurrentPosition().then((c) => {
      if (c) { setGpsStatus('found'); setLatStr(c.lat.toFixed(6)); setLngStr(c.lng.toFixed(6)); }
      else { setGpsStatus('failed'); }
    });
  }, [open]);

  const applyPreset = (coord: Coordinate) => { setLatStr(coord.lat.toFixed(6)); setLngStr(coord.lng.toFixed(6)); setGpsStatus('found'); };
  const lat = parseFloat(latStr); const lng = parseFloat(lngStr);
  const canConfirm = Number.isFinite(lat) && Number.isFinite(lng);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="w-full rounded-t-3xl bg-[var(--surface)] px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:mx-auto sm:max-w-md sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border)]" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Your current location', 'आपकी वर्तमान स्थिति')}</h2>
            <p className="mt-1 text-small text-[var(--text-secondary)]">{copy(lang, 'Used for distance and ETA', 'दूरी और ETA के लिए')}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)]">✕</button>
        </div>

        {gpsStatus === 'loading' && <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3.5"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" /><p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Fetching GPS…', 'GPS मिल रहा है…')}</p></div>}
        {gpsStatus === 'found' && <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 p-3.5"><span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" /><p className="text-small text-teal-700">{copy(lang, 'GPS found', 'GPS मिला')} · {lat.toFixed(4)}, {lng.toFixed(4)}</p></div>}
        {gpsStatus === 'failed' && <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5"><span className="text-amber-500">⚠</span><p className="text-small text-amber-700">{copy(lang, 'GPS unavailable — pick below', 'GPS उपलब्ध नहीं')}</p></div>}

        <p className="mb-2 text-small font-medium text-[var(--text-secondary)]">{copy(lang, 'Quick picks', 'त्वरित विकल्प')}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {LOCATION_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => applyPreset(p.coord)} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-small text-[var(--text-primary)] active:bg-[var(--brand-light)] active:border-[var(--brand)] active:text-[var(--brand)]">{p.label}</button>
          ))}
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-small text-[var(--text-secondary)]">{copy(lang, 'Latitude', 'अक्षांश')}</label><input type="number" value={latStr} onChange={(e) => { setLatStr(e.target.value); setGpsStatus('found'); }} placeholder="30.3165" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-small outline-none focus:border-[var(--brand)]" /></div>
          <div><label className="mb-1 block text-small text-[var(--text-secondary)]">{copy(lang, 'Longitude', 'देशांतर')}</label><input type="number" value={lngStr} onChange={(e) => { setLngStr(e.target.value); setGpsStatus('found'); }} placeholder="78.0322" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-small outline-none focus:border-[var(--brand)]" /></div>
        </div>
        <Button variant="primary" fullWidth disabled={!canConfirm} onClick={() => onConfirm({ lat, lng })}>{copy(lang, 'Use this location', 'यह स्थान उपयोग करें')}</Button>
      </div>
    </div>
  );
}

// ── NavigationModal ──────────────────────────────────────────────────────────

function NavigationModal({ target, origin, lang, onClose }: {
  target: NavTarget; origin: Coordinate; lang: 'en' | 'hi'; onClose: () => void;
}) {
  const { passenger, kind } = target;
  const dest = (kind === 'pickup' ? passenger.pickup : passenger.dropoff)!;
  const km = distanceKm(origin, dest);
  const eta = etaLabel(km);
  const embedUrl = googleMapsEmbedUrl(dest, origin);
  const nativeUrl = googleMapsNativeUrl(dest, origin);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)]" aria-label={copy(lang, 'Back', 'वापस')}>←</button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--text-primary)]">{passenger.name}</p>
          <p className="text-small text-[var(--text-secondary)]">
            {kind === 'dropoff'
              ? copy(lang, 'Navigating to drop-off', 'ड्रॉप की ओर')
              : copy(lang, 'Navigating to pickup', 'पिकअप की ओर')}
          </p>
        </div>
        <a href={`tel:${passenger.phone.replace(/\s+/g, '')}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand)] text-lg">☎</a>
      </div>
      <div className="shrink-0 grid grid-cols-2 gap-3 px-4 py-4">
        <div className="rounded-2xl bg-[var(--brand-light)] px-4 py-3 text-center">
          <p className="font-display text-[1.75rem] font-bold leading-none text-[var(--brand)]">{km.toFixed(1)}</p>
          <p className="mt-0.5 text-small font-medium text-[var(--brand)]">km {copy(lang, 'away', 'दूर')}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center">
          <p className="font-display text-[1.75rem] font-bold leading-none text-amber-700">{eta}</p>
          <p className="mt-0.5 text-small font-medium text-amber-600">{copy(lang, 'est. at 40 km/h', 'अनुमानित')}</p>
        </div>
      </div>
      <div className="shrink-0 mx-4 mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
        <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Destination', 'गंतव्य')}</p>
        <p className="mt-0.5 font-medium text-[var(--text-primary)]">{dest.label}</p>
        {dest.address && dest.address !== dest.label && <p className="mt-0.5 text-small text-[var(--text-secondary)]">{dest.address}</p>}
      </div>
      <div className="mx-4 mb-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]">
        <iframe title={`Navigate to ${passenger.name}`} src={embedUrl} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
      <div className="shrink-0 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <a href={nativeUrl} target="_blank" rel="noopener noreferrer" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] font-medium text-white shadow-card active:opacity-80">
          ↗ {copy(lang, 'Open in Google Maps', 'Google Maps में खोलें')}
        </a>
      </div>
    </div>
  );
}

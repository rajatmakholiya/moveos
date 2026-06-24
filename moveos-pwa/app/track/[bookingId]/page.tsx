'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { useLanguage } from '../../../lib/LanguageContext';
import { useToast } from '../../../lib/ToastContext';
import { parseBooking } from '../../../lib/pahadi';
import { copy, formatTime, readNumber, readString, safeRecord } from '../../../lib/utils';
import { useTrackingSocket } from '../../../lib/useTrackingSocket';

type Coordinate = { lat: number; lng: number };

type TripPhase = 'EN_ROUTE_TO_PICKUP' | 'ONBOARD_TO_DROPOFF' | 'DROPPED_OFF';

type TripPosition = {
  driverLocation: { lat: number; lng: number; updatedAt: string } | null;
  myPickup: { lat: number; lng: number; label?: string } | null;
  myDropoff: { lat: number; lng: number; label?: string } | null;
  phase: TripPhase;
  stopsBeforeMe: number;
  pickedUpCount: number;
  totalPassengers: number;
  distanceKmToPickup: number | null;
  distanceKmToDropoff: number | null;
  dropsBeforeMe: number;
  driverArrivedAtMyPickup: boolean;
  driverArrivedAtMyDropoff: boolean;
  pickedUpAt: string | null;
  droppedOffAt: string | null;
  tripStatus: string;
};

type PickupOtpStatus = {
  status: string;
  otp?: string;
};

function etaLabel(km: number) {
  const m = Math.round((km / 40) * 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}min`;
}

function googleMapsEmbedUrl(driver: Coordinate | null, pickup: Coordinate | null) {
  if (driver && pickup) {
    const params = new URLSearchParams({
      output: 'embed',
      f: 'd',
      source: 's_d',
      saddr: `${driver.lat},${driver.lng}`,
      daddr: `${pickup.lat},${pickup.lng}`,
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }

  const point = driver ?? pickup;
  if (!point) return null;
  return `https://www.google.com/maps?q=${point.lat},${point.lng}&z=14&output=embed`;
}

function googleMapsNativeUrl(driver: Coordinate | null, pickup: Coordinate | null) {
  if (driver && pickup) {
    return `https://www.google.com/maps/dir/?api=1&origin=${driver.lat},${driver.lng}&destination=${pickup.lat},${pickup.lng}&travelmode=driving`;
  }
  const point = driver ?? pickup;
  if (!point) return null;
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}

export default function TrackingPage() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const { token } = useAuth();
  const toast = useToast();

  const [position, setPosition] = useState<TripPosition | null>(null);
  const [driverName, setDriverName] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [otpStatus, setOtpStatus] = useState<PickupOtpStatus | null>(null);
  const [otpRefreshing, setOtpRefreshing] = useState(false);

  // WebSocket: real-time driver location (no polling needed for location)
  const { driverLocation: wsDriverLoc, bookingUpdate, wsStatus } = useTrackingSocket(params.bookingId);
  const notifiedDropRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [posRes, bookingRes] = await Promise.all([
        api.get<unknown>(`/bookings/${encodeURIComponent(params.bookingId)}/trip-position`, token ?? undefined),
        api.get<unknown>(`/bookings/${encodeURIComponent(params.bookingId)}`),
      ]);

      const posWrapper = safeRecord(posRes);
      const pos = safeRecord(posWrapper?.data ?? posRes);
      const driverLoc = safeRecord(pos?.driverLocation);
      const myPickup = safeRecord(pos?.myPickup);
      const myDropoff = safeRecord(pos?.myDropoff);

      setPosition({
        driverLocation: driverLoc?.lat && driverLoc?.lng
          ? { lat: Number(driverLoc.lat), lng: Number(driverLoc.lng), updatedAt: String(driverLoc.updatedAt ?? '') }
          : null,
        myPickup: myPickup?.lat && myPickup?.lng
          ? { lat: Number(myPickup.lat), lng: Number(myPickup.lng), label: readString(myPickup, ['label']) }
          : null,
        myDropoff: myDropoff?.lat && myDropoff?.lng
          ? { lat: Number(myDropoff.lat), lng: Number(myDropoff.lng), label: readString(myDropoff, ['label']) }
          : null,
        phase: readString(pos, ['phase'], 'EN_ROUTE_TO_PICKUP') as TripPhase,
        stopsBeforeMe: readNumber(pos, ['stopsBeforeMe'], 0),
        pickedUpCount: readNumber(pos, ['pickedUpCount'], 0),
        totalPassengers: readNumber(pos, ['totalPassengers'], 0),
        distanceKmToPickup: pos?.distanceKmToPickup != null ? Number(pos.distanceKmToPickup) : null,
        distanceKmToDropoff: pos?.distanceKmToDropoff != null ? Number(pos.distanceKmToDropoff) : null,
        dropsBeforeMe: readNumber(pos, ['dropsBeforeMe'], 0),
        driverArrivedAtMyPickup: pos?.driverArrivedAtMyPickup === true,
        driverArrivedAtMyDropoff: pos?.driverArrivedAtMyDropoff === true,
        pickedUpAt: pos?.pickedUpAt ? String(pos.pickedUpAt) : null,
        droppedOffAt: pos?.droppedOffAt ? String(pos.droppedOffAt) : null,
        tripStatus: readString(pos, ['tripStatus'], 'OPEN'),
      });

      const booking = parseBooking(bookingRes);
      setDriverName(booking?.driverName ?? '');
      setDepartureAt(booking?.departureAt ?? '');
      setLastUpdated(new Date().toLocaleTimeString());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [params.bookingId, token]);

  useEffect(() => {
    void load();
    // Poll every 60s for stops count / business state only — location comes via WebSocket
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  // Merge live WS location into position state & update timestamp
  useEffect(() => {
    if (!wsDriverLoc) return;
    setPosition((prev) => prev
      ? { ...prev, driverLocation: { lat: wsDriverLoc.lat, lng: wsDriverLoc.lng, updatedAt: wsDriverLoc.updatedAt } }
      : prev,
    );
    setLastUpdated(new Date().toLocaleTimeString());
  }, [wsDriverLoc]);

  // Drop-off completion: surface a toast + best-effort browser notification, once.
  useEffect(() => {
    const dropped = bookingUpdate?.droppedOff || !!bookingUpdate?.droppedOffAt;
    if (!dropped || notifiedDropRef.current) return;
    notifiedDropRef.current = true;
    const msg = copy(lang, 'You have reached your destination', 'आप अपने गंतव्य पर पहुंच गए हैं');
    toast.success(msg);
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Pahadi Rides', { body: msg }); } catch { /* ignore */ }
    }
    void load();
  }, [bookingUpdate, lang, toast, load]);

  const refreshOtpStatus = useCallback(async () => {
    setOtpRefreshing(true);
    try {
      const res = await api.get<PickupOtpStatus>(`/bookings/${encodeURIComponent(params.bookingId)}/pickup-otp-status`, token ?? undefined);
      const record = safeRecord(res);
      const data = safeRecord(record?.data ?? res);
      setOtpStatus(data ? {
        status: typeof data.status === 'string' ? data.status : '',
        otp: typeof data.otp === 'string' ? data.otp : undefined,
      } : null);
    } catch {
      setOtpStatus(null);
    } finally {
      setOtpRefreshing(false);
    }
  }, [params.bookingId, token]);

  useEffect(() => {
    const shouldLoadOtp = position?.tripStatus === 'DEPARTED' && !position?.pickedUpAt;
    if (!shouldLoadOtp) {
      setOtpStatus(null);
      return;
    }
    void refreshOtpStatus();
  }, [position?.pickedUpAt, position?.tripStatus, refreshOtpStatus]);

  const isBoarded = position?.phase === 'ONBOARD_TO_DROPOFF';
  const isDroppedOff = position?.phase === 'DROPPED_OFF';

  // Once boarded, ask for notification permission so the drop-off alert can fire.
  useEffect(() => {
    if (!isBoarded) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => { /* ignore */ });
    }
  }, [isBoarded]);
  // After boarding the passenger watches the leg to their own destination.
  const mapTarget = isBoarded ? position?.myDropoff ?? null : position?.myPickup ?? null;

  const hasDriver = !!position?.driverLocation;
  const hasPickup = !!mapTarget;
  const mapEmbedUrl = useMemo(
    () => googleMapsEmbedUrl(position?.driverLocation ?? null, mapTarget),
    [position?.driverLocation, mapTarget],
  );
  const openMapsUrl = useMemo(
    () => googleMapsNativeUrl(position?.driverLocation ?? null, mapTarget),
    [position?.driverLocation, mapTarget],
  );

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
      <section className="mx-auto max-w-[448px] space-y-3">
        <header className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)]"
              aria-label={copy(lang, 'Back', 'वापस')}
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-heading text-[var(--text-primary)]">
                {driverName
                  ? copy(lang, `${driverName} is on the way`, `${driverName} रास्ते में`)
                  : copy(lang, 'Live tracking', 'लाइव ट्रैकिंग')}
              </h1>
              {departureAt ? (
                <p className="mt-1 text-small text-[var(--text-secondary)]">
                  {formatTime(departureAt, lang)} {copy(lang, 'departure', 'प्रस्थान')}
                </p>
              ) : null}
            </div>
            <span className={[
              'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
              wsStatus === 'connected'
                ? 'bg-[var(--brand-light)] text-[var(--brand)]'
                : 'border border-amber-200 bg-amber-50 text-amber-700',
            ].join(' ')}>
              <span className={[
                'h-1.5 w-1.5 rounded-full',
                wsStatus === 'connected' ? 'animate-pulse bg-[var(--brand)]' : 'bg-amber-400',
              ].join(' ')} />
              {wsStatus === 'connected'
                ? copy(lang, 'Live', 'लाइव')
                : copy(lang, 'Reconnecting…', 'जोड़ रहे हैं…')}
            </span>
          </div>

          {lastUpdated ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              {copy(lang, 'Updated', 'अपडेट')} {lastUpdated}
            </p>
          ) : null}
        </header>

        {position?.driverArrivedAtMyPickup && !position.pickedUpAt ? (
          <div className="rounded-2xl border-2 border-[var(--brand)] bg-white px-4 py-3 text-center shadow-card">
            <p className="font-medium text-[var(--brand)]">
              {copy(lang, 'Driver has arrived at your pickup', 'ड्राइवर आपके पिकअप पर पहुंच गया है')}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {copy(lang, 'Check your booking page for the OTP', 'OTP के लिए बुकिंग पेज देखें')}
            </p>
          </div>
        ) : null}

        {otpStatus?.status === 'OTP_PENDING' && otpStatus.otp ? (
          <div className="rounded-2xl border-2 border-[var(--brand)] bg-[var(--brand-light)] p-5 text-center shadow-card">
            <p className="text-small font-medium text-[var(--brand)]">
              {copy(lang, 'Your driver is here. Share this code', 'आपका ड्राइवर पहुंच गया है। यह कोड बताएं')}
            </p>
            <p className="mt-2 font-display text-[2.5rem] font-bold tracking-[0.4em] text-[var(--brand)]">
              {otpStatus.otp}
            </p>
            <p className="mt-1 text-xs text-[var(--brand)] opacity-70">
              {copy(lang, 'Tell this 6-digit code to your driver', 'यह 6 अंक का कोड अपने ड्राइवर को बताएं')}
            </p>
            <Button className="mt-4" size="sm" variant="secondary" loading={otpRefreshing} onClick={() => void refreshOtpStatus()}>
              {copy(lang, 'Refresh OTP', 'OTP रीफ्रेश करें')}
            </Button>
          </div>
        ) : null}

        {position?.tripStatus === 'DEPARTED' && !position?.pickedUpAt && otpStatus?.status === 'WAITING' ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-card">
            <p className="font-medium text-[var(--text-primary)]">
              {copy(lang, 'OTP is not available yet', 'OTP अभी उपलब्ध नहीं है')}
            </p>
            <p className="mt-1 text-small text-[var(--text-secondary)]">
              {copy(lang, 'Refresh after the driver requests it', 'ड्राइवर के अनुरोध करने के बाद रीफ्रेश करें')}
            </p>
            <Button className="mt-4" size="sm" variant="ghost" loading={otpRefreshing} onClick={() => void refreshOtpStatus()}>
              {copy(lang, 'Refresh OTP', 'OTP रीफ्रेश करें')}
            </Button>
          </div>
        ) : null}

        {position && position.tripStatus === 'DEPARTED' && !position.pickedUpAt ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                {position.stopsBeforeMe === 0 ? (
                  <>
                    <p className="font-display text-heading font-bold text-[var(--brand)]">
                      {copy(lang, "You're next!", 'आप अगले हैं!')}
                    </p>
                    <p className="text-small text-[var(--text-secondary)]">
                      {copy(lang, 'Driver is heading to your pickup', 'ड्राइवर आपके पिकअप की ओर आ रहा है')}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-heading font-bold text-[var(--text-primary)]">
                      {position.stopsBeforeMe === 1
                        ? copy(lang, '1 stop before you', '1 स्टॉप आपसे पहले')
                        : copy(lang, `${position.stopsBeforeMe} stops before you`, `${position.stopsBeforeMe} स्टॉप आपसे पहले`)}
                    </p>
                    <p className="text-small text-[var(--text-secondary)]">
                      {copy(lang, 'Driver is picking up other passengers', 'ड्राइवर अन्य यात्रियों को ले रहा है')}
                    </p>
                  </>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  {Array.from({ length: position.pickedUpCount }).map((_, i) => (
                    <span key={`picked-${i}`} className="h-2.5 w-2.5 rounded-full bg-teal-400" />
                  ))}
                  {Array.from({ length: position.stopsBeforeMe }).map((_, i) => (
                    <span key={`before-${i}`} className="h-2.5 w-2.5 rounded-full border-2 border-amber-400 bg-amber-100" />
                  ))}
                  <span className="h-3 w-3 rounded-full border-2 border-[var(--brand)] bg-[var(--brand-light)]" />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{copy(lang, 'you', 'आप')} →</p>
              </div>
            </div>

            {position.distanceKmToPickup != null ? (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                <div className="rounded-2xl bg-[var(--surface-raised)] px-3 py-3 text-center">
                  <p className="font-display text-[1.4rem] font-bold leading-none text-[var(--text-primary)]">
                    {position.distanceKmToPickup.toFixed(1)} km
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{copy(lang, 'driver to you', 'ड्राइवर से आप')}</p>
                </div>
                <div className="rounded-2xl bg-[var(--brand-light)] px-3 py-3 text-center">
                  <p className="font-display text-[1.4rem] font-bold leading-none text-[var(--brand)]">
                    {etaLabel(position.distanceKmToPickup)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--brand)]">{copy(lang, 'est. arrival', 'अनुमानित समय')}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {isDroppedOff ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-center shadow-card">
            <p className="font-display text-heading font-bold text-teal-700">
              {copy(lang, 'You have reached your destination', 'आप अपने गंतव्य पर पहुंच गए हैं')}
            </p>
            <p className="mt-1 text-small text-teal-600">
              {copy(lang, 'Thank you for travelling with us', 'हमारे साथ यात्रा करने के लिए धन्यवाद')}
            </p>
          </div>
        ) : null}

        {isBoarded ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
            {position?.driverArrivedAtMyDropoff ? (
              <div className="rounded-xl border-2 border-[var(--brand)] bg-[var(--brand-light)] px-4 py-3 text-center">
                <p className="font-medium text-[var(--brand)]">
                  {copy(lang, 'You are arriving at your destination', 'आप अपने गंतव्य पर पहुंच रहे हैं')}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-heading font-bold text-[var(--text-primary)]">
                      {copy(lang, 'On the way to your destination', 'आपके गंतव्य की ओर')}
                    </p>
                    <p className="truncate text-small text-[var(--text-secondary)]">
                      {position?.myDropoff?.label || copy(lang, 'Heading to your drop point', 'आपके ड्रॉप की ओर')}
                    </p>
                  </div>
                </div>

                {position?.dropsBeforeMe ? (
                  <p className="mt-2 text-small text-[var(--text-secondary)]">
                    {position.dropsBeforeMe === 1
                      ? copy(lang, '1 drop before yours', '1 ड्रॉप आपसे पहले')
                      : copy(lang, `${position.dropsBeforeMe} drops before yours`, `${position.dropsBeforeMe} ड्रॉप आपसे पहले`)}
                  </p>
                ) : null}

                {position?.distanceKmToDropoff != null ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                    <div className="rounded-2xl bg-[var(--surface-raised)] px-3 py-3 text-center">
                      <p className="font-display text-[1.4rem] font-bold leading-none text-[var(--text-primary)]">
                        {position.distanceKmToDropoff.toFixed(1)} km
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{copy(lang, 'to destination', 'गंतव्य तक')}</p>
                    </div>
                    <div className="rounded-2xl bg-[var(--brand-light)] px-3 py-3 text-center">
                      <p className="font-display text-[1.4rem] font-bold leading-none text-[var(--brand)]">
                        {etaLabel(position.distanceKmToDropoff)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand)]">{copy(lang, 'est. arrival', 'अनुमानित समय')}</p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Map', 'मैप')}</p>
              <p className="mt-0.5 font-medium text-[var(--text-primary)]">
                {mapTarget?.label
                  || (isBoarded
                    ? copy(lang, 'Route to your destination', 'आपके गंतव्य का मार्ग')
                    : copy(lang, 'Waiting for live location', 'लाइव लोकेशन की प्रतीक्षा'))}
              </p>
            </div>
            <div className="flex flex-col gap-1 text-right text-xs text-[var(--text-secondary)]">
              {hasDriver ? (
                <span>{copy(lang, 'Driver visible', 'ड्राइवर दिख रहा है')}</span>
              ) : null}
              {hasPickup ? (
                <span>{copy(lang, 'Pickup pinned', 'पिकअप पिन किया गया')}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
            {mapEmbedUrl ? (
              <iframe
                title="Trip tracking map"
                src={mapEmbedUrl}
                className="h-[320px] w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center px-6 text-center">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">
                    {copy(lang, 'Live location unavailable', 'लाइव लोकेशन उपलब्ध नहीं')}
                  </p>
                  <p className="mt-1 text-small text-[var(--text-secondary)]">
                    {loadError
                      ? copy(lang, 'Could not load trip data.', 'यात्रा डेटा लोड नहीं हो सका।')
                      : copy(lang, 'Driver has not started sharing yet.', 'ड्राइवर ने अभी शेयरिंग शुरू नहीं की है।')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(window.location.href)}>
              {copy(lang, 'Copy link', 'लिंक कॉपी करें')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!openMapsUrl}
              onClick={() => {
                if (!openMapsUrl) return;
                window.open(openMapsUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              {copy(lang, 'Open in Maps', 'मैप में खोलें')}
            </Button>
          </div>
        </section>
      </section>
    </main>
  );
}

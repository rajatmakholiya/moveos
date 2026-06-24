'use client';

import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/AuthContext';
import { useLanguage } from '../../../../lib/LanguageContext';
import { useToast } from '../../../../lib/ToastContext';
import { parseBooking, type Booking, type TripStatus, type BookingStatus } from '../../../../lib/pahadi';
import { copy, safeRecord } from '../../../../lib/utils';
import { TicketView } from '../../../../components/TicketView';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { Button } from '../../../../components/ui/Button';
import { SkeletonCard } from '../../../../components/ui/SkeletonCard';

const POLL_INTERVAL_MS = 30_000;

function TripProgressBar({ tripStatus, bookingStatus, lang }: { tripStatus: TripStatus; bookingStatus: BookingStatus; lang: 'en' | 'hi' }) {
  if (tripStatus === 'CANCELLED') {
    return (
      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-small font-medium text-red-700">
        {copy(lang, 'This trip has been cancelled.', 'यह यात्रा रद्द कर दी गई है।')}
      </div>
    );
  }

  if (bookingStatus === 'NO_SHOW') {
    return (
      <div className="mb-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-small font-medium text-stone-600">
        {copy(lang, 'You were marked as no-show for this trip.', 'इस यात्रा के लिए आपको अनुपस्थित चिह्नित किया गया है।')}
      </div>
    );
  }

  if (bookingStatus === 'COMPLETED') {
    return (
      <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-center text-small font-medium text-teal-700">
        {copy(lang, 'Trip completed. Thank you for travelling with us!', 'यात्रा पूर्ण हो गई। हमारे साथ यात्रा करने के लिए धन्यवाद!')}
      </div>
    );
  }

  const steps: { key: TripStatus; labelEn: string; labelHi: string }[] = [
    { key: 'OPEN', labelEn: 'Booked', labelHi: 'बुक' },
    { key: 'DEPARTED', labelEn: 'In progress', labelHi: 'यात्रा जारी' },
    { key: 'COMPLETED', labelEn: 'Completed', labelHi: 'पूर्ण' },
  ];

  const currentIdx = tripStatus === 'DEPARTED' ? 1 : tripStatus === 'COMPLETED' ? 2 : 0;

  return (
    <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
      <p className="mb-3 text-center text-small font-medium text-[var(--text-secondary)]">
        {copy(lang, 'Trip status', 'यात्रा की स्थिति')}
      </p>
      <div className="flex items-center">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {idx > 0 && (
                <div className={`h-0.5 flex-1 ${idx <= currentIdx ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
              )}
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-small font-medium ${idx <= currentIdx ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'}`}>
                {idx < currentIdx ? '✓' : idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div className={`h-0.5 flex-1 ${idx < currentIdx ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
              )}
            </div>
            <span className={`mt-1 text-center text-xs ${idx <= currentIdx ? 'font-medium text-[var(--brand)]' : 'text-[var(--text-secondary)]'}`}>
              {lang === 'hi' ? step.labelHi : step.labelEn}
            </span>
          </div>
        ))}
      </div>
      {tripStatus === 'DEPARTED' && (
        <p className="mt-3 text-center text-small text-[var(--text-secondary)]">
          {copy(lang, 'Your driver is on the way!', 'आपके ड्राइवर यात्रा पर हैं!')}
        </p>
      )}
    </div>
  );
}

export default function BookingConfirmationPage() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token } = useAuth();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [otpStatus, setOtpStatus] = useState<{ status: string; otp?: string } | null>(null);
  const [otpRefreshing, setOtpRefreshing] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastLocationPostRef = useRef(0);

  const loadBooking = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get<unknown>(`/bookings/${encodeURIComponent(params.bookingId)}`);
      setBooking(parseBooking(response));
    } catch {
      if (!silent) setBooking(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadBooking();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.bookingId]);

  // Poll booking status while trip is active
  useEffect(() => {
    const isActive = booking?.tripStatus === 'OPEN' || booking?.tripStatus === 'DEPARTED';
    if (!isActive) return;
    const interval = window.setInterval(() => void loadBooking(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.tripStatus, params.bookingId]);

  const refreshOtpStatus = useCallback(async () => {
    setOtpRefreshing(true);
    try {
      const res = await api.get<{ status: string; otp?: string }>(`/bookings/${encodeURIComponent(params.bookingId)}/pickup-otp-status`, token ?? undefined);
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
    const shouldLoadOtp = booking?.tripStatus === 'DEPARTED' && booking?.status === 'CONFIRMED' && !booking?.pickedUpAt;
    if (!shouldLoadOtp) {
      setOtpStatus(null);
      return;
    }
    void refreshOtpStatus();
  }, [booking?.pickedUpAt, booking?.status, booking?.tripStatus, refreshOtpStatus]);

  const shareTicket = async () => {
    if (!booking) return;
    const text = `${booking.code} · ${booking.from} to ${booking.to}`;
    if (navigator.share) {
      await navigator.share({ title: 'Pahadi Rides Ticket', text, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(copy(lang, 'Ticket link copied', 'टिकट लिंक कॉपी हो गया'));
    }
  };

  const downloadInvoice = async () => {
    if (!booking) return;
    setDownloadingInvoice(true);
    toast.error(copy(lang, 'Invoice download is not available from the gateway yet', 'गेटवे से इनवॉइस डाउनलोड अभी उपलब्ध नहीं है'));
    setDownloadingInvoice(false);
  };

  const stopLocationSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLocation(false);
  };

  const startLocationSharing = () => {
    if (!booking || !navigator.geolocation) {
      toast.error(copy(lang, 'Location is not available on this device', 'इस डिवाइस पर लोकेशन उपलब्ध नहीं है'));
      return;
    }
    const hiddenInterval = document.visibilityState === 'hidden' ? 60000 : 15000;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastLocationPostRef.current < hiddenInterval) return;
        lastLocationPostRef.current = now;
        void api.post('/telemetry/location', { lat: position.coords.latitude, lng: position.coords.longitude }, token ?? undefined);
      },
      () => {
        stopLocationSharing();
        toast.error(copy(lang, 'Location permission is required for sharing', 'लोकेशन शेयर करने के लिए अनुमति आवश्यक है'));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    setSharingLocation(true);
  };

  useEffect(() => stopLocationSharing, []);

  const addToCalendar = () => {
    if (!booking) return;
    const departure = new Date(booking.departureAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${departure}`,
      `SUMMARY:Pahadi Rides - ${booking.from} to ${booking.to}`,
      `DESCRIPTION:Booking ${booking.code} · ${booking.driverName} · ${booking.vehicleNumber}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${booking.code}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    const previous = booking;
    setBooking({ ...booking, status: 'CANCELLED' });
    try {
      await api.post(`/bookings/${encodeURIComponent(booking.id)}/cancel`, { reason: 'Plan changed' });
      toast.success(copy(lang, 'Booking cancelled', 'बुकिंग रद्द हो गई'));
      setCancelOpen(false);
    } catch {
      setBooking(previous);
      toast.error(copy(lang, 'Could not cancel booking', 'बुकिंग रद्द नहीं हो सकी'));
    } finally {
      setCancelling(false);
    }
  };

  const isDone = booking?.status === 'CANCELLED' || booking?.status === 'COMPLETED' || booking?.status === 'NO_SHOW' || booking?.tripStatus === 'CANCELLED';
  const canCancel = booking?.status === 'CONFIRMED' && (booking?.tripStatus === 'OPEN');

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <button type="button" onClick={() => router.push('/bookings')} className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]" aria-label={copy(lang, 'Back', 'वापस')}>
        ←
      </button>

      {sharingLocation && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--brand-light)] px-4 py-3 text-small font-medium text-[var(--brand)]">
          <span>{copy(lang, 'Sharing live location', 'लाइव लोकेशन शेयर हो रही है')}</span>
          <button type="button" onClick={stopLocationSharing} className="underline">
            {copy(lang, 'Stop', 'बंद करें')}
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonCard />
      ) : booking ? (
        <>
          {booking.tripStatus !== 'OPEN' || booking.status !== 'CONFIRMED' ? (
            <TripProgressBar tripStatus={booking.tripStatus} bookingStatus={booking.status} lang={lang} />
          ) : (
            <motion.div className="mb-5 flex justify-center" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35 }}>
              <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
                <circle cx="38" cy="38" r="34" fill="var(--brand-light)" />
                <motion.path d="M23 39L33 49L54 28" fill="none" stroke="var(--brand)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
              </svg>
            </motion.div>
          )}

          {/* OTP card — shown when driver has arrived and is waiting */}
          {otpStatus?.status === 'OTP_PENDING' && otpStatus.otp && (
            <div className="mb-5 rounded-2xl border-2 border-[var(--brand)] bg-[var(--brand-light)] p-5 text-center shadow-card">
              <p className="text-small font-medium text-[var(--brand)]">{copy(lang, 'Your driver is here! Share this code', 'आपका ड्राइवर पहुंच गया! यह कोड बताएं')}</p>
              <p className="mt-2 font-display text-[2.5rem] font-bold tracking-[0.4em] text-[var(--brand)]">{otpStatus.otp}</p>
              <p className="mt-1 text-xs text-[var(--brand)] opacity-70">{copy(lang, 'Tell this 6-digit code to your driver', 'यह 6 अंक का कोड अपने ड्राइवर को बताएं')}</p>
              <Button className="mt-4" size="sm" variant="secondary" loading={otpRefreshing} onClick={() => void refreshOtpStatus()}>
                {copy(lang, 'Refresh OTP', 'OTP रीफ्रेश करें')}
              </Button>
            </div>
          )}

          {/* Picked up confirmation */}
          {booking.pickedUpAt && booking.status === 'CONFIRMED' && (
            <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-center shadow-card">
              <p className="font-medium text-teal-700">{copy(lang, '✓ You have boarded', '✓ आप सवार हो गए हैं')}</p>
              <p className="mt-1 text-small text-teal-600">{copy(lang, 'Enjoy your journey!', 'यात्रा का आनंद लें!')}</p>
            </div>
          )}

          {/* Driver en-route status when trip is DEPARTED but no OTP yet */}
          {booking.tripStatus === 'DEPARTED' && booking.status === 'CONFIRMED' && !booking.pickedUpAt && otpStatus?.status === 'WAITING' && (
            <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-card">
              <p className="font-medium text-[var(--text-primary)]">{copy(lang, 'Driver is on the way to pick you up', 'ड्राइवर आपको लेने आ रहा है')}</p>
              <p className="mt-1 text-small text-[var(--text-secondary)]">{copy(lang, 'You\'ll see your OTP here when the driver arrives', 'ड्राइवर के पहुंचने पर OTP यहाँ दिखेगा')}</p>
              <Button className="mt-4" size="sm" variant="ghost" loading={otpRefreshing} onClick={() => void refreshOtpStatus()}>
                {copy(lang, 'Refresh OTP', 'OTP रीफ्रेश करें')}
              </Button>
            </div>
          )}

          <TicketView booking={booking} lang={lang} />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => void shareTicket()}>
              {copy(lang, 'Share ticket', 'टिकट शेयर करें')}
            </Button>
            <Button variant="ghost" loading={downloadingInvoice} onClick={() => void downloadInvoice()}>
              {copy(lang, 'Download invoice', 'इनवॉइस डाउनलोड करें')}
            </Button>
          </div>

          {!isDone && (
            <Button className="mt-3" fullWidth onClick={() => router.push(`/track/${booking.id}`)}>
              {copy(lang, 'Track live location', 'लाइव लोकेशन देखें')}
            </Button>
          )}

          {user?.role === 'DRIVER' ? (
            <Button className="mt-3" variant={sharingLocation ? 'danger' : 'secondary'} fullWidth onClick={sharingLocation ? stopLocationSharing : startLocationSharing}>
              {sharingLocation ? copy(lang, 'Stop sharing location', 'लोकेशन शेयरिंग बंद करें') : copy(lang, 'Share live location', 'लाइव लोकेशन शेयर करें')}
            </Button>
          ) : null}

          {booking.status === 'CONFIRMED' && (
            <Button className="mt-3" variant="ghost" fullWidth onClick={addToCalendar}>
              {copy(lang, 'Add to calendar', 'कैलेंडर में जोड़ें')}
            </Button>
          )}

          {booking.status === 'CANCELLED' && booking.paymentMethod === 'UPI' ? (
            <p className="mt-4 rounded-xl bg-[var(--amber-50)] px-4 py-3 text-small text-[var(--stone-800)]">{copy(lang, 'Refund timeline: UPI refunds usually settle in 3-5 business days.', 'रिफंड समय: UPI रिफंड आम तौर पर 3-5 कार्यदिवस में आता है।')}</p>
          ) : null}

          {canCancel ? (
            <button type="button" onClick={() => setCancelOpen(true)} className="mx-auto mt-6 block text-small font-medium text-[var(--red-600)]">
              {copy(lang, 'Cancel this booking', 'यह बुकिंग रद्द करें')}
            </button>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-card">
          <h1 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Booking unavailable', 'बुकिंग उपलब्ध नहीं')}</h1>
          <p className="mt-2 text-small text-[var(--text-secondary)]">{copy(lang, 'This booking could not be loaded.', 'यह बुकिंग लोड नहीं हो सकी।')}</p>
          <Button className="mt-5" onClick={() => router.push('/bookings')}>
            {copy(lang, 'Back to bookings', 'बुकिंग पर वापस')}
          </Button>
        </div>
      )}

      <BottomSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={copy(lang, 'Are you sure?', 'क्या आप निश्चित हैं?')}>
        <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'Your seat will be released.', 'आपकी सीट रिलीज़ हो जाएगी।')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="danger" loading={cancelling} onClick={() => void cancelBooking()}>
            {copy(lang, 'Yes, cancel', 'हाँ, रद्द करें')}
          </Button>
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>
            {copy(lang, 'Keep booking', 'बुकिंग रखें')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}

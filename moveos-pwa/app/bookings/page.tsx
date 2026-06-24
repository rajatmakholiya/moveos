'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { tx } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { parseBookings, type Booking } from '../../lib/pahadi';
import { copy, formatCurrency, formatDate, formatPhone, formatTime } from '../../lib/utils';
import { BookingCard } from '../../components/BookingCard';
import { Button } from '../../components/ui/Button';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { Pill } from '../../components/ui/Pill';
import { SkeletonCard } from '../../components/ui/SkeletonCard';

type BookingTab = 'ONGOING' | 'UPCOMING' | 'PAST';
type BookingType = 'SEATS' | 'FULL_VEHICLE';
type TransportRequest = {
  id: string;
  type: string;
  status: string;
  paymentStatus?: string;
  from: string;
  to: string;
  requestedFor: string;
  seats?: number;
  budgetPaise?: number;
  agreedAmountPaise?: number;
  acceptedByDriverId?: string;
  passengerName?: string;
  passengerPhone?: string;
  note?: string;
  driver?: { name?: string; phone?: string };
  vehicle?: { vehicleNumber?: string; plate?: string; vehicleType?: string; type?: string };
};

export default function MyBookingsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [tab, setTab] = useState<BookingTab>('UPCOMING');
  // Auto-switch to ONGOING if there are live trips on first load
  const [autoTabSet, setAutoTabSet] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>('SEATS');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Driver: selected seat booking for detail sheet
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  // Driver: selected full-vehicle request for detail sheet
  const [driverReviewRequest, setDriverReviewRequest] = useState<TransportRequest | null>(null);
  // Passenger: selected transport request for review sheet
  const [reviewRequest, setReviewRequest] = useState<TransportRequest | null>(null);
  const [collectingCash, setCollectingCash] = useState(false);
  const [completingRequest, setCompletingRequest] = useState(false);
  const touchStart = useRef<number | null>(null);

  const filteredBookings = useMemo(() => {
    const now = Date.now();
    return bookings.filter((booking) => {
      const departure = new Date(booking.departureAt).getTime();
      const isPast = !Number.isFinite(departure) || departure < now;
      const isOngoing = booking.tripStatus === 'DEPARTED' && booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED';
      const isTerminal = !isOngoing && (booking.status === 'COMPLETED' || booking.status === 'CANCELLED' || booking.tripStatus === 'COMPLETED' || booking.tripStatus === 'CANCELLED');

      if (tab === 'ONGOING') return isOngoing;
      if (tab === 'UPCOMING') return !isOngoing && !isTerminal && !isPast;
      return !isOngoing && (isPast || isTerminal);
    });
  }, [bookings, tab]);

  const ongoingCount = useMemo(
    () => bookings.filter((b) => b.tripStatus === 'DEPARTED' && b.status !== 'CANCELLED' && b.status !== 'COMPLETED').length,
    [bookings],
  );

  // Auto-switch to ONGOING tab on first load if there are live trips
  useEffect(() => {
    if (!autoTabSet && !loading && ongoingCount > 0) {
      setTab('ONGOING');
      setAutoTabSet(true);
    } else if (!autoTabSet && !loading) {
      setAutoTabSet(true);
    }
  }, [autoTabSet, loading, ongoingCount]);

  const filteredRequests = useMemo(() => {
    const now = Date.now();
    return requests.filter((request) => {
      const departure = new Date(request.requestedFor).getTime();
      const isTerminal = request.status === 'COMPLETED' || request.status === 'CANCELLED';
      if (tab === 'UPCOMING') {
        return departure >= now && !isTerminal;
      }
      return departure < now || isTerminal;
    });
  }, [requests, tab]);

  useEffect(() => {
    if (isReady && !user) {
      window.sessionStorage.setItem('pahadi_intended_url', '/bookings');
      router.replace('/onboarding');
    }
  }, [isReady, router, user]);

  const loadBookings = async (background = false) => {
    if (!token) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get<unknown>(user?.role === 'DRIVER' ? '/driver/bookings' : '/passenger/bookings', token);
      setBookings(parseBookings(response));
    } catch {
      setBookings([]);
    }
    try {
      if (user?.role === 'PASSENGER') {
        const [openRequests, acceptedRequests] = await Promise.all([
          api.get<{ data?: { requests?: TransportRequest[] }; requests?: TransportRequest[] }>('/requests?status=REQUESTED', token),
          api.get<{ data?: { requests?: TransportRequest[] }; requests?: TransportRequest[] }>('/requests?status=ACCEPTED', token),
        ]);
        setRequests([...readRequests(openRequests), ...readRequests(acceptedRequests)]);
      } else if (user?.role === 'DRIVER') {
        const acceptedRequests = await api.get<{ data?: { requests?: TransportRequest[] }; requests?: TransportRequest[] }>('/driver/requests?status=ACCEPTED', token);
        setRequests(readRequests(acceptedRequests));
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadBookings(); }, [token, user?.role]);

  const handleTouchMove = (clientY: number) => {
    if (touchStart.current !== null && clientY - touchStart.current > 60 && !refreshing) {
      touchStart.current = null;
      void loadBookings(true);
    }
  };

  const handleCollectCash = async () => {
    if (!selectedBooking || !token) return;
    setCollectingCash(true);
    try {
      await api.post(`/driver/bookings/${encodeURIComponent(selectedBooking.id)}/collect-cash`, {}, token);
      // Update local state optimistically
      setBookings((prev) => prev.map((b) =>
        b.id === selectedBooking.id
          ? { ...b, paymentStatus: 'PAID', status: 'COMPLETED' }
          : b,
      ));
      setSelectedBooking(null);
    } catch {
      // leave sheet open so driver can retry
    } finally {
      setCollectingCash(false);
    }
  };

  const handleCompleteRequest = async (request: TransportRequest) => {
    if (!token) return;
    setCompletingRequest(true);
    try {
      await api.post(`/driver/requests/${encodeURIComponent(request.id)}/complete`, {}, token);
      setRequests((prev) => prev.map((r) =>
        r.id === request.id ? { ...r, status: 'COMPLETED', paymentStatus: 'PAID' } : r,
      ));
      setDriverReviewRequest(null);
    } catch {
      // leave sheet open so driver can retry
    } finally {
      setCompletingRequest(false);
    }
  };

  const isDriver = user?.role === 'DRIVER';

  return (
    <main
      className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5"
      onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientY ?? null; }}
      onTouchMove={(e) => handleTouchMove(e.touches[0]?.clientY ?? 0)}
      onTouchEnd={() => { touchStart.current = null; }}
    >
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title text-[var(--text-primary)]">{tx('myBookings', lang)}</h1>
        <LanguageToggle />
      </header>

      {/* Driver: booking type toggle (Seats vs Full Vehicle) */}
      {isDriver ? (
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-[var(--surface-inset)] p-1">
          {(['SEATS', 'FULL_VEHICLE'] as BookingType[]).map((type) => (
            <button key={type} type="button" onClick={() => setBookingType(type)} className={['rounded-lg px-4 py-2 text-small font-medium transition-colors', bookingType === type ? 'bg-[var(--surface)] text-[var(--brand)] shadow-card' : 'text-[var(--text-secondary)]'].join(' ')}>
              {type === 'SEATS' ? copy(lang, 'Seat bookings', 'सीट बुकिंग') : copy(lang, 'Full vehicle', 'पूरा वाहन')}
            </button>
          ))}
        </div>
      ) : null}

      {/* Ongoing / Upcoming / Past tabs */}
      <div className="mt-3 grid grid-cols-3 rounded-xl bg-[var(--surface-inset)] p-1">
        {(['ONGOING', 'UPCOMING', 'PAST'] as BookingTab[]).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={['relative rounded-lg px-2 py-2 text-small font-medium transition-colors', tab === item ? 'bg-[var(--surface)] text-[var(--brand)] shadow-card' : 'text-[var(--text-secondary)]'].join(' ')}>
            {item === 'ONGOING' ? copy(lang, 'Ongoing', 'जारी') : item === 'UPCOMING' ? copy(lang, 'Upcoming', 'आने वाली') : copy(lang, 'Past', 'पिछली')}
            {item === 'ONGOING' && ongoingCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-bold text-white">
                {ongoingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {refreshing ? <p className="mt-3 text-center text-small text-[var(--text-secondary)]">{copy(lang, 'Refreshing...', 'रीफ्रेश हो रहा है...')}</p> : null}

      {/* Passenger: transport requests banner (always visible for passengers) */}
      {!isDriver && requests.length > 0 ? (
        <section className="mt-5">
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-card">
            <div>
              <p className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Vehicle requests', 'वाहन रिक्वेस्ट')}</p>
              <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Full vehicle bookings', 'पूरे वाहन की बुकिंग')}</p>
            </div>
            <Pill color="amber" label={`${requests.length}`} />
          </div>
          <div className="mt-3 space-y-3">
            {requests.map((request) => (
              <RequestStatusCard
                key={request.id}
                request={request}
                lang={lang}
                isDriver={false}
                onReview={() => setReviewRequest(request)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Driver: Full Vehicle tab */}
      {isDriver && bookingType === 'FULL_VEHICLE' ? (
        <section className="mt-5 space-y-3">
          {loading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : filteredRequests.length > 0 ? (
            filteredRequests.map((request) => (
              <RequestStatusCard
                key={request.id}
                request={request}
                lang={lang}
                isDriver={true}
                onReview={() => setDriverReviewRequest(request)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-card">
              <p className="font-display text-heading text-[var(--text-primary)]">
                {tab === 'UPCOMING' ? copy(lang, 'No upcoming vehicle bookings', 'कोई आगामी वाहन बुकिंग नहीं') : copy(lang, 'No past vehicle bookings', 'कोई पिछली वाहन बुकिंग नहीं')}
              </p>
            </div>
          )}
        </section>
      ) : null}

      {/* Seat bookings (driver: SEATS tab; passenger: always) */}
      {(!isDriver || bookingType === 'SEATS') ? (
        <section className="mt-5 space-y-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredBookings.length > 0 ? (
            filteredBookings.map((booking) => {
              const isOngoing = booking.tripStatus === 'DEPARTED' && booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED';
              return (
                <div key={booking.id} className="space-y-2">
                  {isOngoing && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                        <span className="text-small font-medium text-amber-800">{copy(lang, 'Trip in progress', 'यात्रा जारी है')}</span>
                      </div>
                      {!isDriver && (
                        <button
                          type="button"
                          onClick={() => router.push(`/track/${booking.id}`)}
                          className="text-small font-medium text-[var(--brand)]"
                        >
                          {copy(lang, 'Track live →', 'लाइव ट्रैक करें →')}
                        </button>
                      )}
                      {isDriver && (
                        <button
                          type="button"
                          onClick={() => router.push(`/driver/trips/${booking.tripId}/manifest`)}
                          className="text-small font-medium text-[var(--brand)]"
                        >
                          {copy(lang, 'Manifest →', 'मैनिफेस्ट →')}
                        </button>
                      )}
                    </div>
                  )}
                  <BookingCard
                    booking={booking}
                    lang={lang}
                    actionLabel={isDriver ? copy(lang, 'View request', 'रिक्वेस्ट देखें') : undefined}
                    onView={(item) => {
                      if (isDriver) { setSelectedBooking(item); return; }
                      router.push(`/bookings/${item.id}/confirm`);
                    }}
                  />
                </div>
              );
            })
          ) : (
            <EmptyBookings lang={lang} onSearch={() => router.push('/')} />
          )}
        </section>
      ) : null}

      {/* Driver: seat booking detail + cash collection */}
      <BottomSheet
        open={selectedBooking !== null}
        onClose={() => setSelectedBooking(null)}
        title={copy(lang, 'Booking details', 'बुकिंग विवरण')}
      >
        {selectedBooking ? (
          <DriverBookingDetailSheet
            booking={selectedBooking}
            lang={lang}
            collectingCash={collectingCash}
            onCollectCash={() => void handleCollectCash()}
          />
        ) : null}
      </BottomSheet>

      {/* Driver: full-vehicle request detail + complete */}
      <BottomSheet
        open={driverReviewRequest !== null}
        onClose={() => setDriverReviewRequest(null)}
        title={copy(lang, 'Request details', 'रिक्वेस्ट विवरण')}
      >
        {driverReviewRequest ? (
          <DriverRequestDetailSheet
            request={driverReviewRequest}
            lang={lang}
            completing={completingRequest}
            onComplete={() => void handleCompleteRequest(driverReviewRequest)}
          />
        ) : null}
      </BottomSheet>

      {/* Passenger: transport request review */}
      <BottomSheet
        open={reviewRequest !== null}
        onClose={() => setReviewRequest(null)}
        title={copy(lang, 'Booking details', 'बुकिंग विवरण')}
      >
        {reviewRequest ? <BookingReviewSheet request={reviewRequest} lang={lang} /> : null}
      </BottomSheet>
    </main>
  );
}

// ─── Driver seat booking detail sheet ────────────────────────────────────────

function DriverBookingDetailSheet({
  booking,
  lang,
  collectingCash,
  onCollectCash,
}: {
  booking: Booking;
  lang: 'en' | 'hi';
  collectingCash: boolean;
  onCollectCash: () => void;
}) {
  const isCashPending = booking.paymentMethod === 'CASH' && booking.paymentStatus === 'PENDING' && booking.status === 'CONFIRMED';
  const isCompleted = booking.status === 'COMPLETED';

  return (
    <div className="space-y-4 pb-2">
      {/* Passenger */}
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {copy(lang, 'Passenger', 'यात्री')}
        </h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Name', 'नाम')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{booking.passengerName}</span>
          {booking.phone ? (
            <>
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Phone', 'फोन')}</span>
              <a href={`tel:${booking.phone}`} className="text-right font-medium text-[var(--brand)]">
                {formatPhone(booking.phone)}
              </a>
            </>
          ) : null}
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Booking code', 'कोड')}</span>
          <span className="text-right font-mono text-[var(--text-primary)]">{booking.code}</span>
        </div>
      </div>

      {/* Trip */}
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {copy(lang, 'Trip', 'यात्रा')}
        </h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Route', 'रूट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{booking.from} → {booking.to}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Date', 'तारीख')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatDate(booking.departureAt, lang)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Time', 'समय')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatTime(booking.departureAt, lang)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Seat', 'सीट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">
            {booking.seatType === 'FRONT' ? copy(lang, 'Front', 'आगे') : copy(lang, 'Back', 'पीछे')}
          </span>
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {copy(lang, 'Payment', 'भुगतान')}
        </h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Fare', 'किराया')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(booking.totalPaise)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Method', 'तरीका')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">
            {booking.paymentMethod === 'UPI' ? 'UPI' : copy(lang, 'Cash', 'नकद')}
          </span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Status', 'स्थिति')}</span>
          <span className={`text-right font-medium ${booking.paymentStatus === 'PAID' ? 'text-[var(--brand)]' : 'text-amber-600'}`}>
            {booking.paymentStatus === 'PAID' ? copy(lang, 'Collected', 'जमा') : copy(lang, 'Pending', 'बाकी')}
          </span>
        </div>
      </div>

      {/* Cash collection CTA */}
      {isCashPending && (
        <Button
          fullWidth
          loading={collectingCash}
          onClick={onCollectCash}
        >
          {copy(lang, `Collect `, 'नकद लें ')}
          {formatCurrency(booking.totalPaise)}
          {copy(lang, ' cash', ' नकद')}
        </Button>
      )}

      {/* Already paid */}
      {booking.paymentStatus === 'PAID' && booking.paymentMethod === 'CASH' && (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-center text-small font-medium text-teal-700">
          {copy(lang, 'Cash collected ✓', 'नकद जमा हो गया ✓')}
        </div>
      )}

      {booking.paymentMethod === 'UPI' && booking.paymentStatus === 'PAID' && (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-center text-small font-medium text-teal-700">
          {copy(lang, 'Paid via UPI ✓', 'UPI से भुगतान ✓')}
        </div>
      )}

      {booking.paymentMethod === 'UPI' && booking.paymentStatus !== 'PAID' && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-center text-small text-amber-700">
          {copy(lang, 'UPI payment pending — passenger needs to complete payment in the app.', 'UPI भुगतान बाकी है — यात्री को ऐप में भुगतान पूरा करना होगा।')}
        </div>
      )}

      {isCompleted && (
        <div className="rounded-xl bg-[var(--brand-light)] px-4 py-3 text-center text-small font-medium text-[var(--brand)]">
          {copy(lang, 'Journey completed ✓', 'यात्रा पूर्ण ✓')}
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function readRequests(payload: { data?: { requests?: TransportRequest[] }; requests?: TransportRequest[] }) {
  if (Array.isArray(payload.data?.requests)) return payload.data.requests;
  if (Array.isArray(payload.requests)) return payload.requests;
  return [];
}

function RequestStatusCard({
  request,
  lang,
  isDriver,
  onReview,
}: {
  request: TransportRequest;
  lang: 'en' | 'hi';
  isDriver: boolean;
  onReview: () => void;
}) {
  const accepted = request.status === 'ACCEPTED';
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-heading text-[var(--text-primary)]">{request.from} → {request.to}</h2>
          <p className="text-small text-[var(--text-secondary)]">{formatDate(request.requestedFor, lang)} · {request.seats ?? '-'} {copy(lang, 'seat(s)', 'सीट')}</p>
        </div>
        <Pill color={accepted ? 'teal' : 'amber'} label={accepted ? copy(lang, 'Accepted', 'स्वीकार') : copy(lang, 'Requested', 'रिक्वेस्टेड')} />
      </div>

      {isDriver && accepted ? (
        // Driver sees passenger details after accepting
        <div className="mt-4 rounded-xl bg-[var(--surface-raised)] p-4 text-small">
          {request.passengerName ? (
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Passenger', 'यात्री')}</span>
              <span className="text-right font-medium text-[var(--text-primary)]">{request.passengerName}</span>
              {request.passengerPhone ? (
                <>
                  <span className="text-[var(--text-secondary)]">{copy(lang, 'Phone', 'फोन')}</span>
                  <a href={`tel:${request.passengerPhone}`} className="text-right font-medium text-[var(--brand)]">{formatPhone(request.passengerPhone)}</a>
                </>
              ) : null}
              {typeof request.budgetPaise === 'number' ? (
                <>
                  <span className="text-[var(--text-secondary)]">{copy(lang, 'Budget', 'बजट')}</span>
                  <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(request.budgetPaise)}</span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-[var(--text-secondary)]">{copy(lang, 'Passenger details will appear here.', 'यात्री विवरण यहाँ दिखेगा।')}</p>
          )}
        </div>
      ) : !isDriver && accepted ? (
        // Passenger sees driver/vehicle details
        <div className="mt-4 rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
          <p><span className="font-medium text-[var(--text-primary)]">{copy(lang, 'Driver', 'ड्राइवर')}:</span> {request.driver?.name ?? copy(lang, 'Assigned', 'असाइन')}</p>
          <p><span className="font-medium text-[var(--text-primary)]">{copy(lang, 'Vehicle', 'वाहन')}:</span> {request.vehicle?.vehicleNumber ?? request.vehicle?.plate ?? request.vehicle?.vehicleType ?? request.vehicle?.type ?? '-'}</p>
        </div>
      ) : !accepted ? (
        <p className="mt-3 text-small text-[var(--text-secondary)]">{copy(lang, 'Waiting for a driver to accept this request.', 'ड्राइवर के स्वीकार करने का इंतजार है।')}</p>
      ) : null}

      {accepted && (
        <button type="button" onClick={onReview} className="mt-3 flex w-full items-center justify-between rounded-xl bg-[var(--brand)] px-4 py-3 text-small font-medium text-white">
          <span>{copy(lang, 'View booking details', 'बुकिंग विवरण देखें')}</span>
          <span>→</span>
        </button>
      )}
    </article>
  );
}

// ─── Driver full-vehicle request detail sheet ─────────────────────────────────

const COMPLETE_GATE_MS = 30 * 60 * 1000;

function DriverRequestDetailSheet({
  request,
  lang,
  completing,
  onComplete,
}: {
  request: TransportRequest;
  lang: 'en' | 'hi';
  completing: boolean;
  onComplete: () => void;
}) {
  const isCompleted = request.status === 'COMPLETED';
  const departureAt = new Date(request.requestedFor).getTime();
  const withinWindow = Date.now() >= departureAt - COMPLETE_GATE_MS;
  const canComplete = request.status === 'ACCEPTED' && withinWindow;
  const tooEarly = request.status === 'ACCEPTED' && !withinWindow;
  const amountPaise = request.agreedAmountPaise ?? request.budgetPaise;

  return (
    <div className="space-y-4 pb-2">
      {/* Passenger */}
      {(request.passengerName || request.passengerPhone) ? (
        <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
          <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {copy(lang, 'Passenger', 'यात्री')}
          </h3>
          <div className="grid grid-cols-2 gap-y-2">
            {request.passengerName ? (
              <>
                <span className="text-[var(--text-secondary)]">{copy(lang, 'Name', 'नाम')}</span>
                <span className="text-right font-medium text-[var(--text-primary)]">{request.passengerName}</span>
              </>
            ) : null}
            {request.passengerPhone ? (
              <>
                <span className="text-[var(--text-secondary)]">{copy(lang, 'Phone', 'फोन')}</span>
                <a href={`tel:${request.passengerPhone}`} className="text-right font-medium text-[var(--brand)]">
                  {formatPhone(request.passengerPhone)}
                </a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Trip */}
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {copy(lang, 'Trip', 'यात्रा')}
        </h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Route', 'रूट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{request.from} → {request.to}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Date', 'तारीख')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatDate(request.requestedFor, lang)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Time', 'समय')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatTime(request.requestedFor, lang)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Seats', 'सीट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{request.seats ?? '-'}</span>
          {typeof amountPaise === 'number' ? (
            <>
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Amount', 'राशि')}</span>
              <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(amountPaise)}</span>
            </>
          ) : null}
          {request.note ? (
            <>
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Note', 'नोट')}</span>
              <span className="text-right font-medium text-[var(--text-primary)]">{request.note}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* CTA */}
      {canComplete ? (
        <Button fullWidth loading={completing} onClick={onComplete}>
          {typeof amountPaise === 'number'
            ? `${copy(lang, 'Collect ', 'नकद लें ')}${formatCurrency(amountPaise)}${copy(lang, ' & complete journey', ' और यात्रा पूर्ण करें')}`
            : copy(lang, 'Mark journey complete', 'यात्रा पूर्ण करें')}
        </Button>
      ) : null}

      {tooEarly ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-center text-small text-amber-700">
          {copy(lang, 'You can only complete this journey from 30 minutes before the scheduled departure.', 'यात्रा को निर्धारित प्रस्थान से 30 मिनट पहले से ही पूर्ण किया जा सकता है।')}
        </div>
      ) : null}

      {isCompleted ? (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-center text-small font-medium text-teal-700">
          {copy(lang, 'Journey completed ✓', 'यात्रा पूर्ण ✓')}
        </div>
      ) : null}
    </div>
  );
}

// ─── Passenger transport request review sheet ─────────────────────────────────

function BookingReviewSheet({ request, lang }: { request: TransportRequest; lang: 'en' | 'hi' }) {
  const driver = request.driver;
  const vehicle = request.vehicle;
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
        <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{copy(lang, 'Trip', 'यात्रा')}</h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Route', 'रूट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{request.from} → {request.to}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Date', 'तारीख')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{formatDate(request.requestedFor, lang)}</span>
          <span className="text-[var(--text-secondary)]">{copy(lang, 'Seats', 'सीट')}</span>
          <span className="text-right font-medium text-[var(--text-primary)]">{request.seats ?? '-'}</span>
          {typeof request.budgetPaise === 'number' ? (
            <>
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Budget', 'बजट')}</span>
              <span className="text-right font-medium text-[var(--text-primary)]">{formatCurrency(request.budgetPaise)}</span>
            </>
          ) : null}
          {request.note ? (
            <>
              <span className="text-[var(--text-secondary)]">{copy(lang, 'Note', 'नोट')}</span>
              <span className="text-right font-medium text-[var(--text-primary)]">{request.note}</span>
            </>
          ) : null}
        </div>
      </div>
      {driver ? (
        <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
          <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{copy(lang, 'Driver', 'ड्राइवर')}</h3>
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-[var(--text-secondary)]">{copy(lang, 'Name', 'नाम')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{driver.name ?? copy(lang, 'Assigned', 'असाइन')}</span>
            {driver.phone ? (
              <>
                <span className="text-[var(--text-secondary)]">{copy(lang, 'Phone', 'फोन')}</span>
                <a href={`tel:${driver.phone}`} className="text-right font-medium text-[var(--brand)]">{driver.phone}</a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {vehicle ? (
        <div className="rounded-xl bg-[var(--surface-raised)] p-4 text-small">
          <h3 className="mb-3 font-display text-small font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{copy(lang, 'Vehicle', 'वाहन')}</h3>
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-[var(--text-secondary)]">{copy(lang, 'Plate', 'नंबर')}</span>
            <span className="text-right font-medium text-[var(--text-primary)]">{vehicle.vehicleNumber ?? vehicle.plate ?? '-'}</span>
            {(vehicle.vehicleType ?? vehicle.type) ? (
              <>
                <span className="text-[var(--text-secondary)]">{copy(lang, 'Type', 'प्रकार')}</span>
                <span className="text-right font-medium text-[var(--text-primary)]">{String(vehicle.vehicleType ?? vehicle.type)}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyBookings({ lang, onSearch }: { lang: 'en' | 'hi'; onSearch: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-card">
      <svg viewBox="0 0 220 120" className="mx-auto h-28 w-56" aria-hidden="true">
        <path d="M14 82L76 28L116 70L154 24L206 82H14Z" fill="var(--teal-50)" />
        <path d="M24 108C72 86 142 86 202 104" stroke="var(--stone-300)" strokeWidth="8" strokeLinecap="round" />
        <rect x="88" y="76" width="54" height="24" rx="8" fill="var(--brand)" />
      </svg>
      <h2 className="font-display text-heading text-[var(--text-primary)]">{tx('myBookingsEmpty', lang)}</h2>
      <p className="mt-1 text-small text-[var(--text-secondary)]">{tx('myBookingsEmptyHint', lang)}</p>
      <Button className="mt-5" onClick={onSearch}>
        {copy(lang, 'Search seats', 'सीट खोजें')}
      </Button>
    </div>
  );
}

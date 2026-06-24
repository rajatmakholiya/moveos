'use client';

import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/AuthContext';
import { useLanguage } from '../../../../lib/LanguageContext';
import { useToast } from '../../../../lib/ToastContext';
import { bookingFormStorageKey, parseTrip, type PaymentMethod, type SeatType, type Trip } from '../../../../lib/pahadi';
import { copy, formatCurrency, formatPhone, formatTime, readNumber, readString, safeRecord } from '../../../../lib/utils';
import { FareSummary } from '../../../../components/FareSummary';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';

type LuggageSize = 'SMALL' | 'LARGE' | 'OVERSIZED';

type ExtraPassenger = { name: string; phone: string; seatType: SeatType };
type Coordinate = { lat: number; lng: number };
type PlaceResult = { id: string; label: string; address: string; lat: number; lng: number };

type BookingFormState = {
  passengerName: string;
  phone: string;
  pickupQuery: string;
  dropoffQuery: string;
  pickupPlaceId: string;
  dropoffPlaceId: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  emergencyContact: string;
  gstin: string;
  luggageSize: LuggageSize;
  paymentMethod: PaymentMethod;
  showGstin: boolean;
  extraPassengers: ExtraPassenger[];
};

type RazorpayInstance = {
  open: () => void;
};

type RazorpayConstructor = new (options: {
  key?: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  name: string;
  description: string;
  handler: (response: { razorpay_payment_id?: string; razorpay_signature?: string }) => void;
  prefill: { name: string; contact: string };
  modal: { ondismiss: () => void };
}) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const defaultForm: BookingFormState = {
  passengerName: '',
  phone: '',
  pickupQuery: '',
  dropoffQuery: '',
  pickupPlaceId: '',
  dropoffPlaceId: '',
  emergencyContact: '',
  gstin: '',
  luggageSize: 'SMALL',
  paymentMethod: 'CASH',
  showGstin: false,
  extraPassengers: [],
};

const DEFAULT_LUGGAGE_SURCHARGES: Record<LuggageSize, number> = {
  SMALL: 0,
  LARGE: 5000,
  OVERSIZED: 15000,
};

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(-10);
}

function seatFare(seatType: SeatType, trip: Trip) {
  return seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise;
}

export default function BookingFormPage() {
  const params = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const toast = useToast();
  const tripId = params.tripId;
  const seatType: SeatType = searchParams.get('seatType') === 'FRONT' ? 'FRONT' : 'BACK';

  // Initialize synchronously from sessionStorage so data survives login redirect
  const [form, setForm] = useState<BookingFormState>(() => {
    if (typeof window === 'undefined') return defaultForm;
    try {
      const raw = window.sessionStorage.getItem(bookingFormStorageKey(tripId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BookingFormState>;
        // Ensure extra passengers have seatType (backward-compat with cached data)
        if (parsed.extraPassengers) {
          parsed.extraPassengers = parsed.extraPassengers.map((p) => ({
            name: p.name ?? '',
            phone: p.phone ?? '',
            seatType: (p as ExtraPassenger).seatType ?? seatType,
          }));
        }
        return { ...defaultForm, ...parsed };
      }
    } catch { /* ignore */ }
    return defaultForm;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [tripError, setTripError] = useState('');
  const [pickupOptions, setPickupOptions] = useState<PlaceResult[]>([]);
  const [dropoffOptions, setDropoffOptions] = useState<PlaceResult[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [tripCancelled, setTripCancelled] = useState(false);
  const pickupSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropoffSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRequestIdRef = useRef({ pickup: 0, dropoff: 0 });
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [luggageSurcharges, setLuggageSurcharges] = useState(DEFAULT_LUGGAGE_SURCHARGES);

  const storageKey = bookingFormStorageKey(tripId);

  // Pre-fill name/phone from logged-in user only when form is otherwise empty
  useEffect(() => {
    if (!user) return;
    setForm((current) => {
      if (current.passengerName || current.phone) return current;
      return {
        ...current,
        passengerName: user.name ?? current.passengerName,
        phone: user.phone ? formatPhone(user.phone) : current.phone,
      };
    });
  }, [user]);

  // Persist form to sessionStorage on every change
  useEffect(() => {
    window.sessionStorage.setItem(storageKey, JSON.stringify(form));
  }, [form, storageKey]);

  useEffect(() => {
    let active = true;

    async function loadTrip() {
      setTripLoading(true);
      setTripError('');
      try {
        const response = await api.get<unknown>(`/trips/${encodeURIComponent(tripId)}`);
        if (active) {
          const parsed = parseTrip(response);
          setTrip(parsed);
          if (!parsed) {
            setTripError(copy(lang, 'This trip is not available for booking.', 'यह यात्रा बुकिंग के लिए उपलब्ध नहीं है।'));
          }
        }
      } catch {
        if (active) {
          setTrip(null);
          setTripError(copy(lang, 'Could not load this trip. Please search again.', 'यह यात्रा लोड नहीं हो सकी। फिर खोजें।'));
        }
      } finally {
        if (active) {
          setTripLoading(false);
        }
      }
    }

    void loadTrip();
    return () => {
      active = false;
    };
  }, [lang, tripId]);

  useEffect(() => {
    api.get<{ luggageSurcharges?: Partial<Record<LuggageSize, number>> }>('/fares/config')
      .then((config) => {
        if (config.luggageSurcharges) {
          setLuggageSurcharges({ ...DEFAULT_LUGGAGE_SURCHARGES, ...config.luggageSurcharges });
        }
      })
      .catch(() => { /* fall back to DEFAULT_LUGGAGE_SURCHARGES */ });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => { /* user can still type and use route-biased search */ },
      { maximumAge: 60_000, timeout: 5_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(pickupSearchDebounceRef.current);
      clearTimeout(dropoffSearchDebounceRef.current);
    };
  }, []);

  // Fare calculation: primary seat + each extra passenger's chosen seat + luggage
  const primaryFare = trip ? seatFare(seatType, trip) : 0;
  const validExtra = useMemo(
    () => form.extraPassengers.filter((p) => p.name.trim().length >= 2 && normalizePhone(p.phone).length === 10),
    [form.extraPassengers],
  );
  const extraFaresPaise = useMemo(
    () => form.extraPassengers.reduce((sum, p) => sum + (trip ? seatFare(p.seatType, trip) : 0), 0),
    [form.extraPassengers, trip],
  );
  const surcharge = luggageSurcharges[form.luggageSize];
  const totalPaise = primaryFare + extraFaresPaise + surcharge;

  const seatLabel = (st: SeatType) => st === 'FRONT' ? copy(lang, 'Front seat', 'आगे की सीट') : copy(lang, 'Back seat', 'पीछे की सीट');
  const primarySeatLabel = seatLabel(seatType);
  const luggageLabel = useMemo(() => {
    if (form.luggageSize === 'LARGE') {
      return copy(lang, 'Large bag surcharge', 'बड़े बैग का शुल्क');
    }
    if (form.luggageSize === 'OVERSIZED') {
      return copy(lang, 'Oversized luggage surcharge', 'बड़े सामान का शुल्क');
    }
    return copy(lang, 'Small bag', 'छोटा बैग');
  }, [form.luggageSize, lang]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const name = form.passengerName.trim();
    if (!name) {
      nextErrors.passengerName = copy(lang, 'Passenger name is required', 'यात्री का नाम आवश्यक है');
    } else if (name.length < 2 || name.length > 60 || /\d/.test(name)) {
      nextErrors.passengerName = copy(lang, 'Enter a valid name', 'वैध नाम दर्ज करें');
    }

    if (normalizePhone(form.phone).length !== 10) {
      nextErrors.phone = copy(lang, 'Enter a valid 10-digit mobile number', 'वैध 10 अंकों का नंबर दर्ज करें');
    }

    if (form.emergencyContact && normalizePhone(form.emergencyContact).length !== 10) {
      nextErrors.emergencyContact = copy(lang, 'Enter a valid emergency contact', 'वैध आपातकालीन नंबर दर्ज करें');
    }

    if (!form.pickupQuery.trim()) {
      nextErrors.pickupQuery = copy(lang, 'Pickup point is required', 'पिकअप पॉइंट जरूरी है');
    }

    if (!form.dropoffQuery.trim()) {
      nextErrors.dropoffQuery = copy(lang, 'Drop point is required', 'ड्रॉप पॉइंट जरूरी है');
    }

    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin.toUpperCase())) {
      nextErrors.gstin = copy(lang, 'Enter a valid GSTIN', 'वैध GSTIN दर्ज करें');
    }

    form.extraPassengers.forEach((p, i) => {
      if (!p.name.trim()) {
        nextErrors[`ep${i}_name`] = copy(lang, 'Name is required', 'नाम जरूरी है');
      } else if (p.name.trim().length < 2 || /\d/.test(p.name.trim())) {
        nextErrors[`ep${i}_name`] = copy(lang, 'Enter a valid name', 'वैध नाम दर्ज करें');
      }
      if (normalizePhone(p.phone).length !== 10) {
        nextErrors[`ep${i}_phone`] = copy(lang, 'Enter a valid 10-digit number', 'वैध 10 अंकों का नंबर दर्ज करें');
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const searchPlaces = async (kind: 'pickup' | 'dropoff', query: string) => {
    const requestId = searchRequestIdRef.current[kind] + 1;
    searchRequestIdRef.current[kind] = requestId;

    if (!trip || query.trim().length < 2) {
      kind === 'pickup' ? setPickupOptions([]) : setDropoffOptions([]);
      return;
    }

    const params = new URLSearchParams({
      q: query,
      routeId: trip.routeId,
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

    try {
      const response = await api.get<{ data?: { places?: PlaceResult[] } }>(`/geo/search?${params.toString()}`);
      if (searchRequestIdRef.current[kind] !== requestId) return;
      if (kind === 'pickup') {
        setPickupOptions(response.data?.places ?? []);
      } else {
        setDropoffOptions(response.data?.places ?? []);
      }
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

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      setCurrentLocation({ lat: latitude, lng: longitude });
      const response = await api.get<{ data?: { place?: { id: string; label: string; address: string; lat: number; lng: number } } }>(`/geo/reverse?lat=${latitude}&lng=${longitude}`);
      const place = response.data?.place;
      if (!place) {
        return;
      }
      setForm((current) => ({
        ...current,
        pickupQuery: place.label,
        pickupPlaceId: place.id,
        pickupLat: place.lat,
        pickupLng: place.lng,
      }));
    });
  };

  const openRazorpay = (bookingId: string, confirmedTotalPaise: number, response: unknown) => {
    const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!razorpayKey) {
      const isDev = process.env.NODE_ENV !== 'production';
      toast.error(
        isDev
          ? 'Razorpay key is missing. Set NEXT_PUBLIC_RAZORPAY_KEY_ID.'
          : copy(lang, 'Payment service is temporarily unavailable. Please try again later.', 'भुगतान सेवा अभी उपलब्ध नहीं है। कृपया बाद में प्रयास करें।'),
      );
      setLoading(false);
      return;
    }

    if (!window.Razorpay) {
      router.replace(`/bookings/${bookingId}/confirm`);
      return;
    }
    const responseRecord = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
    const razorpayOrder = typeof responseRecord.razorpayOrder === 'object' && responseRecord.razorpayOrder !== null ? (responseRecord.razorpayOrder as Record<string, unknown>) : {};
    const orderId = typeof razorpayOrder.orderId === 'string' ? razorpayOrder.orderId : readString(response, ['razorpayOrderId', 'orderId']);

    const checkout = new window.Razorpay({
      key: razorpayKey,
      amount: confirmedTotalPaise,
      currency: 'INR',
      order_id: orderId,
      name: 'Pahadi Rides',
      description: trip ? `${trip.from} to ${trip.to}` : 'MoveOS booking',
      prefill: { name: form.passengerName, contact: normalizePhone(form.phone) },
      handler: async (paymentResponse) => {
        try {
          await api.post(
            `/bookings/${encodeURIComponent(bookingId)}/payment-confirm`,
            {
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
            },
            token ?? undefined,
          );
        } finally {
          router.replace(`/bookings/${bookingId}/confirm`);
        }
      },
      modal: {
        ondismiss: () => setLoading(false),
      },
    });
    checkout.open();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate() || !trip) {
      return;
    }

    if (isReady && !token) {
      window.sessionStorage.setItem('pahadi_intended_url', window.location.pathname + window.location.search);
      setAuthSheetOpen(true);
      return;
    }

    setLoading(true);

    try {
      const sharedPayload = {
        tripId,
        emergencyContact: form.emergencyContact ? `+91${normalizePhone(form.emergencyContact)}` : undefined,
        gstin: form.gstin ? form.gstin.toUpperCase() : undefined,
        luggageSize: form.luggageSize,
        paymentMethod: form.paymentMethod,
        pickup: { placeId: form.pickupPlaceId, label: form.pickupQuery.trim(), lat: form.pickupLat, lng: form.pickupLng },
        dropoff: { placeId: form.dropoffPlaceId, label: form.dropoffQuery.trim(), lat: form.dropoffLat, lng: form.dropoffLng },
      };

      const allPassengers = [
        { name: form.passengerName.trim(), phone: `+91${normalizePhone(form.phone)}`, seatType },
        ...validExtra.map((p) => ({ name: p.name.trim(), phone: `+91${normalizePhone(p.phone)}`, seatType: p.seatType })),
      ];

      const firstResponse = await api.post<unknown>(
        '/bookings',
        { ...sharedPayload, seatType: allPassengers[0].seatType, passengerName: allPassengers[0].name, passengerPhone: allPassengers[0].phone },
        token ?? undefined,
      );

      // response is wrapped: { status: 'ok', data: { bookingId, id, fareBreakdown, ... } }
      const firstRecord = safeRecord(firstResponse);
      const firstData = safeRecord(firstRecord?.data as unknown);
      const bookingId = readString(firstData ?? firstRecord, ['bookingId', 'id'], '');
      if (!bookingId) {
        throw { code: 'HTTP_ERROR', message: copy(lang, 'Booking response did not include a booking ID.', 'बुकिंग रिस्पॉन्स में बुकिंग ID नहीं मिली।') };
      }

      // fire additional passenger bookings concurrently (best-effort)
      if (allPassengers.length > 1) {
        await Promise.allSettled(
          allPassengers.slice(1).map((p) =>
            api.post('/bookings', { ...sharedPayload, seatType: p.seatType, passengerName: p.name, passengerPhone: p.phone }, token ?? undefined),
          ),
        );
      }

      window.sessionStorage.removeItem(storageKey);

      if (form.paymentMethod === 'UPI' && allPassengers.length === 1) {
        const fareBreakdown = safeRecord(firstData?.fareBreakdown ?? firstRecord?.fareBreakdown);
        const confirmedTotalPaise = readNumber(fareBreakdown, ['totalFare'], totalPaise);
        openRazorpay(bookingId, confirmedTotalPaise, firstResponse);
        return;
      }

      router.replace(allPassengers.length > 1 ? '/bookings' : `/bookings/${bookingId}/confirm`);
    } catch (caught) {
      if (isApiError(caught) && caught.status === 409) {
        toast.error(copy(lang, 'Seat just booked - please select another', 'सीट अभी बुक हो गई - दूसरी चुनें'));
        router.back();
      } else if (isApiError(caught) && caught.status === 410) {
        setTripCancelled(true);
      } else {
        toast.error(isApiError(caught) ? caught.message : copy(lang, 'Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। फिर कोशिश करें।'));
      }
      setLoading(false);
    }
  };

  if (tripCancelled) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-raised)] px-5 text-center">
        <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'This trip was cancelled', 'यह यात्रा रद्द हो गई')}</h1>
        <p className="mt-2 text-body text-[var(--text-secondary)]">{copy(lang, 'Find another available trip for this route.', 'इस मार्ग के लिए दूसरी उपलब्ध यात्रा खोजें।')}</p>
        <Button className="mt-6" onClick={() => router.push('/trips')}>
          {copy(lang, 'Find another trip', 'दूसरी यात्रा खोजें')}
        </Button>
      </main>
    );
  }

  if (!tripLoading && (!trip || tripError)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-raised)] px-5 text-center">
        <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Trip unavailable', 'यात्रा उपलब्ध नहीं')}</h1>
        <p className="mt-2 text-body text-[var(--text-secondary)]">{tripError || copy(lang, 'This trip could not be loaded from the backend.', 'यह यात्रा बैकेंड से लोड नहीं हो सकी।')}</p>
        <Button className="mt-6" onClick={() => router.push('/')}>
          {copy(lang, 'Search trips', 'यात्रा खोजें')}
        </Button>
      </main>
    );
  }

  // Extra fare lines for FareSummary (one per extra passenger)
  const extraFareLines = form.extraPassengers.map((p, i) => ({
    label: `${copy(lang, `Passenger ${i + 2}`, `यात्री ${i + 2}`)} — ${seatLabel(p.seatType)}`,
    amountPaise: trip ? seatFare(p.seatType, trip) : 0,
  }));

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <header className="sticky top-0 z-20 bg-[var(--brand)] px-5 py-4 text-small font-medium text-white">
        {trip ? (
          <p>
            {trip.from} → {trip.to} | {formatTime(trip.departureAt, lang)} | {primarySeatLabel} | {formatCurrency(totalPaise)}
          </p>
        ) : (
          <p>{copy(lang, 'Loading trip...', 'यात्रा लोड हो रही है...')}</p>
        )}
      </header>
      <form onSubmit={handleSubmit} className="space-y-5 px-5 pt-5">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <h1 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Passenger details', 'यात्री विवरण')}</h1>
          <div className="mt-4 space-y-4">
            <Input label={copy(lang, 'Passenger name', 'यात्री का नाम')} value={form.passengerName} error={errors.passengerName} onChange={(event) => setForm((current) => ({ ...current, passengerName: event.target.value }))} />
            <Input label={copy(lang, 'Contact number', 'संपर्क नंबर')} inputMode="numeric" value={form.phone} error={errors.phone} onChange={(event) => setForm((current) => ({ ...current, phone: formatPhone(event.target.value) }))} />
            <div>
              <Input
                label={copy(lang, 'Exact pickup point', 'सटीक पिकअप पॉइंट')}
                value={form.pickupQuery}
                error={errors.pickupQuery}
                suffix={
                  <button type="button" className="text-small font-medium text-[var(--brand)]" onClick={() => void useCurrentLocation()}>
                    GPS
                  </button>
                }
                autoComplete="off"
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
                error={errors.dropoffQuery}
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
            <Input label={copy(lang, 'Emergency contact (optional)', 'आपातकालीन संपर्क (वैकल्पिक)')} inputMode="numeric" value={form.emergencyContact} error={errors.emergencyContact} onChange={(event) => setForm((current) => ({ ...current, emergencyContact: formatPhone(event.target.value) }))} />
            {form.showGstin ? (
              <Input label="GSTIN" value={form.gstin} error={errors.gstin} onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))} />
            ) : (
              <button type="button" className="text-small font-medium text-[var(--brand)]" onClick={() => setForm((current) => ({ ...current, showGstin: true }))}>
                {copy(lang, 'Add GSTIN for invoice', 'इनवॉइस के लिए GSTIN जोड़ें')}
              </button>
            )}
            {form.extraPassengers.map((passenger, index) => (
              <div key={index} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-small font-medium text-[var(--text-secondary)]">
                    {copy(lang, `Passenger ${index + 2}`, `यात्री ${index + 2}`)}
                  </span>
                  <button
                    type="button"
                    className="text-small text-[var(--red-600)]"
                    onClick={() => setForm((current) => ({
                      ...current,
                      extraPassengers: current.extraPassengers.filter((_, i) => i !== index),
                    }))}
                  >
                    {copy(lang, 'Remove', 'हटाएं')}
                  </button>
                </div>
                <Input
                  label={copy(lang, 'Name', 'नाम')}
                  value={passenger.name}
                  error={errors[`ep${index}_name`]}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    extraPassengers: current.extraPassengers.map((p, i) => i === index ? { ...p, name: event.target.value } : p),
                  }))}
                />
                <Input
                  label={copy(lang, 'Phone number', 'फोन नंबर')}
                  inputMode="numeric"
                  value={passenger.phone}
                  error={errors[`ep${index}_phone`]}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    extraPassengers: current.extraPassengers.map((p, i) => i === index ? { ...p, phone: formatPhone(event.target.value) } : p),
                  }))}
                />
                <div>
                  <p className="mb-2 text-small text-[var(--text-secondary)]">{copy(lang, 'Seat type', 'सीट का प्रकार')}</p>
                  <div className="flex gap-2">
                    <SeatToggle
                      label={copy(lang, 'Front', 'आगे')}
                      price={trip ? formatCurrency(trip.frontFarePaise) : '—'}
                      selected={passenger.seatType === 'FRONT'}
                      onClick={() => setForm((current) => ({
                        ...current,
                        extraPassengers: current.extraPassengers.map((p, i) => i === index ? { ...p, seatType: 'FRONT' } : p),
                      }))}
                    />
                    <SeatToggle
                      label={copy(lang, 'Back', 'पीछे')}
                      price={trip ? formatCurrency(trip.backFarePaise) : '—'}
                      selected={passenger.seatType === 'BACK'}
                      onClick={() => setForm((current) => ({
                        ...current,
                        extraPassengers: current.extraPassengers.map((p, i) => i === index ? { ...p, seatType: 'BACK' } : p),
                      }))}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="w-full rounded-xl border border-dashed border-[var(--brand)] py-3 text-small font-medium text-[var(--brand)]"
              onClick={() => setForm((current) => ({
                ...current,
                extraPassengers: [...current.extraPassengers, { name: '', phone: '', seatType }],
              }))}
            >
              {copy(lang, '+ Add another passenger', '+ दूसरा यात्री जोड़ें')}
            </button>
          </div>
        </section>
        <OptionSection title={copy(lang, 'Luggage size', 'सामान का आकार')}>
          <OptionCard selected={form.luggageSize === 'SMALL'} title={copy(lang, 'Small bag', 'छोटा बैग')} subtitle={copy(lang, 'Free', 'मुफ़्त')} onClick={() => setForm((current) => ({ ...current, luggageSize: 'SMALL' }))} />
          <OptionCard selected={form.luggageSize === 'LARGE'} title={copy(lang, 'Large bag / trolley', 'बड़ा बैग / ट्रॉली')} subtitle={formatCurrency(luggageSurcharges.LARGE)} onClick={() => setForm((current) => ({ ...current, luggageSize: 'LARGE' }))} />
          <OptionCard selected={form.luggageSize === 'OVERSIZED'} title={copy(lang, 'Oversized / multiple bags', 'बड़ा / कई बैग')} subtitle={formatCurrency(luggageSurcharges.OVERSIZED)} onClick={() => setForm((current) => ({ ...current, luggageSize: 'OVERSIZED' }))} />
        </OptionSection>
        <OptionSection title={copy(lang, 'Payment method', 'भुगतान का तरीका')}>
          <OptionCard selected={form.paymentMethod === 'UPI'} title={copy(lang, 'Pay now via UPI', 'UPI से अभी भुगतान करें')} subtitle={copy(lang, "You'll be redirected to complete payment", 'भुगतान पूरा करने के लिए रीडायरेक्ट होंगे')} onClick={() => setForm((current) => ({ ...current, paymentMethod: 'UPI' }))} />
          <OptionCard selected={form.paymentMethod === 'CASH'} title={copy(lang, 'Pay cash at pickup', 'पिकअप पर नकद भुगतान')} subtitle={copy(lang, 'Bring exact change', 'सटीक पैसे लेकर आएं')} onClick={() => setForm((current) => ({ ...current, paymentMethod: 'CASH' }))} />
          {form.paymentMethod === 'CASH' ? <p className="rounded-xl bg-[var(--amber-50)] px-3 py-2 text-small text-[var(--stone-800)]">{copy(lang, 'Driver expects cash at departure. Seat is held for 30 mins.', 'ड्राइवर प्रस्थान पर नकद अपेक्षा करता है। सीट 30 मिनट तक होल्ड रहेगी।')}</p> : null}
        </OptionSection>
        <FareSummary
          lang={lang}
          seatLabel={primarySeatLabel}
          baseFarePaise={primaryFare}
          extraLines={extraFareLines}
          luggageLabel={luggageLabel}
          luggageSurchargePaise={surcharge}
        />
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button type="submit" fullWidth loading={loading} disabled={loading || !trip}>
            {copy(lang, 'Confirm booking', 'बुकिंग कन्फर्म करें')}
          </Button>
        </div>
      </form>
      <BottomSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} title={copy(lang, 'Sign in to continue', 'जारी रखने के लिए साइन इन करें')}>
        <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'Enter your phone number to confirm this seat.', 'यह सीट कन्फर्म करने के लिए अपना फोन नंबर दर्ज करें।')}</p>
        <Button className="mt-5" fullWidth onClick={() => router.push('/onboarding/phone')}>
          {copy(lang, 'Continue to sign in', 'साइन इन जारी रखें')}
        </Button>
      </BottomSheet>
    </main>
  );
}

function PlaceOptions({ options, onSelect }: { options: PlaceResult[]; onSelect: (place: PlaceResult) => void }) {
  if (options.length === 0) {
    return null;
  }

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

function SeatToggle({ label, price, selected, onClick }: { label: string; price: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={['flex flex-1 flex-col items-center rounded-xl border py-3 text-center transition-colors', selected ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface)]'].join(' ')}
    >
      <span className={['text-small font-medium', selected ? 'text-[var(--brand)]' : 'text-[var(--text-primary)]'].join(' ')}>{label}</span>
      <span className="mt-0.5 text-small text-[var(--text-secondary)]">{price}</span>
    </button>
  );
}

function OptionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <h2 className="font-display text-heading text-[var(--text-primary)]">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function OptionCard({ selected, title, subtitle, onClick }: { selected: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={['flex w-full items-center justify-between rounded-xl border p-4 text-left', selected ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface)]'].join(' ')}>
      <span>
        <span className="block font-medium text-[var(--text-primary)]">{title}</span>
        <span className="text-small text-[var(--text-secondary)]">{subtitle}</span>
      </span>
      <span className="text-[var(--brand)]">{selected ? '✓' : ''}</span>
    </button>
  );
}

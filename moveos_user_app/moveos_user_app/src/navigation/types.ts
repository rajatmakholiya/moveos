import type { Trip, SeatType } from '@/types';

// ─── Auth Stack ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Phone: undefined;
  Otp: { phone: string };
  Name: undefined;
  Consents: undefined;
};

// ─── Tab param lists ──────────────────────────────────────────────────────────

export type PassengerTabParamList = {
  HomeTab: undefined;
  BookingsTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};

export type DriverTabParamList = {
  DriverHomeTab: undefined;
  DriverBookingsTab: undefined;
  FleetTab: undefined;
  DriverProfileTab: undefined;
};

// ─── Root stack ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  // Bootstrap
  Splash: undefined;
  Onboarding: undefined;

  // Auth
  AuthPhoneEntry: undefined;
  AuthOtpVerify: { phoneNumber: string; countryCode: string };
  ProfileCreate: { phoneNumber: string; countryCode: string };

  // Main shells
  AppShell: { ratingPrompt?: boolean } | undefined;

  // ── Phase 2: Passenger booking flow ──────────────────────────────────────
  TripList: { routeId: string; date: string; from: string; to: string };
  BookingForm: { tripId: string; seatType: SeatType; trip: Trip };
  PassengerPayment: {
    bookingId: string;
    orderId: string;
    amount: number;
    passengerName: string;
    phone: string;
  };
  Ticket: { bookingId: string };
  PassengerTracking: { bookingId: string };
  RequestsNew: {
    type?: 'SEAT' | 'FULL_VEHICLE' | 'PARCEL';
    routeId?: string;
    from?: string;
    to?: string;
    date?: string;
  } | undefined;

  // ── Legacy ride screens (kept during migration) ───────────────────────────
  Schemes: undefined;
  SchemeDetail: {
    id: string;
    title: string;
    description: string;
    incentive: string;
    ctaLabel?: string;
  };
  RideDetail: {
    ride: {
      id: string;
      status: 'completed' | 'cancelled' | 'scheduled';
      amount: string;
      dateLabel: string;
      timeLabel: string;
      pickup: string;
      dropoff: string;
      vehicle: string;
      driver: string;
      driverRating?: number;
      distance: string;
      duration: string;
      paymentMethod: string;
      mapPreview: string;
    };
  };
  PaymentMethods: { selectedId?: string } | undefined;
  RideScheduler: undefined;
  RideSelector: {
    pickup: string;
    dropoff: string;
    paymentMethod?: string;
    pickupCoords?: { latitude: number; longitude: number; title?: string };
    dropoffCoords?: { latitude: number; longitude: number; title?: string };
  };
  RideFinding: {
    pickup: string;
    dropoff: string;
    pickupCoords?: { latitude: number; longitude: number; title?: string };
    dropoffCoords?: { latitude: number; longitude: number; title?: string };
    vehicle: string;
    price: string;
    eta: string;
  };
  RideTracking: {
    driver: {
      name: string;
      rating: number;
      car: string;
      color: string;
      plate: string;
      avatar: string;
    };
    pickup: string;
    dropoff: string;
    pickupCoords?: { latitude: number; longitude: number; title?: string };
    dropoffCoords?: { latitude: number; longitude: number; title?: string };
    eta: string;
    progress: number;
  };
  RideVerified: {
    driver: {
      name: string;
      rating: number;
      car: string;
      color: string;
      plate: string;
      avatar: string;
    };
    pickup: string;
    dropoff: string;
    pickupCoords?: { latitude: number; longitude: number; title?: string };
    dropoffCoords?: { latitude: number; longitude: number; title?: string };
    eta: string;
    progress: number;
  };
  RideComplete: {
    fare: string;
    promo?: string;
    driver: { name: string; avatar: string };
    breakdown: { label: string; value: string }[];
    paymentMethod: string;
  };
  UpcomingRides: undefined;
  MainAppPlaceholder: undefined;
};

// Legacy compat alias used by existing screens
export type AppTabParamList = {
  Explore: { ratingPrompt?: boolean } | undefined;
  Rides: undefined;
  Wallet: undefined;
  Profile: undefined;
};

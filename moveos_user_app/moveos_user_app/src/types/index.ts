// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'PASSENGER' | 'DRIVER' | 'AGENT' | 'ADMIN';

export type AuthUser = {
  userId: string;
  role: UserRole;
  passengerId?: string;
  driverId?: string;
  name?: string;
  phone?: string;
};

export type AuthPayload = {
  token: string;
  refreshToken?: string;
  user: AuthUser;
};

// ─── Routes ───────────────────────────────────────────────────────────────────

export type RouteOption = {
  id: string;
  from: string;
  to: string;
  durationHours: number;
  distanceKm: number;
};

// ─── Trips ────────────────────────────────────────────────────────────────────

export type TripStatus = 'DRAFT' | 'OPEN' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
export type SeatType = 'FRONT' | 'BACK';
export type LuggageSize = 'SMALL' | 'LARGE' | 'OVERSIZED';

export type Trip = {
  id: string;
  routeId: string;
  from: string;
  to: string;
  departureAt: string;
  driverName: string;
  organizationName?: string;
  driverRating: number | null;
  driverTrips: number | null;
  vehicleName: string;
  vehicleNumber: string;
  pickupPoint: string;
  notes?: string;
  status: TripStatus;
  frontFarePaise: number;
  backFarePaise: number;
  frontSeatsLeft: number;
  backSeatsLeft: number;
  luggagePolicy?: string;
};

// ─── Bookings ─────────────────────────────────────────────────────────────────

export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type PaymentMethod = 'UPI' | 'CASH';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';

export type Booking = {
  id: string;
  code: string;
  routeId: string;
  tripId: string;
  from: string;
  to: string;
  departureAt: string;
  seatType: SeatType;
  farePaise: number;
  luggagePaise?: number;
  totalPaise: number;
  status: BookingStatus;
  tripStatus: TripStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  passengerName: string;
  phone: string;
  driverName: string;
  vehicleName: string;
  vehicleNumber: string;
  pickupPoint: string;
  arrivedAtPickupAt?: string;
  pickedUpAt?: string;
};

export type ExtraPassenger = {
  name: string;
  phone: string;
  seatType: SeatType;
};

export type BookingFormData = {
  passengerName: string;
  phone: string;
  emergencyContact?: string;
  gstin?: string;
  seatType: SeatType;
  luggageSize: LuggageSize;
  paymentMethod: PaymentMethod;
  extraPassengers: ExtraPassenger[];
};

export const LUGGAGE_PAISE: Record<LuggageSize, number> = {
  SMALL: 0,
  LARGE: 5000,
  OVERSIZED: 15000,
};

// ─── Requests (Custom Rides) ──────────────────────────────────────────────────

export type RequestType = 'SEAT' | 'FULL_VEHICLE' | 'PARCEL';

export type TransportRequest = {
  id: string;
  type: RequestType;
  status: string;
  paymentStatus?: string;
  from: string;
  to: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  requestedFor: string;
  seats?: number;
  budgetPaise?: number;
  agreedAmountPaise?: number;
  acceptedByDriverId?: string;
  passengerName?: string;
  passengerPhone?: string;
  note?: string;
  driver?: { name?: string; phone?: string };
  vehicle?: { vehicleNumber?: string; vehicleType?: string };
};

// ─── Organizations ────────────────────────────────────────────────────────────

export type OrgStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export type Organization = {
  id: string;
  legalName: string;
  tradeName?: string;
  status: OrgStatus;
  planTier: string;
  primaryPhone?: string;
  _count?: { drivers: number; vehicles: number };
};

export type BlockedReason = {
  code: string;
  message: string;
  owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM';
};

export type OperatingContext = {
  id: string;
  type: 'INDIVIDUAL' | 'ORGANIZATION';
  label: string;
  activeVehicleCount: number;
  canOperate: boolean;
  blockedReasons?: BlockedReason[];
};

// ─── KYC / Documents ──────────────────────────────────────────────────────────

export type DocumentType =
  | 'DRIVING_LICENSE'
  | 'AADHAAR'
  | 'PAN_CARD'
  | 'RC'
  | 'INSURANCE'
  | 'PERMIT';

export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type DriverDocument = {
  type: DocumentType;
  status: DocumentStatus;
  rejectionReason?: string;
  expiresAt?: string;
  documentNumber?: string;
};

// ─── Geo ──────────────────────────────────────────────────────────────────────

export type GeoPlace = {
  placeId: string;
  label: string;
  lat: number;
  lng: number;
};

export type DriverLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

// ─── Feature Flags ────────────────────────────────────────────────────────────

export type FeatureFlags = {
  enableLocationNudge?: boolean;
  enableWalletPrompt?: boolean;
};

// ─── Language ─────────────────────────────────────────────────────────────────

export type Lang = 'en' | 'hi';

// ─── Vehicle ──────────────────────────────────────────────────────────────────

export type Vehicle = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  vehicleName: string;
  isActive: boolean;
};

// ─── Driver ───────────────────────────────────────────────────────────────────

export type Driver = {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  documents: DriverDocument[];
};

export type DriverEarnings = {
  todayPaise: number;
  weekPaise: number;
  monthPaise: number;
};

export type OnboardingStatus = {
  nextStep: 'ACTIVE' | 'WAIT_FOR_VERIFICATION' | 'SUSPENDED' | string;
  missingRequiredFields?: string[];
  missingRequiredDocuments?: DocumentType[];
};

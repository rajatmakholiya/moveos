import { readArray, readNumber, readString, safeRecord, toIsoDate } from './utils';

export type SeatType = 'FRONT' | 'BACK';
export type PaymentMethod = 'UPI' | 'CASH';
export type TripStatus = 'DRAFT' | 'OPEN' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export type RouteOption = {
  id: string;
  from: string;
  to: string;
  durationHours: number;
  distanceKm: number;
};

export type Trip = {
  id: string;
  routeId: string;
  from: string;
  to: string;
  departureAt: string;
  driverName: string;
  organizationName: string;
  driverRating: number | null;
  driverTrips: number | null;
  vehicleName: string;
  vehicleNumber: string;
  pickupPoint: string;
  notes: string;
  status: TripStatus;
  frontFarePaise: number;
  backFarePaise: number;
  frontSeatsLeft: number;
  backSeatsLeft: number;
  luggagePolicy: string;
};

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
  arrivedAtPickupAt: string | null;
  pickedUpAt: string | null;
  /** Razorpay order id — present on UPI bookings, enables payment retry. */
  razorpayOrderId: string | null;
};

function unwrapData(payload: unknown) {
  const record = safeRecord(payload);
  return record && 'data' in record ? record.data : payload;
}

export function parseRoutes(payload: unknown): RouteOption[] {
  const data = unwrapData(payload);
  const items = readArray(data, ['routes', 'data']);

  return items.flatMap((item) => {
    const name = readString(item, ['name']);
    const [nameFrom, nameTo] = name.split('→').map((part) => part.trim()).filter(Boolean);
    const from = readString(item, ['from', 'origin', 'originLabel', 'source'], nameFrom);
    const to = readString(item, ['to', 'destination', 'destinationLabel'], nameTo);
    const id = readString(item, ['id', 'routeId', 'slug']);

    if (!id || !from || !to) {
      return [];
    }

    return [{
      id,
      from,
      to,
      durationHours: readNumber(item, ['durationHours', 'estimatedHours', 'hours'], 0),
      distanceKm: readNumber(item, ['distanceKm', 'distance'], 0),
    }];
  });
}

export function parseTrips(payload: unknown, route?: RouteOption): Trip[] {
  const data = unwrapData(payload);
  const items = readArray(data, ['trips', 'data']);
  return items.flatMap((item) => {
    const trip = parseTrip(item, route);
    return trip ? [trip] : [];
  });
}

export function parseTrip(payload: unknown, route?: RouteOption): Trip | null {
  const data = unwrapData(payload);
  const wrapper = safeRecord(data);
  const source = wrapper && safeRecord(wrapper.trip) ? wrapper.trip : data;
  const record = safeRecord(source);
  if (!record) {
    return null;
  }

  const nestedRoute = safeRecord(record.route);
  const driver = safeRecord(record.driver);
  const vehicle = safeRecord(record.vehicle);
  const organization = safeRecord(record.organization);
  const routeName = readString(nestedRoute ?? source, ['name']);
  const [routeFrom, routeTo] = routeName.split('→').map((part) => part.trim()).filter(Boolean);
  const id = readString(source, ['id', 'tripId']);
  const departureAt = readString(source, ['departureAt', 'departureTime', 'startsAt']);

  if (!id || !departureAt) {
    return null;
  }

  const from = readString(nestedRoute ?? source, ['fromCity', 'from', 'origin', 'originLabel'], route?.from ?? routeFrom);
  const to = readString(nestedRoute ?? source, ['toCity', 'to', 'destination', 'destinationLabel'], route?.to ?? routeTo);
  const rawStatus = readString(source, ['status'], 'OPEN');
  const status: TripStatus = rawStatus === 'DEPARTED' || rawStatus === 'CANCELLED' || rawStatus === 'COMPLETED' || rawStatus === 'DRAFT' ? rawStatus : 'OPEN';
  const frontTotal = readNumber(source, ['frontSeatsTotal'], 0);
  const backTotal = readNumber(source, ['backSeatsTotal'], 0);
  const frontBooked = readNumber(source, ['frontSeatsBooked'], 0);
  const backBooked = readNumber(source, ['backSeatsBooked'], 0);
  const driverRating = readNumber(driver ?? source, ['rating', 'driverRating'], Number.NaN);
  const driverTrips = readNumber(driver ?? source, ['tripsCompleted', 'driverTrips'], Number.NaN);

  return {
    id,
    routeId: readString(source, ['routeId'], route?.id ?? ''),
    from,
    to,
    departureAt,
    driverName: readString(driver ?? source, ['name', 'driverName']),
    organizationName: readString(organization ?? source, ['name', 'organizationName', 'tradeName', 'legalName']),
    driverRating: Number.isFinite(driverRating) ? driverRating : null,
    driverTrips: Number.isFinite(driverTrips) ? driverTrips : null,
    vehicleName: readString(vehicle ?? source, ['type', 'name', 'model', 'vehicleType', 'vehicleName']),
    vehicleNumber: readString(vehicle ?? source, ['plate', 'number', 'registrationNumber', 'vehiclePlate', 'vehicleNumber']),
    pickupPoint: readString(source, ['pickupPoint', 'departurePoint', 'pickup']),
    notes: readString(source, ['notes', 'driverNotes']),
    status,
    frontFarePaise: readNumber(source, ['frontFarePaise', 'frontFare', 'frontPricePaise'], readNumber(nestedRoute, ['baseFrontPrice'], 0)),
    backFarePaise: readNumber(source, ['backFarePaise', 'backFare', 'backPricePaise'], readNumber(nestedRoute, ['baseBackPrice'], 0)),
    frontSeatsLeft: readNumber(source, ['frontSeatsLeft', 'availableFrontSeats', 'frontSeatsRemaining'], Math.max(0, frontTotal - frontBooked)),
    backSeatsLeft: readNumber(source, ['backSeatsLeft', 'availableBackSeats', 'backSeatsRemaining'], Math.max(0, backTotal - backBooked)),
    luggagePolicy: readString(source, ['luggagePolicy']),
  };
}

export function parseBookings(payload: unknown): Booking[] {
  const data = unwrapData(payload);
  return readArray(data, ['bookings', 'data']).flatMap((item) => {
    const booking = parseBooking(item);
    return booking ? [booking] : [];
  });
}

export function parseBooking(payload: unknown): Booking | null {
  const data = unwrapData(payload);
  const wrapper = safeRecord(data);
  const source = wrapper && safeRecord(wrapper.booking) ? wrapper.booking : data;
  const record = safeRecord(source);
  if (!record) {
    return null;
  }

  const tripRecord = safeRecord(record.trip);
  const routeRecord = tripRecord ? safeRecord(tripRecord.route) : null;
  const routeName = readString(routeRecord, ['name']);
  const [routeFrom, routeTo] = routeName.split('→').map((part) => part.trim()).filter(Boolean);
  const id = readString(source, ['id', 'bookingId']);
  const departureAt = readString(tripRecord ?? source, ['departureAt', 'departureTime']);

  if (!id || !departureAt) {
    return null;
  }

  const rawSeatType = readString(source, ['seatType'], 'BACK');
  const rawStatus = readString(source, ['status'], 'CONFIRMED');
  const rawTripStatus = readString(tripRecord ?? source, ['status', 'tripStatus'], 'OPEN');
  const rawPayment = readString(source, ['paymentMethod'], 'CASH');
  const rawPaymentStatus = readString(source, ['paymentStatus'], 'PENDING');

  const tripStatusSet = new Set<TripStatus>(['DRAFT', 'OPEN', 'DEPARTED', 'COMPLETED', 'CANCELLED']);
  const bookingStatusSet = new Set<BookingStatus>(['CONFIRMED', 'PENDING', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
  const paymentStatusSet = new Set<PaymentStatus>(['PENDING', 'PAID', 'REFUNDED', 'FAILED']);

  return {
    id,
    code: readString(source, ['bookingCode', 'code', 'ticketCode'], id),
    routeId: readString(tripRecord ?? source, ['routeId']),
    tripId: readString(tripRecord ?? source, ['id', 'tripId']),
    from: readString(tripRecord ?? source, ['fromCity', 'from', 'origin', 'originLabel'], routeFrom),
    to: readString(tripRecord ?? source, ['toCity', 'to', 'destination', 'destinationLabel'], routeTo),
    departureAt,
    seatType: rawSeatType === 'FRONT' ? 'FRONT' : 'BACK',
    farePaise: readNumber(source, ['baseFarePaise', 'farePaise', 'baseFare'], 0),
    totalPaise: readNumber(source, ['totalFarePaise', 'totalPaise', 'amountPaise', 'totalFare'], 0),
    status: bookingStatusSet.has(rawStatus as BookingStatus) ? rawStatus as BookingStatus : 'CONFIRMED',
    tripStatus: tripStatusSet.has(rawTripStatus as TripStatus) ? rawTripStatus as TripStatus : 'OPEN',
    paymentMethod: rawPayment === 'UPI' ? 'UPI' : 'CASH',
    paymentStatus: paymentStatusSet.has(rawPaymentStatus as PaymentStatus) ? rawPaymentStatus as PaymentStatus : 'PENDING',
    passengerName: readString(source, ['passengerName', 'name']),
    phone: readString(source, ['passengerPhone', 'phone', 'contactNumber']),
    driverName: readString(tripRecord ?? source, ['driverName']),
    vehicleName: readString(tripRecord ?? source, ['vehicleType', 'vehicleName', 'model', 'name']),
    vehicleNumber: readString(tripRecord ?? source, ['vehiclePlate', 'vehicleNumber', 'plate', 'number', 'registrationNumber']),
    pickupPoint: readString(tripRecord ?? source, ['pickupPoint', 'departurePoint', 'pickup']),
    arrivedAtPickupAt: readString(source, ['arrivedAtPickupAt']) || null,
    pickedUpAt: readString(source, ['pickedUpAt']) || null,
    razorpayOrderId: readString(source, ['razorpayOrderId']) || null,
  };
}

export function bookingFormStorageKey(tripId: string) {
  return `pahadi_booking_form_${tripId}`;
}

export function todayIsoDate() {
  return toIsoDate(new Date());
}

import type {
  Booking,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  SeatType,
  TripStatus,
} from '@/types';

// Shape the backend returns for both /passenger/bookings (list) and
// /bookings/{id} (single). Kept in one place so every screen maps it the same way.
export type BackendBookingDto = {
  id: string;
  bookingCode: string;
  tripId: string;
  seatType: string;
  luggageSize?: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalFarePaise: number;
  baseFarePaise: number;
  luggageSurchargePaise: number;
  passengerName: string;
  passengerPhone: string;
  trip: {
    departureAt: string;
    status: string;
    pickupPoint: string;
    fromCity: string;
    toCity: string;
    driverName: string;
    vehiclePlate: string | null;
    vehicleType: string | null;
  } | null;
};

export function mapToBooking(dto: BackendBookingDto): Booking {
  const trip = dto.trip;
  return {
    id: dto.id,
    code: dto.bookingCode,
    routeId: dto.tripId,
    tripId: dto.tripId,
    from: trip?.fromCity ?? '',
    to: trip?.toCity ?? '',
    departureAt: trip?.departureAt ?? '',
    seatType: dto.seatType as SeatType,
    farePaise: dto.baseFarePaise,
    luggagePaise: dto.luggageSurchargePaise,
    totalPaise: dto.totalFarePaise,
    status: dto.status as BookingStatus,
    tripStatus: (trip?.status ?? 'OPEN') as TripStatus,
    paymentMethod: dto.paymentMethod as PaymentMethod,
    paymentStatus: dto.paymentStatus as PaymentStatus,
    passengerName: dto.passengerName,
    phone: dto.passengerPhone,
    driverName: trip?.driverName ?? '',
    vehicleName: trip?.vehicleType ?? '',
    vehicleNumber: trip?.vehiclePlate ?? '',
    pickupPoint: trip?.pickupPoint ?? '',
  };
}

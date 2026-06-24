import { BookingResponseDto, TripSummaryDto } from './dto/booking-response.dto';

function buildBookingCode(id: string, createdAt: Date): string {
  const year = createdAt.getFullYear();
  const suffix = id.slice(-6).toUpperCase();
  return `PR-${year}-${suffix}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapTripSummary(trip: Record<string, any>): TripSummaryDto {
  const route = (trip.route as Record<string, any>) ?? {};
  const driver = (trip.driver as Record<string, any>) ?? {};
  const vehicle = trip.vehicle as Record<string, any> | null | undefined;
  return {
    id: trip.id as string,
    departureAt: toIso(trip.departureAt as Date | string),
    status: trip.status as string,
    pickupPoint: (trip.departurePoint as string | undefined) ?? '',
    luggagePolicy: (trip.luggagePolicy as string | null | undefined) ?? null,
    fromCity: (route.originLabel as string | undefined) ?? '',
    toCity: (route.destinationLabel as string | undefined) ?? '',
    routeName: (route.name as string | undefined) ?? '',
    driverId: (driver.id as string | undefined) ?? '',
    driverName: (driver.name as string | undefined) ?? '',
    driverRating: (driver.rating as number | undefined) ?? 5,
    vehicleId: (vehicle?.id as string | undefined) ?? null,
    vehicleType: (vehicle?.type as string | undefined) ?? null,
    vehiclePlate: (vehicle?.plate as string | undefined) ?? null,
  };
}

export function toBookingDto(booking: Record<string, any>): BookingResponseDto {
  const trip = booking.trip as Record<string, any> | null | undefined;
  const invoice = booking.invoice as Record<string, any> | null | undefined;
  return {
    id: booking.id as string,
    bookingCode: buildBookingCode(booking.id as string, booking.createdAt as Date),
    tripId: booking.tripId as string,
    passengerId: (booking.passengerId as string | null | undefined) ?? null,
    passengerName: booking.passengerName as string,
    passengerPhone: booking.passengerPhone as string,
    pickup: (booking.pickupJson as Record<string, unknown> | null | undefined) ?? null,
    dropoff: (booking.dropoffJson as Record<string, unknown> | null | undefined) ?? null,
    agentId: (booking.agentId as string | null | undefined) ?? null,
    seatType: booking.seatType as string,
    luggageSize: booking.luggageSize as string,
    baseFarePaise: booking.baseFare as number,
    luggageSurchargePaise: booking.luggageSurcharge as number,
    totalFarePaise: booking.totalFare as number,
    paymentMethod: booking.paymentMethod as string,
    paymentStatus: booking.paymentStatus as string,
    razorpayOrderId: (booking.razorpayOrderId as string | null | undefined) ?? null,
    gstin: (booking.gstin as string | null | undefined) ?? null,
    status: booking.status as string,
    emergencyContact: (booking.emergencyContact as string | null | undefined) ?? null,
    invoiceNo: (invoice?.invoiceNo as string | undefined) ?? null,
    arrivedAtPickupAt: booking.arrivedAtPickupAt ? toIso(booking.arrivedAtPickupAt as Date | string) : null,
    pickedUpAt: booking.pickedUpAt ? toIso(booking.pickedUpAt as Date | string) : null,
    arrivedAtDropoffAt: booking.arrivedAtDropoffAt ? toIso(booking.arrivedAtDropoffAt as Date | string) : null,
    droppedOffAt: booking.droppedOffAt ? toIso(booking.droppedOffAt as Date | string) : null,
    noShowReason: (booking.noShowReason as string | null | undefined) ?? null,
    createdAt: toIso(booking.createdAt as Date | string),
    trip: trip ? mapTripSummary(trip) : null,
  };
}

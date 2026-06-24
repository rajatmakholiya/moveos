export class TripSummaryDto {
  id!: string;
  departureAt!: string;
  status!: string;
  pickupPoint!: string;
  luggagePolicy!: string | null;
  fromCity!: string;
  toCity!: string;
  routeName!: string;
  driverId!: string;
  driverName!: string;
  driverRating!: number;
  vehicleId!: string | null;
  vehicleType!: string | null;
  vehiclePlate!: string | null;
}

export class BookingResponseDto {
  id!: string;
  bookingCode!: string;
  tripId!: string;
  passengerId!: string | null;
  passengerName!: string;
  passengerPhone!: string;
  pickup!: Record<string, unknown> | null;
  dropoff!: Record<string, unknown> | null;
  agentId!: string | null;
  seatType!: string;
  luggageSize!: string;
  baseFarePaise!: number;
  luggageSurchargePaise!: number;
  totalFarePaise!: number;
  paymentMethod!: string;
  paymentStatus!: string;
  razorpayOrderId!: string | null;
  gstin!: string | null;
  status!: string;
  emergencyContact!: string | null;
  invoiceNo!: string | null;
  arrivedAtPickupAt!: string | null;
  pickedUpAt!: string | null;
  arrivedAtDropoffAt!: string | null;
  droppedOffAt!: string | null;
  noShowReason!: string | null;
  createdAt!: string;
  trip!: TripSummaryDto | null;
}

import { strict as assert } from 'assert';
import { toBookingDto } from './booking.mapper';

const BOOKING_ID = 'booking-test-ABCDEF';
const CREATED_AT = new Date('2026-05-26T10:00:00Z');

const mockBooking = {
  id: BOOKING_ID,
  tripId: 'trip-abc',
  passengerId: 'pass-xyz',
  agentId: null,
  passengerName: 'Ajay Singh',
  passengerPhone: '+919876543210',
  seatType: 'BACK',
  luggageSize: 'LARGE',
  baseFare: 200000,
  luggageSurcharge: 5000,
  totalFare: 205000,
  paymentMethod: 'UPI',
  paymentStatus: 'PAID',
  razorpayOrderId: 'order_123',
  razorpayPaymentId: 'pay_123',
  gstin: null,
  status: 'CONFIRMED',
  emergencyContact: null,
  createdAt: CREATED_AT,
  invoice: { invoiceNo: 'INV-2026-001' },
  trip: {
    id: 'trip-abc',
    departureAt: new Date('2026-06-01T08:30:00Z'),
    status: 'OPEN',
    departurePoint: 'Bus stand, Pithoragarh',
    luggagePolicy: '1 bag free',
    route: {
      name: 'Pithoragarh → Dehradun',
      originLabel: 'Pithoragarh',
      destinationLabel: 'Dehradun',
    },
    driver: { id: 'drv-001', name: 'Ramesh Kumar', rating: 4.8 },
    vehicle: { id: 'veh-001', type: 'Mahindra Bolero', plate: 'UK05TA1234' },
  },
};

function main() {
  const dto = toBookingDto(mockBooking);

  // bookingCode format: PR-{year}-{last6ofId}.toUpperCase()
  assert.equal(dto.bookingCode, 'PR-2026-ABCDEF', `bookingCode should be PR-2026-ABCDEF, got: ${dto.bookingCode}`);

  // fare fields renamed to canonical paise names
  assert.equal(dto.baseFarePaise, 200000, 'baseFarePaise should map from baseFare');
  assert.equal(dto.luggageSurchargePaise, 5000, 'luggageSurchargePaise should map from luggageSurcharge');
  assert.equal(dto.totalFarePaise, 205000, 'totalFarePaise should map from totalFare');

  // fare arithmetic invariant
  assert.equal(
    dto.baseFarePaise + dto.luggageSurchargePaise,
    dto.totalFarePaise,
    'baseFarePaise + luggageSurchargePaise must equal totalFarePaise',
  );

  // invoice number surfaced from nested invoice record
  assert.equal(dto.invoiceNo, 'INV-2026-001', 'invoiceNo should come from booking.invoice.invoiceNo');

  // passenger phone preserved as canonical field
  assert.equal(dto.passengerPhone, '+919876543210', 'passengerPhone should be preserved');

  // trip summary: city names come from route labels
  assert.ok(dto.trip !== null, 'trip should be present');
  assert.equal(dto.trip!.fromCity, 'Pithoragarh', 'fromCity from route.originLabel');
  assert.equal(dto.trip!.toCity, 'Dehradun', 'toCity from route.destinationLabel');
  assert.equal(dto.trip!.routeName, 'Pithoragarh → Dehradun', 'routeName from route.name');

  // trip summary: driver and vehicle
  assert.equal(dto.trip!.driverName, 'Ramesh Kumar', 'driverName from trip.driver.name');
  assert.equal(dto.trip!.driverRating, 4.8, 'driverRating from trip.driver.rating');
  assert.equal(dto.trip!.vehiclePlate, 'UK05TA1234', 'vehiclePlate from vehicle.plate');
  assert.equal(dto.trip!.vehicleType, 'Mahindra Bolero', 'vehicleType from vehicle.type');

  // trip summary: pickup point from departurePoint
  assert.equal(dto.trip!.pickupPoint, 'Bus stand, Pithoragarh', 'pickupPoint from trip.departurePoint');

  // departureAt serialised to ISO string
  assert.equal(dto.trip!.departureAt, '2026-06-01T08:30:00.000Z', 'departureAt should be ISO string');

  // null trip is handled
  const noTrip = toBookingDto({ ...mockBooking, trip: null });
  assert.equal(noTrip.trip, null, 'trip should be null when booking.trip is null');

  // missing invoice is handled
  const noInvoice = toBookingDto({ ...mockBooking, invoice: null });
  assert.equal(noInvoice.invoiceNo, null, 'invoiceNo should be null when invoice is missing');

  console.log('booking.mapper contract tests passed');
}

main();

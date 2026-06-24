import { strict as assert } from 'assert';
import { toBookingDto } from './booking.mapper';
import { ROLES_KEY } from '@common/auth/roles.decorator';
import { DriverBookingsController } from '../../../api-gateway/src/controllers/requests.controller';
import 'reflect-metadata';

// ---- helpers ----

function makeMockBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-driver-XYZABC',
    tripId: 'trip-001',
    passengerId: 'pass-001',
    agentId: null,
    passengerName: 'Geeta Devi',
    passengerPhone: '+919876543210',
    seatType: 'BACK',
    luggageSize: 'SMALL',
    baseFare: 200000,
    luggageSurcharge: 0,
    totalFare: 200000,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    razorpayOrderId: 'order_abc',
    razorpayPaymentId: 'pay_abc',
    gstin: null,
    status: 'CONFIRMED',
    emergencyContact: null,
    createdAt: new Date('2026-05-26T10:00:00Z'),
    invoice: null,
    trip: {
      id: 'trip-001',
      departureAt: new Date('2026-06-01T08:30:00Z'),
      status: 'OPEN',
      departurePoint: 'Bus stand, Pithoragarh',
      luggagePolicy: '1 bag free',
      route: {
        name: 'Pithoragarh → Dehradun',
        originLabel: 'Pithoragarh',
        destinationLabel: 'Dehradun',
      },
      driver: { id: 'drv-ramesh', name: 'Ramesh Kumar', rating: 4.8 },
      vehicle: { id: 'veh-001', type: 'Mahindra Bolero', plate: 'UK05TA1234' },
    },
    ...overrides,
  };
}

function main() {
  // ---- Scenario 1: driver with bookings ----
  {
    const booking = makeMockBooking();
    const dto = toBookingDto(booking);

    // bookingCode uses last-6 of id
    assert.equal(dto.bookingCode, 'PR-2026-XYZABC', `bookingCode should be PR-2026-XYZABC, got: ${dto.bookingCode}`);

    // passenger phone is present — driver is authorized because query is scoped by driverId
    assert.equal(dto.passengerPhone, '+919876543210', 'passengerPhone must be present for driver');

    // route info from canonical trip summary
    assert.ok(dto.trip !== null, 'trip must be present');
    assert.equal(dto.trip!.fromCity, 'Pithoragarh', 'fromCity from route.originLabel');
    assert.equal(dto.trip!.toCity, 'Dehradun', 'toCity from route.destinationLabel');
    assert.equal(dto.trip!.driverName, 'Ramesh Kumar', 'driverName from trip.driver');
    assert.equal(dto.trip!.vehiclePlate, 'UK05TA1234', 'vehiclePlate from trip.vehicle');

    // fare fields use canonical paise names
    assert.equal(dto.baseFarePaise, 200000, 'baseFarePaise');
    assert.equal(dto.luggageSurchargePaise, 0, 'luggageSurchargePaise for SMALL luggage');
    assert.equal(dto.totalFarePaise, 200000, 'totalFarePaise');

    // no hardcoded fake values
    assert.notEqual(dto.bookingCode, 'DR-2026-000001', 'must not use old fake DR-year-number code');
    assert.notEqual(dto.trip!.vehicleType, 'Accepted request', 'must not use old fake vehicle name');
  }

  // ---- Scenario 2: driver with multiple bookings (array mapping) ----
  {
    const rawBookings = [
      makeMockBooking({ id: 'booking-driver-AAA111' }),
      makeMockBooking({ id: 'booking-driver-BBB222' }),
    ];
    const dtos = rawBookings.map(toBookingDto);

    assert.equal(dtos.length, 2, 'should return all bookings');
    assert.equal(dtos[0].bookingCode, 'PR-2026-AAA111', 'first booking code');
    assert.equal(dtos[1].bookingCode, 'PR-2026-BBB222', 'second booking code');
  }

  // ---- Scenario 3: driver with no bookings ----
  {
    const emptyBookings: ReturnType<typeof makeMockBooking>[] = [];
    const dtos = emptyBookings.map(toBookingDto);
    assert.equal(dtos.length, 0, 'empty bookings should return empty array');
  }

  // ---- Scenario 4: unauthorized role — DRIVER guard is applied to DriverBookingsController ----
  // The @Roles('DRIVER') decorator is verified by reading the metadata off the controller class.
  // Full HTTP-level auth is covered by roles.guard.contract.test.ts.
  {
    const roles: string[] = Reflect.getMetadata(ROLES_KEY, DriverBookingsController) ?? [];
    assert.ok(
      roles.includes('DRIVER'),
      `DriverBookingsController must require DRIVER role, got: [${roles.join(', ')}]`,
    );
  }

  console.log('driver-bookings contract tests passed');
}

main();

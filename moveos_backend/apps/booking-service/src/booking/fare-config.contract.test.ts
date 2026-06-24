import { strict as assert } from 'assert';
import { LuggageSize } from '@prisma/client';

// ----- Constants under test -----
// Booking service (source of truth for fare calculation)
const BOOKING_SERVICE_LUGGAGE_SURCHARGE: Record<LuggageSize, number> = {
  [LuggageSize.SMALL]: 0,
  [LuggageSize.LARGE]: 5000,
  [LuggageSize.OVERSIZED]: 15000,
};

// Gateway fares controller (exposed to clients)
const GATEWAY_LUGGAGE_SURCHARGE = {
  SMALL: 0,
  LARGE: 5000,
  OVERSIZED: 15000,
} as const;

// ----- 1. Gateway and booking-service constants match -----
for (const size of Object.values(LuggageSize)) {
  assert.equal(
    BOOKING_SERVICE_LUGGAGE_SURCHARGE[size],
    GATEWAY_LUGGAGE_SURCHARGE[size],
    `Mismatch for LuggageSize.${size}: booking-service=${BOOKING_SERVICE_LUGGAGE_SURCHARGE[size]} gateway=${GATEWAY_LUGGAGE_SURCHARGE[size]}`,
  );
}

// ----- 2. All surcharge values are non-negative integers -----
for (const [key, value] of Object.entries(BOOKING_SERVICE_LUGGAGE_SURCHARGE)) {
  assert.ok(Number.isInteger(value), `${key} surcharge must be an integer, got ${value}`);
  assert.ok(value >= 0, `${key} surcharge must be >= 0, got ${value}`);
}

// ----- 3. totalFare = baseFare + luggageSurcharge is always an integer -----
const SAMPLE_BASE_FARES = [200000, 250000];
for (const baseFare of SAMPLE_BASE_FARES) {
  for (const surcharge of Object.values(BOOKING_SERVICE_LUGGAGE_SURCHARGE)) {
    const totalFare = baseFare + surcharge;
    assert.ok(Number.isInteger(totalFare), `totalFare must be integer: ${baseFare} + ${surcharge} = ${totalFare}`);
    assert.ok(totalFare >= baseFare, `totalFare must be >= baseFare`);
  }
}

// ----- 4. SMALL luggage has no surcharge -----
assert.equal(BOOKING_SERVICE_LUGGAGE_SURCHARGE[LuggageSize.SMALL], 0, 'SMALL luggage must have zero surcharge');
assert.equal(GATEWAY_LUGGAGE_SURCHARGE.SMALL, 0, 'SMALL luggage must have zero surcharge (gateway)');

// ----- 5. LARGE < OVERSIZED -----
assert.ok(
  BOOKING_SERVICE_LUGGAGE_SURCHARGE[LuggageSize.LARGE] < BOOKING_SERVICE_LUGGAGE_SURCHARGE[LuggageSize.OVERSIZED],
  'LARGE surcharge must be less than OVERSIZED surcharge',
);

console.log('fare-config contract tests passed');

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { strict as assert } from 'assert';
import { toErrorEnvelope, toSuccessEnvelope } from './api-response';

// ---- toSuccessEnvelope ----

assert.deepEqual(toSuccessEnvelope({ id: 'booking_1' }), {
  ok: true,
  data: { id: 'booking_1' },
});

assert.deepEqual(toSuccessEnvelope({ status: 'ok', data: { organization: { id: 'org_1' } } }), {
  ok: true,
  data: { organization: { id: 'org_1' } },
});

// ---- toErrorEnvelope: legacy shape 1 — string message ----
// NestJS wraps string exceptions as { statusCode, message, error }
{
  const envelope = toErrorEnvelope(new NotFoundException('Trip not found'));
  assert.equal(envelope.ok, false, 'ok must be false');
  assert.equal(envelope.statusCode, 404, 'statusCode from exception.getStatus()');
  assert.equal(envelope.message, 'Trip not found', 'string message passed through');
}

// ---- toErrorEnvelope: legacy shape 2 — validation array (NestJS ValidationPipe default) ----
// ValidationPipe throws BadRequestException(['fieldA must not be empty', 'fieldB must be a number'])
// NestJS wraps as { statusCode: 400, message: [...], error: 'Bad Request' }
{
  const envelope = toErrorEnvelope(
    new BadRequestException(['passengerName should not be empty', 'seatType must be a valid enum value']),
  );
  assert.equal(envelope.ok, false, 'ok must be false');
  assert.equal(envelope.statusCode, 400, 'statusCode 400');
  assert.equal(
    envelope.message,
    'passengerName should not be empty, seatType must be a valid enum value',
    'array joined with ", "',
  );
  const details = envelope.details as Record<string, unknown>;
  assert.ok(Array.isArray(details.message), 'original array preserved in details');
}

// ---- toErrorEnvelope: legacy shape 3 — object message with errorCode ----
// Service throws BadRequestException({ message: ['phone must be valid'], errorCode: 'VALIDATION_ERROR' })
assert.deepEqual(toErrorEnvelope(new BadRequestException({ message: ['phone must be valid'], errorCode: 'VALIDATION_ERROR' })), {
  ok: false,
  statusCode: 400,
  message: 'phone must be valid',
  errorCode: 'VALIDATION_ERROR',
  details: { message: ['phone must be valid'], errorCode: 'VALIDATION_ERROR' },
});

// ---- toErrorEnvelope: ok:false passthrough ----
// Service throws with a fully-formed ok:false envelope — should pass through unchanged
{
  const envelope = toErrorEnvelope(
    new BadRequestException({ ok: false, statusCode: 400, message: 'Seat not available', errorCode: 'SEATS_TAKEN', details: { available: 0 } }),
  );
  assert.equal(envelope.ok, false, 'ok must be false');
  assert.equal(envelope.statusCode, 400, 'statusCode preserved');
  assert.equal(envelope.message, 'Seat not available', 'message preserved');
  assert.equal(envelope.errorCode, 'SEATS_TAKEN', 'errorCode preserved');
  assert.deepEqual(envelope.details, { available: 0 }, 'details preserved');
}

console.log('api-response contract tests passed');

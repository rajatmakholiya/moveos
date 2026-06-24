import { strict as assert } from 'assert';
import { isRetryableMethod } from './api';

// Contract: only idempotent read methods may be auto-retried on 5xx.
// POST/PATCH/DELETE must never be retried — a double-fired booking POST
// can produce a duplicate booking or a false seat-conflict 409.

// Safe to retry
assert.equal(isRetryableMethod('GET'), true, 'GET should be retryable');
assert.equal(isRetryableMethod('HEAD'), true, 'HEAD should be retryable');

// Must not retry
assert.equal(isRetryableMethod('POST'), false, 'POST must not be retried');
assert.equal(isRetryableMethod('PUT'), false, 'PUT must not be retried');
assert.equal(isRetryableMethod('PATCH'), false, 'PATCH must not be retried');
assert.equal(isRetryableMethod('DELETE'), false, 'DELETE must not be retried');

console.log('api.retry contract tests passed');

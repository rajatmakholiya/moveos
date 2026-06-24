import { strict as assert } from 'assert';
import { ROLES_KEY } from '@common/auth/roles.decorator';
import { RequestsController, stripPassengerPii } from './requests.controller';
import 'reflect-metadata';

// ── 1. JwtAuthGuard + RolesGuard are attached to RequestsController ────────────
{
  const guards: unknown[] = Reflect.getMetadata('__guards__', RequestsController) ?? [];
  const names = guards.map((g) => (g as { name?: string }).name ?? String(g));
  assert.ok(
    names.includes('JwtAuthGuard'),
    `RequestsController must have JwtAuthGuard, got: [${names.join(', ')}]`,
  );
  assert.ok(
    names.includes('RolesGuard'),
    `RequestsController must have RolesGuard, got: [${names.join(', ')}]`,
  );
}

// ── 2. GET /requests allows DRIVER, PASSENGER, ORG_ADMIN ──────────────────────
{
  const proto = RequestsController.prototype as unknown as Record<string, object>;
  const roles: string[] = Reflect.getMetadata(ROLES_KEY, proto.listRequests) ?? [];
  assert.ok(roles.includes('DRIVER'), `GET /requests must allow DRIVER, got: [${roles.join(', ')}]`);
  assert.ok(roles.includes('PASSENGER'), `GET /requests must allow PASSENGER, got: [${roles.join(', ')}]`);
  assert.ok(roles.includes('ORG_ADMIN'), `GET /requests must allow ORG_ADMIN, got: [${roles.join(', ')}]`);
}

// ── 3. POST /requests must NOT allow DRIVER ───────────────────────────────────
{
  const proto = RequestsController.prototype as unknown as Record<string, object>;
  const roles: string[] = Reflect.getMetadata(ROLES_KEY, proto.createRequest) ?? [];
  assert.ok(!roles.includes('DRIVER'), 'POST /requests must NOT allow DRIVER');
  assert.ok(roles.includes('PASSENGER'), `POST /requests must allow PASSENGER, got: [${roles.join(', ')}]`);
  assert.ok(roles.includes('ORG_ADMIN'), `POST /requests must allow ORG_ADMIN, got: [${roles.join(', ')}]`);
}

// ── 4. stripPassengerPii removes phone and name from requests array ────────────
{
  const payload = {
    requests: [
      {
        id: 'req-001',
        type: 'SEAT',
        status: 'REQUESTED',
        from: 'Pithoragarh',
        to: 'Dehradun',
        passengerName: 'Kavita Joshi',
        passengerPhone: '+91 98765 43210',
        seats: 2,
      },
    ],
  };

  const result = stripPassengerPii(payload) as { requests: Record<string, unknown>[] };

  assert.equal(result.requests.length, 1, 'request count must be preserved');
  assert.equal(result.requests[0].id, 'req-001', 'id must be preserved');
  assert.equal(result.requests[0].from, 'Pithoragarh', 'from must be preserved');
  assert.equal(result.requests[0].type, 'SEAT', 'type must be preserved');
  assert.equal(result.requests[0].passengerPhone, undefined, 'passengerPhone must be stripped');
  assert.equal(result.requests[0].passengerName, undefined, 'passengerName must be stripped');
}

// ── 5. stripPassengerPii preserves other top-level fields ─────────────────────
{
  const payload = { requests: [{ id: 'r1', seats: 1, passengerPhone: '+91 99999 00000', passengerName: 'Test' }], total: 1 };
  const result = stripPassengerPii(payload) as Record<string, unknown>;
  assert.equal(result.total, 1, 'top-level fields outside requests array must be preserved');
}

// ── 6. stripPassengerPii is a no-op when input has no requests array ──────────
{
  assert.deepEqual(stripPassengerPii(null), null, 'null passthrough');
  assert.deepEqual(stripPassengerPii(undefined), undefined, 'undefined passthrough');
  assert.deepEqual(stripPassengerPii({ ok: true, message: 'no requests key' }), { ok: true, message: 'no requests key' }, 'non-requests object unchanged');
}

// ── 7. SUPER_ADMIN bypasses role checks (verified via RolesGuard behaviour) ───
// SUPER_ADMIN bypass is enforced in RolesGuard itself (roles.guard.contract.test.ts).
// We confirm here that SUPER_ADMIN is NOT listed in @Roles — it bypasses via guard logic.
{
  const proto = RequestsController.prototype as unknown as Record<string, object>;
  const getR: string[] = Reflect.getMetadata(ROLES_KEY, proto.listRequests) ?? [];
  assert.ok(!getR.includes('SUPER_ADMIN'), 'SUPER_ADMIN should not appear in @Roles — it bypasses via RolesGuard');
}

console.log('requests.controller contract tests passed');

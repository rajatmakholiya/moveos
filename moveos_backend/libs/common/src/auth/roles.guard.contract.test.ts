import { strict as assert } from 'assert';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

function makeGuard(requiredRoles: string[] | undefined, userRole: string | undefined): boolean {
  const reflector = {
    getAllAndOverride: (_key: string, _targets: unknown[]) => requiredRoles,
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : {} }),
    }),
  } as any;
  return guard.canActivate(context) as boolean;
}

// ORG_ADMIN can access ORG_ADMIN-gated routes
assert.equal(makeGuard(['ORG_ADMIN'], 'ORG_ADMIN'), true, 'ORG_ADMIN allowed on @Roles("ORG_ADMIN")');

// ORG_ADMIN is denied SUPER_ADMIN-only routes
assert.equal(makeGuard(['SUPER_ADMIN'], 'ORG_ADMIN'), false, 'ORG_ADMIN denied on @Roles("SUPER_ADMIN")');

// ORG_ADMIN is denied ADMIN-only routes
assert.equal(makeGuard(['ADMIN'], 'ORG_ADMIN'), false, 'ORG_ADMIN denied on @Roles("ADMIN")');

// SUPER_ADMIN bypasses all role checks
assert.equal(makeGuard(['ORG_ADMIN'], 'SUPER_ADMIN'), true, 'SUPER_ADMIN bypasses @Roles("ORG_ADMIN")');
assert.equal(makeGuard(['DRIVER'], 'SUPER_ADMIN'), true, 'SUPER_ADMIN bypasses @Roles("DRIVER")');

// No required roles — all authenticated users pass
assert.equal(makeGuard(undefined, 'ORG_ADMIN'), true, 'ORG_ADMIN passes unguarded route');
assert.equal(makeGuard([], 'ORG_ADMIN'), true, 'ORG_ADMIN passes empty roles guard');

// Missing user is denied
assert.equal(makeGuard(['ORG_ADMIN'], undefined), false, 'missing user denied');

// DRIVER and PASSENGER are unaffected by the ORG_ADMIN tests
assert.equal(makeGuard(['DRIVER'], 'DRIVER'), true, 'DRIVER allowed on @Roles("DRIVER")');
assert.equal(makeGuard(['DRIVER'], 'PASSENGER'), false, 'PASSENGER denied on @Roles("DRIVER")');

// ---- Passenger canonical route: @Roles('PASSENGER') ----

// PASSENGER works on passenger-gated routes
assert.equal(makeGuard(['PASSENGER'], 'PASSENGER'), true, 'PASSENGER allowed on @Roles("PASSENGER")');

// DRIVER is rejected from passenger-only routes (no booking bypass)
assert.equal(makeGuard(['PASSENGER'], 'DRIVER'), false, 'DRIVER denied on @Roles("PASSENGER")');

// ORG_ADMIN is rejected from passenger-only routes
assert.equal(makeGuard(['PASSENGER'], 'ORG_ADMIN'), false, 'ORG_ADMIN denied on @Roles("PASSENGER")');

// SUPER_ADMIN bypasses even passenger routes
assert.equal(makeGuard(['PASSENGER'], 'SUPER_ADMIN'), true, 'SUPER_ADMIN bypasses @Roles("PASSENGER")');

// ---- RIDER compatibility: RIDER tokens are normalized to PASSENGER by jwt.strategy ----
// After normalization the guard sees 'PASSENGER', so RIDER must NOT reach the guard.
// This test documents that the guard itself does not accept RIDER on a PASSENGER route —
// normalization must happen upstream (jwt.strategy.ts).
assert.equal(makeGuard(['PASSENGER'], 'RIDER'), false, 'raw RIDER denied on @Roles("PASSENGER") — must be normalized upstream');

// ---- PassengerController @Roles('PASSENGER') applied at class level ----
import { PassengerController } from '../../../../apps/api-gateway/src/controllers/passenger.controller';
import 'reflect-metadata';

{
  const roles: string[] = Reflect.getMetadata(ROLES_KEY, PassengerController) ?? [];
  assert.ok(roles.includes('PASSENGER'), `PassengerController must declare @Roles('PASSENGER'), got: [${roles.join(', ')}]`);
}

// ---- BookingsController: write methods require PASSENGER, not the class ----
import { BookingsController } from '../../../../apps/api-gateway/src/controllers/bookings.controller';

{
  // NestJS SetMetadata stores metadata on the method function itself
  const proto = BookingsController.prototype as unknown as Record<string, object>;
  const createRoles: string[] = Reflect.getMetadata(ROLES_KEY, proto.createBooking) ?? [];
  assert.ok(createRoles.includes('PASSENGER'), `BookingsController.createBooking must require PASSENGER, got: [${createRoles.join(', ')}]`);

  const cancelRoles: string[] = Reflect.getMetadata(ROLES_KEY, proto.cancelBooking) ?? [];
  assert.ok(cancelRoles.includes('PASSENGER'), `BookingsController.cancelBooking must require PASSENGER, got: [${cancelRoles.join(', ')}]`);
}

console.log('roles.guard contract tests passed');

import 'reflect-metadata';
import { strict as assert } from 'assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTripDto } from './dto/create-trip.dto';
import { AssignmentStatus, ComplianceStatus, KycStatus, VehicleStatus } from '@prisma/client';
import { SchedulingService } from './scheduling.service';

async function validateDto(partial: Partial<CreateTripDto>): Promise<string[]> {
  const instance = plainToInstance(CreateTripDto, {
    routeId: 'route_1',
    departureAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    frontSeatsTotal: 1,
    backSeatsTotal: 3,
    departurePoint: 'Bus Stand',
    ...partial,
  });
  const errors = await validate(instance);
  return errors.map((e) => e.property);
}

function makeService(prismaOverrides: Record<string, unknown>): SchedulingService {
  const prisma = {
    route: { findUnique: async () => ({ id: 'route_1', isActive: true }) },
    scheduledTrip: {
      // No overlapping trips by default — the conflict check passes.
      findMany: async () => [],
      create: async (args: any) => ({ id: 'trip_1', ...args.data, route: {}, vehicle: {} }),
    },
    driverVehicleAssignment: { findUnique: async () => null },
    ...prismaOverrides,
  };
  const redis = { getClient: () => ({ publish: async () => 0 }) };
  return new SchedulingService(prisma as any, redis as any);
}

function makeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    status: AssignmentStatus.ACTIVE,
    driver: { kycStatus: KycStatus.APPROVED, complianceStatus: ComplianceStatus.CLEAR },
    vehicle: { id: 'veh_1', status: VehicleStatus.ACTIVE, complianceStatus: ComplianceStatus.CLEAR },
    ...overrides,
  };
}

const baseDto: CreateTripDto = {
  routeId: 'route_1',
  vehicleId: 'veh_1',
  departureAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  frontSeatsTotal: 1,
  backSeatsTotal: 3,
  departurePoint: 'Bus Stand',
};

void (async () => {
  // ─── DTO: vehicleId is required ──────────────────────────────────────────────

  const missingVehicle = await validateDto({});
  assert.ok(missingVehicle.includes('vehicleId'), 'vehicleId required in DTO — got: ' + missingVehicle.join(', '));

  const emptyVehicle = await validateDto({ vehicleId: '' });
  assert.ok(emptyVehicle.includes('vehicleId'), 'empty vehicleId fails validation');

  const validVehicle = await validateDto({ vehicleId: 'veh_123' });
  assert.ok(!validVehicle.includes('vehicleId'), 'valid vehicleId passes DTO validation');

  // ─── Service: vehicle not assigned to driver → 403 ──────────────────────────

  const svcUnassigned = makeService({ driverVehicleAssignment: { findUnique: async () => null } });
  try {
    await svcUnassigned.createTrip('drv_1', baseDto);
    assert.fail('Expected ForbiddenException for unassigned vehicle');
  } catch (e: any) {
    assert.equal(e.status, 403, 'unassigned vehicle → 403');
    assert.ok(e.message.includes('not assigned'), `message: ${e.message}`);
  }

  // ─── Service: assignment status SUSPENDED → 403 ──────────────────────────────

  const svcSuspended = makeService({
    driverVehicleAssignment: { findUnique: async () => makeAssignment({ status: AssignmentStatus.SUSPENDED }) },
  });
  try {
    await svcSuspended.createTrip('drv_1', baseDto);
    assert.fail('Expected ForbiddenException for suspended assignment');
  } catch (e: any) {
    assert.equal(e.status, 403, 'suspended assignment → 403');
    assert.ok(e.message.includes('not active'), `message: ${e.message}`);
  }

  // ─── Service: driver KYC not approved → 403 ──────────────────────────────────

  const svcBadKyc = makeService({
    driverVehicleAssignment: {
      findUnique: async () => makeAssignment({ driver: { kycStatus: KycStatus.PENDING, complianceStatus: ComplianceStatus.CLEAR } }),
    },
  });
  try {
    await svcBadKyc.createTrip('drv_1', baseDto);
    assert.fail('Expected ForbiddenException for unapproved KYC');
  } catch (e: any) {
    assert.equal(e.status, 403, 'unapproved KYC → 403');
    assert.ok(e.message.includes('KYC'), `message: ${e.message}`);
  }

  // ─── Service: vehicle status INACTIVE → 403 ──────────────────────────────────

  const svcInactiveVehicle = makeService({
    driverVehicleAssignment: {
      findUnique: async () => makeAssignment({ vehicle: { id: 'veh_1', status: VehicleStatus.INACTIVE, complianceStatus: ComplianceStatus.CLEAR } }),
    },
  });
  try {
    await svcInactiveVehicle.createTrip('drv_1', baseDto);
    assert.fail('Expected ForbiddenException for inactive vehicle');
  } catch (e: any) {
    assert.equal(e.status, 403, 'inactive vehicle → 403');
  }

  // ─── Service: valid assignment → trip created ────────────────────────────────

  const svcValid = makeService({
    driverVehicleAssignment: { findUnique: async () => makeAssignment() },
  });
  const result = await svcValid.createTrip('drv_1', baseDto);
  assert.ok(result.tripId ?? result.id, 'valid assignment creates trip');

  console.log('trip-creation contract tests passed');
})();

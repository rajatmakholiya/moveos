/**
 * Step 6 contract tests — DriverRideEligibilityService eligibility rules.
 * Instantiates the service directly with a mock Prisma.
 * Guards and decorators are bypassed; only business logic is tested.
 */
import { strict as assert } from 'assert';
import { BadRequestException } from '@nestjs/common';
import { AssignmentStatus, KycStatus, OrganizationDriverStatus, VehicleStatus } from '@prisma/client';
import { DriverRideEligibilityService } from './driver-ride-eligibility.service';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeOrgDriver(status: OrganizationDriverStatus = OrganizationDriverStatus.ACTIVE) {
  return { id: 'od_1', status };
}

function makeOrgVehicle(vehicleStatus: VehicleStatus = VehicleStatus.ACTIVE, kycStatus: KycStatus = KycStatus.APPROVED) {
  return { vehicle: { id: 'veh_1', status: vehicleStatus, kycStatus } };
}

function makeAssignment(status: AssignmentStatus = AssignmentStatus.ACTIVE) {
  return {
    id: 'asgn_1',
    vehicleId: 'veh_1',
    organizationId: 'org_1',
    status,
    assignmentType: 'PRIMARY',
  };
}

function service(prismaOverrides: Partial<Record<string, any>> = {}) {
  const prisma: any = {
    driver: {
      findUnique: async () => ({ id: 'drv_1' }),
    },
    driverVehicleAssignment: {
      // By default: first call (active filter) returns active assignment; second call (inactive check) also returns it.
      findFirst: async () => makeAssignment(AssignmentStatus.ACTIVE),
    },
    organizationDriver: {
      findUnique: async () => makeOrgDriver(),
    },
    organizationVehicle: {
      findUnique: async () => makeOrgVehicle(),
    },
    ...prismaOverrides,
  };
  return new DriverRideEligibilityService(prisma as any);
}

const defaultParams = {
  driverUserId: 'user_1',
  driverId: 'drv_1',
  vehicleId: 'veh_1',
  organizationId: 'org_1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

async function main() {
  let passed = 0;

  async function test(label: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${label}: ${err?.message ?? err}`);
      process.exitCode = 1;
    }
  }

  // 1. Active driver + active assignment + active approved vehicle → eligible
  await test('active driver + active assignment + active approved vehicle → eligible', async () => {
    const s = service();
    const ctx = await s.assertDriverCanOperateVehicle({ ...defaultParams, action: 'ACCEPT_RIDE' });
    assert.equal(ctx.eligible, true);
    assert.equal(ctx.driverId, 'drv_1');
    assert.equal(ctx.vehicleId, 'veh_1');
    assert.equal(ctx.assignmentId, 'asgn_1');
    assert.equal(ctx.organizationId, 'org_1');
  });

  // 2. PENDING_DRIVER_ACCEPTANCE org driver → blocked
  await test('PENDING_DRIVER_ACCEPTANCE org driver → blocked with driver_not_active_for_organization', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => makeOrgDriver(OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_not_active_for_organization');
  });

  // 3. PENDING_COMPLIANCE org driver → blocked
  await test('PENDING_COMPLIANCE org driver → blocked with driver_not_active_for_organization', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => makeOrgDriver(OrganizationDriverStatus.PENDING_COMPLIANCE) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_not_active_for_organization');
  });

  // 4. Suspended org driver → blocked
  await test('SUSPENDED org driver → blocked with driver_not_active_for_organization', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => makeOrgDriver(OrganizationDriverStatus.SUSPENDED) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_not_active_for_organization');
  });

  // 5. REMOVED org driver → blocked
  await test('REMOVED org driver → blocked with driver_not_active_for_organization', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => makeOrgDriver(OrganizationDriverStatus.REMOVED) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_not_active_for_organization');
  });

  // 6. Active driver with no assignment at all → blocked
  await test('active driver without any assignment → blocked with driver_not_assigned_to_vehicle', async () => {
    const s = service({
      driverVehicleAssignment: {
        findFirst: async () => null, // both active-check and fallback-check return null
      },
    });
    const result = await s.checkEligibility({ ...defaultParams, vehicleId: undefined });
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_not_assigned_to_vehicle');
  });

  // 7. Driver assigned to a different vehicle → blocked for requested vehicleId
  await test('driver assigned to another vehicle → blocked for specific vehicleId', async () => {
    const s = service({
      driverVehicleAssignment: {
        findFirst: async (args: any) => {
          // Only match if vehicleId filter is absent or matches 'veh_1'
          if (args?.where?.vehicleId && args.where.vehicleId !== 'veh_1') return null;
          return makeAssignment();
        },
      },
    });
    const result = await s.checkEligibility({ ...defaultParams, vehicleId: 'veh_other' });
    assert.equal(result.eligible, false);
  });

  // 8. Suspended assignment → blocked with assignment_not_active
  await test('SUSPENDED assignment → blocked with assignment_not_active', async () => {
    let callIndex = 0;
    const s = service({
      driverVehicleAssignment: {
        findFirst: async (args: any) => {
          callIndex++;
          // First call includes status: ACTIVE filter → return null (suspended doesn't match)
          if (args?.where?.status === AssignmentStatus.ACTIVE) return null;
          // Second call (fallback without status filter) → return the suspended assignment
          return makeAssignment(AssignmentStatus.SUSPENDED);
        },
      },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'assignment_not_active');
    assert.ok(callIndex >= 2, 'Should have made a fallback query');
  });

  // 9. Ended assignment → blocked with assignment_not_active
  await test('ENDED assignment → blocked with assignment_not_active', async () => {
    const s = service({
      driverVehicleAssignment: {
        findFirst: async (args: any) => {
          if (args?.where?.status === AssignmentStatus.ACTIVE) return null;
          return makeAssignment(AssignmentStatus.ENDED);
        },
      },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'assignment_not_active');
  });

  // 10. Vehicle from another org → blocked with vehicle_not_in_organization
  await test('vehicle not in organization → blocked with vehicle_not_in_organization', async () => {
    const s = service({
      organizationVehicle: { findUnique: async () => null },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'vehicle_not_in_organization');
  });

  // 11. Inactive vehicle → blocked with vehicle_not_active
  await test('inactive vehicle → blocked with vehicle_not_active', async () => {
    const s = service({
      organizationVehicle: { findUnique: async () => makeOrgVehicle(VehicleStatus.INACTIVE) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'vehicle_not_active');
  });

  // 12. Vehicle with unapproved KYC → blocked with vehicle_not_approved
  await test('unapproved KYC vehicle → blocked with vehicle_not_approved', async () => {
    const s = service({
      organizationVehicle: { findUnique: async () => makeOrgVehicle(VehicleStatus.ACTIVE, KycStatus.PENDING) },
    });
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'vehicle_not_approved');
  });

  // 13. checkEligibility returns eligible=false without throwing (soft check)
  await test('checkEligibility returns eligible=false with block reasons — never throws', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => null },
    });
    // Must not throw
    const result = await s.checkEligibility(defaultParams);
    assert.equal(result.eligible, false);
    assert.ok(result.blockReasons.length > 0, 'Should have at least one block reason');
    assert.ok(result.blockReasons[0].code, 'Block reason should have a code');
    assert.ok(result.blockReasons[0].message, 'Block reason should have a message');
  });

  // 14. assertDriverCanOperateVehicle throws BadRequestException on ineligible
  await test('assertDriverCanOperateVehicle throws BadRequestException on ineligible driver', async () => {
    const s = service({
      organizationDriver: { findUnique: async () => null },
    });
    await assert.rejects(
      () => s.assertDriverCanOperateVehicle({ ...defaultParams, action: 'ACCEPT_RIDE' }),
      BadRequestException,
    );
  });

  // 15. Driver profile missing → blocked with driver_profile_missing
  await test('unknown userId with no driver profile → driver_profile_missing', async () => {
    const s = service({
      driver: { findUnique: async () => null },
    });
    // driverId not provided — service must look it up from userId
    const result = await s.checkEligibility({ driverUserId: 'ghost_user' });
    assert.equal(result.eligible, false);
    assert.equal(result.blockReasons[0].code, 'driver_profile_missing');
  });

  // 16. Eligibility check does not modify OrganizationDriver status
  await test('eligibility check does not mutate OrganizationDriver', async () => {
    let orgDriverUpdated = false;
    const s = service({
      organizationDriver: {
        findUnique: async () => makeOrgDriver(),
        update: async () => { orgDriverUpdated = true; return {}; },
        updateMany: async () => { orgDriverUpdated = true; return {}; },
      },
    });
    await s.assertDriverCanOperateVehicle({ ...defaultParams, action: 'ACCEPT_RIDE' });
    assert.equal(orgDriverUpdated, false, 'OrganizationDriver must not be mutated by eligibility check');
  });

  // 17. Eligibility check does not create or mutate DriverVehicleAssignment
  await test('eligibility check does not create or mutate DriverVehicleAssignment', async () => {
    let assignmentMutated = false;
    const s = service({
      driverVehicleAssignment: {
        findFirst: async () => makeAssignment(),
        create: async () => { assignmentMutated = true; return {}; },
        update: async () => { assignmentMutated = true; return {}; },
        upsert: async () => { assignmentMutated = true; return {}; },
      },
    });
    await s.assertDriverCanOperateVehicle({ ...defaultParams, action: 'ACCEPT_RIDE' });
    assert.equal(assignmentMutated, false, 'DriverVehicleAssignment must not be mutated by eligibility check');
  });

  console.log(`\ndriver-ride-eligibility contract tests: ${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

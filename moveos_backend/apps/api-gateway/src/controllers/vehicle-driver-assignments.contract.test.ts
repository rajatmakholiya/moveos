/**
 * Step 5 contract tests — vehicle-driver assignment eligibility rules.
 * Instantiates VehicleDriverAssignmentsController directly with a mock Prisma.
 * All guard/decorator behaviour is bypassed; only business logic is tested.
 */
import { strict as assert } from 'assert';
import { ConflictException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, KycStatus, OrganizationDriverStatus, OrganizationMemberStatus, VehicleStatus } from '@prisma/client';
import { VehicleDriverAssignmentsController } from './vehicle-driver-assignments.controller';

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeOrgMember(status: OrganizationMemberStatus = OrganizationMemberStatus.ACTIVE) {
  return { status };
}

function makeOrgVehicle(vehicleStatus: VehicleStatus = VehicleStatus.ACTIVE, kycStatus: KycStatus = KycStatus.APPROVED) {
  return {
    vehicle: {
      id: 'veh_1',
      plate: 'UK05TA9999',
      vehicleNumber: 'UK05TA9999',
      vehicleType: 'SUV',
      type: 'SUV',
      status: vehicleStatus,
      kycStatus,
    },
  };
}

function makeOrgDriver(orgDriverStatus: OrganizationDriverStatus = OrganizationDriverStatus.ACTIVE) {
  return {
    id: 'od_1',
    driverId: 'drv_1',
    organizationId: 'org_1',
    status: orgDriverStatus,
    driver: {
      id: 'drv_1',
      name: 'Ravi Kumar',
      user: { phone: '+919876543210' },
    },
  };
}

function makeKycRecords() {
  return [
    { documentType: 'DRIVING_LICENSE', status: 'APPROVED' },
    { documentType: 'AADHAAR', status: 'APPROVED' },
  ];
}

function makeAssignment(
  overrides: Partial<{
    id: string;
    driverId: string;
    vehicleId: string;
    organizationId: string;
    status: AssignmentStatus;
    assignmentType: string;
    active: boolean;
    removalReason: string | null;
    endsAt: Date | null;
  }> = {},
) {
  return {
    id: 'asgn_1',
    driverId: 'drv_1',
    vehicleId: 'veh_1',
    organizationId: 'org_1',
    status: AssignmentStatus.ACTIVE,
    assignmentType: 'PRIMARY',
    active: true,
    note: null,
    removalReason: null,
    startsAt: new Date(),
    endsAt: null,
    assignedByUserId: null,
    source: 'admin',
    driver: { id: 'drv_1', name: 'Ravi Kumar', user: { phone: '+919876543210' } },
    vehicle: { id: 'veh_1', plate: 'UK05TA9999', vehicleNumber: 'UK05TA9999', vehicleType: 'SUV', status: VehicleStatus.ACTIVE },
    ...overrides,
  };
}

function controller(prismaOverrides: Partial<Record<string, any>>) {
  const prisma: any = {
    organizationMember: {
      findUnique: async () => makeOrgMember(),
    },
    organizationVehicle: {
      findUnique: async () => makeOrgVehicle(),
    },
    organizationDriver: {
      findUnique: async () => makeOrgDriver(),
      findMany: async () => [makeOrgDriver()],
    },
    kycRecord: {
      findMany: async () => makeKycRecords(),
    },
    driverVehicleAssignment: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => makeAssignment({ ...data }),
      update: async ({ data }: any) => makeAssignment({ ...data }),
      upsert: async ({ create }: any) => makeAssignment({ ...create }),
      updateMany: async () => ({ count: 0 }),
    },
    auditEvent: {
      create: async () => ({}),
    },
    ...prismaOverrides,
  };
  return new VehicleDriverAssignmentsController(prisma as any) as any;
}

const superAdminReq = { user: { sub: 'admin_1', role: 'SUPER_ADMIN' } };
const orgAdminReq = { user: { sub: 'admin_1', role: 'ORG_ADMIN' } };

// ─── Tests ───────────────────────────────────────────────────────────────────

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

  // 1. Org admin can list assignments for own org
  await test('org admin can list assignments for own org', async () => {
    const c = controller({
      driverVehicleAssignment: {
        findMany: async () => [makeAssignment()],
        count: async () => 1,
      },
    });
    const result = await c.listAssignments(orgAdminReq, 'org_1');
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.pagination.total, 1);
  });

  // 2. Org admin cannot list assignments for another org
  await test('org admin cannot list assignments for another org', async () => {
    const c = controller({
      organizationMember: { findUnique: async () => null },
    });
    await assert.rejects(() => c.listAssignments(orgAdminReq, 'org_other'), ForbiddenException);
  });

  // 3. Super admin bypasses org membership check
  await test('super admin bypasses org membership check', async () => {
    const c = controller({
      organizationMember: { findUnique: async () => null }, // would fail for org admin
      driverVehicleAssignment: { findMany: async () => [], count: async () => 0 },
    });
    const result = await c.listAssignments(superAdminReq, 'org_1');
    assert.equal(result.data.items.length, 0);
  });

  // 4. Assign active driver to active vehicle succeeds
  await test('assign active driver to active vehicle succeeds', async () => {
    const c = controller({});
    const result = await c.assignDriver(superAdminReq, 'org_1', 'veh_1', {
      driverId: 'drv_1',
      assignmentType: 'PRIMARY',
    });
    assert.equal(result.data.assignment.status, AssignmentStatus.ACTIVE);
    assert.equal(result.data.assignment.assignmentType, 'PRIMARY');
  });

  // 5. Assign PENDING_COMPLIANCE driver fails
  await test('assign PENDING_COMPLIANCE driver fails', async () => {
    const c = controller({
      organizationDriver: {
        findUnique: async () => makeOrgDriver(OrganizationDriverStatus.PENDING_COMPLIANCE),
      },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      BadRequestException,
    );
  });

  // 6. Assign INVITED driver fails
  await test('assign INVITED driver fails', async () => {
    const c = controller({
      organizationDriver: {
        findUnique: async () => makeOrgDriver(OrganizationDriverStatus.INVITED),
      },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      BadRequestException,
    );
  });

  // 7. Assign driver from another organization fails
  await test('assign driver from another organization fails', async () => {
    const c = controller({
      organizationDriver: { findUnique: async () => null },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_other', assignmentType: 'PRIMARY' }),
      BadRequestException,
    );
  });

  // 8. Assign vehicle from another organization fails
  await test('assign vehicle from another organization fails', async () => {
    const c = controller({
      organizationVehicle: { findUnique: async () => null },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_other', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      NotFoundException,
    );
  });

  // 9. Assign inactive vehicle fails
  await test('assign inactive vehicle fails', async () => {
    const c = controller({
      organizationVehicle: { findUnique: async () => makeOrgVehicle(VehicleStatus.INACTIVE) },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      BadRequestException,
    );
  });

  // 10. Assign vehicle without approved KYC fails
  await test('assign vehicle without approved KYC fails', async () => {
    const c = controller({
      organizationVehicle: { findUnique: async () => makeOrgVehicle(VehicleStatus.ACTIVE, KycStatus.PENDING) },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      BadRequestException,
    );
  });

  // 11. Duplicate active assignment fails
  await test('duplicate active assignment for same driver+vehicle fails', async () => {
    const c = controller({
      driverVehicleAssignment: {
        findUnique: async () => makeAssignment({ status: AssignmentStatus.ACTIVE }),
        findFirst: async () => null,
        findMany: async () => [],
        count: async () => 0,
      },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      ConflictException,
    );
  });

  // 12. Second active primary driver for same vehicle conflicts without flag
  await test('second primary driver conflicts without replaceExistingPrimary', async () => {
    const c = controller({
      driverVehicleAssignment: {
        findUnique: async () => null,
        findFirst: async () => makeAssignment({ driverId: 'drv_existing', assignmentType: 'PRIMARY' }),
        upsert: async ({ create }: any) => makeAssignment(create),
        count: async () => 0,
        findMany: async () => [],
      },
    });
    await assert.rejects(
      () => c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' }),
      ConflictException,
    );
  });

  // 13. Replace primary ends old and creates new when replaceExistingPrimary=true
  await test('replaceExistingPrimary=true ends old assignment and creates new', async () => {
    let endedId: string | null = null;
    const c = controller({
      driverVehicleAssignment: {
        findUnique: async () => null,
        // The controller runs two findFirst lookups: (1) is the new driver active on
        // another vehicle? (no) and (2) does this vehicle already have a PRIMARY? (yes)
        findFirst: async ({ where }: any) => {
          if (where?.assignmentType === 'PRIMARY' && where?.vehicleId === 'veh_1') {
            return makeAssignment({ id: 'old_asgn', driverId: 'drv_old', assignmentType: 'PRIMARY' });
          }
          return null;
        },
        update: async ({ where, data }: any) => {
          if (data.status === AssignmentStatus.ENDED) endedId = where.id;
          return makeAssignment({ id: where.id, ...data });
        },
        upsert: async ({ create }: any) => makeAssignment({ ...create }),
        findMany: async () => [],
        count: async () => 0,
      },
    });
    const result = await c.assignDriver(superAdminReq, 'org_1', 'veh_1', {
      driverId: 'drv_1',
      assignmentType: 'PRIMARY',
      replaceExistingPrimary: true,
      replacementReason: 'Shift changed',
    });
    assert.equal(endedId, 'old_asgn', 'Old assignment should be ended');
    assert.equal(result.data.assignment.status, AssignmentStatus.ACTIVE);
  });

  // 14. Remove assignment marks ENDED and preserves row
  await test('remove assignment marks ENDED and preserves row', async () => {
    let updatedData: any = null;
    const c = controller({
      driverVehicleAssignment: {
        findFirst: async () => makeAssignment({ status: AssignmentStatus.ACTIVE }),
        update: async ({ data }: any) => {
          updatedData = data;
          return makeAssignment(data);
        },
        findMany: async () => [],
        count: async () => 0,
      },
    });
    const result = await c.removeAssignment(superAdminReq, 'org_1', 'asgn_1', { reason: 'Driver changed vehicle' });
    assert.equal(updatedData.status, AssignmentStatus.ENDED);
    assert.equal(updatedData.active, false);
    assert.ok(updatedData.endsAt instanceof Date, 'endsAt should be set');
    assert.ok(result.data.assignment, 'Assignment should be returned');
  });

  // 15. Suspend assignment marks SUSPENDED
  await test('suspend assignment marks SUSPENDED', async () => {
    let updatedData: any = null;
    const c = controller({
      driverVehicleAssignment: {
        findFirst: async () => makeAssignment({ status: AssignmentStatus.ACTIVE }),
        update: async ({ data }: any) => {
          updatedData = data;
          return makeAssignment(data);
        },
        findMany: async () => [],
        count: async () => 0,
      },
    });
    await c.suspendAssignment(superAdminReq, 'org_1', 'asgn_1', { reason: 'Temporary unavailable' });
    assert.equal(updatedData.status, AssignmentStatus.SUSPENDED);
    assert.equal(updatedData.active, false);
    assert.equal(updatedData.removalReason, 'Temporary unavailable');
  });

  // 16. Restore validates driver is still active
  await test('restore fails when driver is no longer active', async () => {
    const c = controller({
      driverVehicleAssignment: {
        findFirst: async () => makeAssignment({ status: AssignmentStatus.SUSPENDED }),
        findMany: async () => [],
        update: async ({ data }: any) => makeAssignment(data),
        count: async () => 0,
      },
      organizationDriver: { findUnique: async () => makeOrgDriver(OrganizationDriverStatus.SUSPENDED) },
    });
    await assert.rejects(() => c.restoreAssignment(superAdminReq, 'org_1', 'asgn_1'), BadRequestException);
  });

  // 17. Eligible drivers endpoint returns only ACTIVE org drivers
  await test('eligible drivers returns only ACTIVE org drivers by default', async () => {
    const c = controller({
      organizationDriver: {
        findMany: async () => [makeOrgDriver(OrganizationDriverStatus.ACTIVE)],
      },
      driverVehicleAssignment: {
        findMany: async () => [],
        count: async () => 0,
      },
    });
    const result = await c.eligibleDrivers(superAdminReq, 'org_1');
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.items[0].organizationDriverStatus, OrganizationDriverStatus.ACTIVE);
    assert.equal(result.data.items[0].eligible, true);
  });

  // Bonus: assignment creation does not change OrganizationDriver status
  await test('assignment creation does not change OrganizationDriver status', async () => {
    let orgDriverUpdated = false;
    const c = controller({
      organizationDriver: {
        findUnique: async () => makeOrgDriver(),
        update: async () => { orgDriverUpdated = true; return {}; },
        findMany: async () => [makeOrgDriver()],
      },
    });
    await c.assignDriver(superAdminReq, 'org_1', 'veh_1', { driverId: 'drv_1', assignmentType: 'PRIMARY' });
    assert.equal(orgDriverUpdated, false, 'OrganizationDriver must not be updated by assignment API');
  });

  console.log(`\nvehicle-driver-assignment contract tests: ${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

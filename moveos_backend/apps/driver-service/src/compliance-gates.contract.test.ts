import { strict as assert } from 'assert';
import { AssignmentStatus, ComplianceStatus, KycStatus, VehicleStatus } from '@prisma/client';
import { DriverService } from './driver.service';

// ── Stubs ──────────────────────────────────────────────────────────────────────

function redisStub() {
  return {
    getClient: () => ({ get: async () => null, set: async () => 'OK', del: async () => 1 }),
    setDriverState: async () => undefined,
    setActiveRide: async () => undefined,
  } as any;
}

function compliantDriver() {
  return { id: 'drv_1', kycStatus: KycStatus.APPROVED, complianceStatus: ComplianceStatus.CLEAR };
}

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh_1',
    plate: 'UK05TA1234',
    status: VehicleStatus.ACTIVE,
    complianceStatus: ComplianceStatus.CLEAR,
    insuranceValidTill: new Date(Date.now() + 30 * 86_400_000),
    fitnessValidTill: new Date(Date.now() + 90 * 86_400_000),
    permitValidTill: null,
    pollutionValidTill: null,
    ...overrides,
  };
}

function service(assignmentVehicle: Record<string, unknown>, driverOverrides: Record<string, unknown> = {}) {
  const prisma = {
    driver: {
      findUnique: async () => ({ ...compliantDriver(), ...driverOverrides }),
      update: async ({ data }: any) => ({ id: 'drv_1', ...data }),
    },
    driverVehicleAssignment: {
      findFirst: async () => ({
        id: 'asgn_1',
        status: AssignmentStatus.ACTIVE,
        organizationId: null,
        startsAt: null,
        endsAt: null,
        driver: { ...compliantDriver(), ...driverOverrides },
        vehicle: assignmentVehicle,
      }),
    },
  };
  return new DriverService(prisma as any, redisStub(), {} as any);
}

async function main() {
  // ── Fully compliant driver + vehicle goes online ─────────────────────────────

  {
    const result = await service(vehicle()).goOnline('drv_1');
    assert.equal(result.online, true, 'compliant driver goes online');
  }

  // ── Expired insurance blocks go-online with actionable reason ────────────────

  {
    await assert.rejects(
      () => service(vehicle({ insuranceValidTill: new Date(Date.now() - 86_400_000) })).goOnline('drv_1'),
      (err: any) => {
        assert.equal(err.response?.error_code, 'vehicle_document_expired', 'expired insurance → vehicle_document_expired');
        const reasons = err.response?.compliance?.blockedReasons ?? [];
        assert.ok(reasons.some((r: any) => r.code === 'INSURANCE_EXPIRED'), 'INSURANCE_EXPIRED reason present');
        const actions = err.response?.compliance?.nextActions ?? [];
        assert.ok(actions.length > 0, 'nextActions tell the driver how to fix it');
        return true;
      },
      'expired insurance blocks go-online',
    );
  }

  // ── Multiple expired documents are all reported at once ──────────────────────

  {
    await assert.rejects(
      () =>
        service(
          vehicle({
            insuranceValidTill: new Date(Date.now() - 86_400_000),
            fitnessValidTill: new Date(Date.now() - 2 * 86_400_000),
          }),
        ).goOnline('drv_1'),
      (err: any) => {
        const codes = (err.response?.compliance?.blockedReasons ?? []).map((r: any) => r.code);
        assert.ok(codes.includes('INSURANCE_EXPIRED') && codes.includes('FITNESS_EXPIRED'), 'both expiries reported');
        return true;
      },
      'all expired docs reported together',
    );
  }

  // ── Unapproved driver KYC blocks with COMPLETE_KYC next action ───────────────

  {
    await assert.rejects(
      () => service(vehicle(), { kycStatus: KycStatus.PENDING }).goOnline('drv_1'),
      (err: any) => {
        assert.equal(err.response?.error_code, 'driver_compliance_required');
        const actions = err.response?.compliance?.nextActions ?? [];
        assert.ok(actions.some((a: any) => a.code === 'COMPLETE_KYC'), 'COMPLETE_KYC action offered');
        return true;
      },
      'pending KYC blocks go-online',
    );
  }

  // ── Inactive vehicle blocks with upload-documents action ─────────────────────

  {
    await assert.rejects(
      () => service(vehicle({ status: VehicleStatus.INACTIVE })).goOnline('drv_1'),
      (err: any) => err.response?.error_code === 'vehicle_compliance_required',
      'inactive vehicle blocks go-online',
    );
  }

  console.log('compliance-gates contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

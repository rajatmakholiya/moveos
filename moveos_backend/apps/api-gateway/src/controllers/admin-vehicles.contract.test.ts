import { strict as assert } from 'assert';
import { AssignmentStatus, DocumentStatus, DriverStatus, KycStatus, OrganizationDriverStatus, VehicleDocumentStatus, VehicleStatus } from '@prisma/client';
import { OrganizationsController, hasRequiredVehicleDocuments, summarizeVehicleDocumentStatus, summarizeVehicleKycStatus } from './organizations.controller';

function controller(prisma: any) {
  return new OrganizationsController(prisma, {} as any) as any;
}

async function main() {
  assert.equal(summarizeVehicleDocumentStatus([]), 'MISSING');
  assert.equal(summarizeVehicleDocumentStatus([{ status: DocumentStatus.APPROVED }]), DocumentStatus.APPROVED);
  assert.equal(
    summarizeVehicleDocumentStatus([{ status: DocumentStatus.APPROVED }, { status: DocumentStatus.PENDING }]),
    DocumentStatus.PENDING,
  );
  assert.equal(
    summarizeVehicleDocumentStatus([{ status: DocumentStatus.APPROVED }, { status: DocumentStatus.REJECTED }]),
    DocumentStatus.REJECTED,
  );
  assert.equal(
    summarizeVehicleKycStatus([{ status: DocumentStatus.EXPIRED }, { status: DocumentStatus.APPROVED }]),
    DocumentStatus.EXPIRED,
  );
  assert.equal(hasRequiredVehicleDocuments([
    { type: 'RC' },
    { type: 'INSURANCE' },
    { type: 'POLLUTION_CERTIFICATE' },
    { type: 'FITNESS_CERTIFICATE' },
    { type: 'PERMIT' },
  ]), true);
  assert.equal(hasRequiredVehicleDocuments([{ type: 'RC' }]), false);

  const auditEvent = { create: async () => ({}) };
  const created = await controller({
    vehicle: { findFirst: async () => null },
    auditEvent,
    $transaction: async (fn: any) => fn({
      vehicle: { create: async ({ data }: any) => ({ id: 'veh_1', ...data }) },
      organizationVehicle: { create: async ({ data }: any) => ({ id: 'link_1', ...data }) },
    }),
  }).createOrganizationVehicleRecord('user_1', 'org_1', {
    vehicleNumber: 'UK05TA9999',
    vehicleType: 'SUV',
    totalSeats: 5,
    frontSeats: 1,
    backSeats: 4,
  });
  assert.equal(created.vehicle.status, VehicleStatus.INACTIVE);
  assert.equal(created.vehicle.documentStatus, VehicleDocumentStatus.MISSING);
  assert.equal(created.vehicle.kycStatus, KycStatus.NOT_SUBMITTED);
  assert.equal(created.ownership.organizationId, 'org_1');

  assert.throws(() => controller({}).vehicleCreateData({ vehicleNumber: '', vehicleType: 'SUV', totalSeats: 5, frontSeats: 1, backSeats: 4 }), /vehicleNumber is required/);
  assert.throws(() => controller({}).vehicleCreateData({ vehicleNumber: 'UK05TA1111', vehicleType: 'SUV', totalSeats: 4, frontSeats: 2, backSeats: 3 }), /Seat capacity is invalid/);

  await assert.rejects(
    () => controller({
      vehicle: { findFirst: async () => ({ id: 'existing' }) },
    }).createOrganizationVehicleRecord('user_1', 'org_1', { vehicleNumber: 'UK05TA9999', vehicleType: 'SUV', totalSeats: 5, frontSeats: 1, backSeats: 4 }),
    /Vehicle number already exists/,
  );

  await assert.rejects(
    () => controller({
      organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1' } }) },
    }).createOrganizationVehicleDocumentRecord('user_1', 'org_1', 'veh_1', { type: 'RC' }),
    /url or fileUuid is required/,
  );

  await assert.rejects(
    () => controller({
      organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1' } }) },
      vehicleDocument: { findMany: async () => [{ type: 'RC', url: 'https://example.test/rc.pdf' }] },
    }).submitOrganizationVehicleKycRecord('user_1', 'org_1', 'veh_1', {}),
    /Required vehicle documents missing/,
  );

  await assert.rejects(
    () => controller({
      organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1' } }) },
    }).updateOrganizationVehicleRecord('user_1', 'org_1', 'veh_1', { status: VehicleStatus.ACTIVE }, false),
    /Vehicle activation requires approved KYC/,
  );

  await assert.rejects(
    () => controller({
      organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1', status: VehicleStatus.INACTIVE, kycStatus: KycStatus.PENDING } }) },
    }).assignOrganizationVehicleDriver('user_1', 'org_1', 'veh_1', 'drv_1'),
    /Vehicle must be ACTIVE with APPROVED KYC/,
  );

  await assert.rejects(
    () => controller({
      organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1', status: VehicleStatus.ACTIVE, kycStatus: KycStatus.APPROVED } }) },
      organizationDriver: { findUnique: async () => null },
    }).assignOrganizationVehicleDriver('user_1', 'org_1', 'veh_1', 'drv_other_org'),
    /Driver must belong to this organization and be active/,
  );

  const approvedRequiredDocuments = ['RC', 'INSURANCE', 'POLLUTION_CERTIFICATE', 'FITNESS_CERTIFICATE', 'PERMIT'].map(
    (type) => ({ type, status: DocumentStatus.APPROVED, url: `https://example.test/${type.toLowerCase()}.pdf` }),
  );
  const reviewWrites: any[] = [];
  const reviewed = await controller({
    kycRecord: {
      findFirst: async () => ({ id: 'kyc_1', entityId: 'veh_1', status: DocumentStatus.PENDING }),
      update: async ({ data }: any) => ({ id: 'kyc_1', ...data }),
    },
    vehicle: {
      findUnique: async () => ({ id: 'veh_1', documents: approvedRequiredDocuments }),
      update: async ({ data }: any) => {
        reviewWrites.push(data);
        return { id: 'veh_1', ...data };
      },
    },
    vehicleDocument: { updateMany: async ({ data }: any) => ({ count: 5, data }) },
  }).reviewVehicleKycRecord('super_1', 'veh_1', { status: DocumentStatus.APPROVED });
  assert.equal(reviewed.vehicle.kycStatus, KycStatus.APPROVED);
  assert.equal(reviewed.vehicle.documentStatus, VehicleDocumentStatus.APPROVED);
  assert.equal(reviewed.vehicle.status, VehicleStatus.ACTIVE);
  assert.deepEqual(reviewWrites[0], { kycStatus: KycStatus.APPROVED, documentStatus: VehicleDocumentStatus.APPROVED, status: VehicleStatus.ACTIVE });

  const assignment = await controller({
    organizationVehicle: { findUnique: async () => ({ id: 'link_1', endedAt: null, vehicle: { id: 'veh_1', status: VehicleStatus.ACTIVE, kycStatus: KycStatus.APPROVED } }) },
    organizationDriver: { findUnique: async () => ({ status: OrganizationDriverStatus.ACTIVE, driver: { id: 'drv_1', status: DriverStatus.ONLINE } }) },
    driverVehicleAssignment: { findFirst: async () => null },
    auditEvent,
    $transaction: async (fn: any) => fn({
      driverVehicleAssignment: {
        updateMany: async () => ({ count: 0 }),
        upsert: async ({ create }: any) => ({ id: 'assign_1', ...create }),
      },
    }),
  }).assignOrganizationVehicleDriver('user_1', 'org_1', 'veh_1', 'drv_1');
  assert.equal(assignment.status, AssignmentStatus.ACTIVE);
  assert.equal(assignment.organizationId, 'org_1');

  console.log('admin vehicles contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

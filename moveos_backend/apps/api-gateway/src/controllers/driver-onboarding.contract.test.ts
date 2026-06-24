import { strict as assert } from 'assert';
import { DriverOnboardingController } from './driver-onboarding.controller';

// Build controller with mock Prisma, bypass JwtAuthGuard by calling methods directly.
function controller(prisma: any) {
  return new DriverOnboardingController(prisma) as any;
}

// A minimal driver JWT payload.
function driverReq(driverId = 'drv_1', sub = 'usr_1') {
  return { user: { sub, driverId, role: 'DRIVER' } };
}

// A minimal driver record with all mandatory profile fields filled.
function fullDriver(overrides: Record<string, unknown> = {}) {
  return {
    id: 'drv_1',
    userId: 'usr_1',
    name: 'Ravi Kumar',
    dob: new Date('1995-05-12'),
    gender: 'MALE',
    currentAddressJson: { line1: 'House 1', city: 'Delhi', state: 'Delhi', pincode: '110001' },
    permanentAddressJson: { line1: 'House 2', city: 'Delhi', state: 'Delhi', pincode: '110001' },
    emergencyContactName: 'Suresh Kumar',
    emergencyContactPhone: '+919999999999',
    profilePhotoFileId: 'file_photo_001',
    alternatePhone: null,
    bloodGroup: 'B+',
    preferredLanguage: 'hi',
    user: { phone: '+919876543210', email: null },
    ...overrides,
  };
}

// A minimal driver record with no optional profile fields (mandatory ones missing).
function emptyDriver(overrides: Record<string, unknown> = {}) {
  return {
    id: 'drv_1',
    userId: 'usr_1',
    name: 'Ravi',
    dob: null,
    gender: null,
    currentAddressJson: null,
    permanentAddressJson: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    profilePhotoFileId: null,
    alternatePhone: null,
    bloodGroup: null,
    preferredLanguage: null,
    user: { phone: '+919876543210', email: null },
    ...overrides,
  };
}

// A KycRecord stub.
function kycStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kyc_1',
    entityType: 'DRIVER',
    entityId: 'drv_1',
    documentType: 'DRIVING_LICENSE',
    documentUrl: 'https://example.com/dl_front.jpg',
    documentNo: 'DL04201100001',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    rejectionReason: null,
    reviewedAt: null,
    reviewedById: null,
    metadataJson: { frontFileId: 'https://example.com/dl_front.jpg', backFileId: 'https://example.com/dl_back.jpg' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function orgDriverStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'od_1',
    driverId: 'drv_1',
    organizationId: 'org_1',
    status: 'PENDING_DRIVER_ACCEPTANCE',
    organization: { id: 'org_1', legalName: 'Test Org', tradeName: 'Test Fleet' },
    onboardingSubmittedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function main() {

  // ── requireDriverJwt: missing driverId throws ─────────────────────────────

  {
    const c = controller({});
    await assert.rejects(
      () => c.getOnboardingState({ user: { sub: 'usr_1', role: 'DRIVER' } }),
      (err: any) => err.response?.error_code === 'driver_jwt_required',
      'missing driverId in JWT throws driver_jwt_required',
    );
  }

  // ── GET /me — returns current state including missing fields/docs ──────────

  {
    const c = controller({
      driver: { findUnique: async () => emptyDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [] },
    });

    const result = await c.getOnboardingState(driverReq());
    assert.equal(result.status, 'ok', 'GET me returns ok');
    assert.equal(result.data.driverId, 'drv_1', 'driverId present');
    assert.ok(Array.isArray(result.data.missingRequiredFields), 'missingRequiredFields is array');
    assert.ok(result.data.missingRequiredFields.length > 0, 'empty driver has missing fields');
    assert.ok(result.data.missingRequiredDocuments.includes('DRIVING_LICENSE'), 'DRIVING_LICENSE in missing docs');
    assert.ok(result.data.missingRequiredDocuments.includes('AADHAAR'), 'AADHAAR in missing docs');
    assert.equal(result.data.nextStep, 'COMPLETE_PROFILE', 'nextStep is COMPLETE_PROFILE when fields missing');
  }

  // ── GET /me — nextStep is SUBMIT_ONBOARDING when profile + docs complete ──

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE' }),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR' }),
        ],
      },
    });

    const result = await c.getOnboardingState(driverReq());
    assert.equal(result.data.missingRequiredFields.length, 0, 'no missing fields when profile complete');
    assert.equal(result.data.missingRequiredDocuments.length, 0, 'no missing docs when both uploaded');
    assert.equal(result.data.nextStep, 'SUBMIT_ONBOARDING', 'nextStep is SUBMIT_ONBOARDING when ready');
  }

  // ── PUT /profile — updates driver fields ──────────────────────────────────

  {
    const updates: any[] = [];
    let updatedUser = false;
    const c = controller({
      driver: {
        findUnique: async () => emptyDriver(),
        update: async ({ data }: any) => {
          updates.push(data);
          return { ...emptyDriver(), ...data, user: { phone: '+919876543210', email: null } };
        },
      },
      user: { update: async () => { updatedUser = true; return {}; } },
    });

    const result = await c.updateProfile(driverReq(), {
      fullName: 'Ravi Kumar',
      dob: '1995-05-12',
      gender: 'MALE',
      email: 'ravi@example.com',
      emergencyContactName: 'Suresh',
      emergencyContactPhone: '+919999999999',
    });

    assert.equal(result.status, 'ok', 'PUT profile returns ok');
    assert.equal(updates[0].name, 'Ravi Kumar', 'fullName stored as name');
    assert.ok(updates[0].dob instanceof Date, 'dob stored as Date');
    assert.equal(updates[0].gender, 'MALE', 'gender stored');
    assert.ok(updatedUser, 'user email updated');
    assert.ok(typeof result.data.completionPercent === 'number', 'completionPercent returned');
  }

  // ── PUT /profile — cannot change phone (phone is on User not updated here) ──

  {
    let nameUpdated = false;
    const c = controller({
      driver: {
        findUnique: async () => emptyDriver(),
        update: async ({ data }: any) => {
          if (data.name) nameUpdated = true;
          return { ...emptyDriver(), ...data, user: { phone: '+919876543210', email: null } };
        },
      },
      user: { update: async () => ({}) },
    });

    // No phone field in UpdateDriverProfileDto — test that response phone is unchanged
    const result = await c.updateProfile(driverReq(), { fullName: 'New Name' });
    assert.equal(result.data.profile.phone, '+919876543210', 'phone unchanged after profile update');
    assert.ok(nameUpdated, 'name was updated');
  }

  // ── POST /documents — creates new document ─────────────────────────────────

  {
    const created: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      kycRecord: {
        findFirst: async () => null,
        create: async ({ data }: any) => { created.push(data); return { ...kycStub(), ...data }; },
      },
    });

    const result = await c.upsertDocument(driverReq(), {
      documentType: 'DRIVING_LICENSE',
      documentNumber: 'DL0420110012345',
      frontFileId: 'https://example.com/dl_front.jpg',
      backFileId: 'https://example.com/dl_back.jpg',
      issueDate: '2020-01-01',
      expiryDate: '2030-01-01',
      issuingAuthority: 'Delhi RTO',
    });

    assert.equal(result.status, 'ok', 'POST documents returns ok');
    assert.equal(created[0].entityType, 'DRIVER', 'entityType is DRIVER');
    assert.equal(created[0].entityId, 'drv_1', 'entityId is driverId');
    assert.equal(created[0].documentType, 'DRIVING_LICENSE', 'documentType stored');
    assert.equal(created[0].documentUrl, 'https://example.com/dl_front.jpg', 'frontFileId used as documentUrl');
    assert.equal(created[0].status, 'PENDING', 'document status is PENDING');
    assert.ok(result.data.document.frontFileId, 'frontFileId in response');
    assert.ok(!('documentUrl' in result.data.document), 'raw documentUrl not exposed in response (normalized to frontFileId)');
  }

  // ── POST /documents — updates existing pending document (no duplicate) ─────

  {
    const updates: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      kycRecord: {
        findFirst: async () => kycStub({ status: 'PENDING' }),
        update: async ({ data }: any) => { updates.push(data); return { ...kycStub(), ...data }; },
      },
    });

    await c.upsertDocument(driverReq(), { documentType: 'DRIVING_LICENSE', frontFileId: 'https://example.com/new_front.jpg' });
    assert.equal(updates.length, 1, 'updated existing, did not create duplicate');
    assert.equal(updates[0].documentUrl, 'https://example.com/new_front.jpg', 'new frontFileId stored');
    assert.equal(updates[0].status, 'PENDING', 'status reset to PENDING on update');
    assert.equal(updates[0].rejectionReason, null, 'rejectionReason cleared on update');
  }

  // ── POST /documents — also updates rejected documents ─────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      kycRecord: {
        findFirst: async () => kycStub({ status: 'REJECTED', rejectionReason: 'Blurry image' }),
        update: async ({ data }: any) => { updates.push(data); return { ...kycStub(), ...data, status: 'PENDING' }; },
      },
    });

    const result = await c.upsertDocument(driverReq(), { documentType: 'DRIVING_LICENSE', frontFileId: 'https://example.com/clear_front.jpg' });
    assert.equal(updates[0].status, 'PENDING', 'rejected doc can be resubmitted');
    assert.equal(result.data.document.status, 'PENDING', 'returned document is PENDING');
  }

  // ── POST /documents — blocks overwrite of approved document ───────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      kycRecord: { findFirst: async () => kycStub({ status: 'APPROVED' }) },
    });

    await assert.rejects(
      () => c.upsertDocument(driverReq(), { documentType: 'DRIVING_LICENSE', frontFileId: 'https://example.com/new.jpg' }),
      (err: any) => err.response?.error_code === 'document_already_approved',
      'approved document cannot be overwritten',
    );
  }

  // ── GET /documents — only returns current driver's docs ───────────────────

  {
    const c = controller({
      kycRecord: {
        findMany: async ({ where }: any) => {
          if (where.entityId !== 'drv_1') return [];
          return [kycStub()];
        },
      },
    });

    const result = await c.listDocuments(driverReq());
    assert.equal(result.data.documents.length, 1, 'returns 1 document for drv_1');

    // Simulate another driver calling with drv_2 — should see 0 documents
    const c2 = controller({
      kycRecord: {
        findMany: async ({ where }: any) => {
          if (where.entityId === 'drv_2') return [];
          return [kycStub()];
        },
      },
    });
    const result2 = await c2.listDocuments({ user: { sub: 'usr_2', driverId: 'drv_2', role: 'DRIVER' } });
    assert.equal(result2.data.documents.length, 0, 'driver cannot see another driver documents');
  }

  // ── DELETE /documents — blocks deleting approved document ─────────────────

  {
    const c = controller({
      kycRecord: { findUnique: async () => kycStub({ status: 'APPROVED' }) },
    });

    await assert.rejects(
      () => c.deleteDocument(driverReq(), 'kyc_1'),
      (err: any) => err.response?.error_code === 'document_approved_cannot_delete',
      'approved document cannot be deleted',
    );
  }

  // ── DELETE /documents — another driver cannot delete this driver's doc ─────

  {
    const c = controller({
      kycRecord: { findUnique: async () => kycStub({ entityId: 'drv_1', status: 'PENDING' }) },
    });

    await assert.rejects(
      () => c.deleteDocument({ user: { sub: 'usr_2', driverId: 'drv_2', role: 'DRIVER' } }, 'kyc_1'),
      (err: any) => err.response?.error_code === 'document_not_found',
      'driver cannot delete another driver document (returns not found)',
    );
  }

  // ── POST /submit — fails when profile fields are missing ──────────────────

  {
    const c = controller({
      driver: { findUnique: async () => emptyDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE' }),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR' }),
        ],
      },
    });

    await assert.rejects(
      () => c.submitOnboarding(driverReq()),
      (err: any) => err.response?.error_code === 'missing_profile_fields',
      'submit fails when mandatory profile fields are missing',
    );
  }

  // ── POST /submit — fails when mandatory documents are missing ─────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [] },
    });

    await assert.rejects(
      () => c.submitOnboarding(driverReq()),
      (err: any) => err.response?.error_code === 'missing_required_documents',
      'submit fails when mandatory documents are missing',
    );
  }

  // ── POST /submit — fails when driving license is expired ──────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE', expiresAt: new Date(Date.now() - 1000) }),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR', expiresAt: null }),
        ],
      },
    });

    await assert.rejects(
      () => c.submitOnboarding(driverReq()),
      (err: any) => err.response?.error_code === 'driving_license_expired',
      'submit fails when driving license is expired',
    );
  }

  // ── POST /submit — success moves to PENDING_COMPLIANCE ────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: {
        findFirst: async () => orgDriverStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...orgDriverStub(), ...data }; },
      },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE' }),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR', expiresAt: null }),
        ],
      },
    });

    const result = await c.submitOnboarding(driverReq());
    assert.equal(result.status, 'ok', 'submit returns ok');
    assert.equal(result.data.status, 'PENDING_COMPLIANCE', 'status moved to PENDING_COMPLIANCE');
    assert.equal(result.data.nextStep, 'WAIT_FOR_VERIFICATION', 'nextStep is WAIT_FOR_VERIFICATION');
    assert.equal(updates[0].status, 'PENDING_COMPLIANCE', 'OrganizationDriver.status updated');
    assert.ok(updates[0].onboardingSubmittedAt instanceof Date, 'onboardingSubmittedAt set');
  }

  // ── POST /submit — does not activate driver ───────────────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: {
        findFirst: async () => orgDriverStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...orgDriverStub(), ...data }; },
      },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE' }),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR', expiresAt: null }),
        ],
      },
    });

    await c.submitOnboarding(driverReq());
    assert.notEqual(updates[0].status, 'ACTIVE', 'driver must NOT be moved to ACTIVE on submit');
    assert.equal(updates[0].status, 'PENDING_COMPLIANCE', 'status is exactly PENDING_COMPLIANCE');
  }

  // ── POST /submit — no org mapping throws ─────────────────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => null },
      kycRecord: { findMany: async () => [] },
    });

    await assert.rejects(
      () => c.submitOnboarding(driverReq()),
      (err: any) => err.response?.error_code === 'no_org_mapping',
      'submit fails with no_org_mapping when no OrganizationDriver exists',
    );
  }

  console.log('driver-onboarding contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

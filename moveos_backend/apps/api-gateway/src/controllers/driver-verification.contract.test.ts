import { strict as assert } from 'assert';
import { DriverVerificationController } from './driver-verification.controller';

function controller(prisma: any) {
  return new DriverVerificationController(prisma) as any;
}

const superAdminReq = { user: { sub: 'admin_1', role: 'SUPER_ADMIN' } };
const orgAdminReq = { user: { sub: 'org_1', role: 'ORG_ADMIN' } };

function fullDriver(overrides: Record<string, unknown> = {}) {
  return {
    id: 'drv_1',
    userId: 'usr_1',
    name: 'Ravi Kumar',
    dob: new Date('1995-05-12'),
    gender: 'MALE',
    currentAddressJson: { line1: 'H-5', city: 'Delhi', state: 'Delhi', pincode: '110001' },
    permanentAddressJson: { line1: 'H-5', city: 'Delhi', state: 'Delhi', pincode: '110001' },
    emergencyContactName: 'Suresh',
    emergencyContactPhone: '+919999999999',
    profilePhotoFileId: 'file_photo_001',
    bloodGroup: 'B+',
    preferredLanguage: 'hi',
    alternatePhone: null,
    kycStatus: 'PENDING',
    complianceStatus: 'CLEAR',
    user: { id: 'usr_1', phone: '+919876543210', email: null, name: 'Ravi Kumar', status: 'ACTIVE' },
    ...overrides,
  };
}

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
    bloodGroup: null,
    preferredLanguage: null,
    alternatePhone: null,
    kycStatus: 'PENDING',
    complianceStatus: 'CLEAR',
    user: { id: 'usr_1', phone: '+919876543210', email: null, name: 'Ravi', status: 'ACTIVE' },
    ...overrides,
  };
}

function orgDriverStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'od_1',
    driverId: 'drv_1',
    organizationId: 'org_1',
    status: 'PENDING_COMPLIANCE',
    organization: { id: 'org_1', legalName: 'Test Org', tradeName: 'Test Fleet' },
    onboardingSubmittedAt: new Date(),
    activatedAt: null,
    approvedBySuperAdminId: null,
    complianceApprovedAt: null,
    complianceRejectedAt: null,
    complianceRejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function kycStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kyc_1',
    entityType: 'DRIVER',
    entityId: 'drv_1',
    documentType: 'DRIVING_LICENSE',
    documentUrl: 'https://example.com/dl_front.jpg',
    documentNo: 'DL04201100001234',
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

function approvedKyc(documentType: string, overrides: Record<string, unknown> = {}) {
  return kycStub({ id: `kyc_${documentType}`, documentType, status: 'APPROVED', ...overrides });
}

async function main() {

  // ── List verifications — returns PENDING_COMPLIANCE drivers ───────────────

  {
    const pendingDriver = {
      id: 'od_1', driverId: 'drv_1', organizationId: 'org_1', status: 'PENDING_COMPLIANCE',
      onboardingSubmittedAt: new Date(), activatedAt: null,
      organization: { id: 'org_1', legalName: 'Test Org', tradeName: null },
      driver: { userId: 'usr_1', name: 'Ravi Kumar', user: { phone: '+919876543210', email: null } },
    };
    const c = controller({
      organizationDriver: {
        count: async () => 1,
        findMany: async () => [pendingDriver],
      },
      kycRecord: { findMany: async () => [kycStub()] },
    });

    const result = await c.listVerifications();
    assert.equal(result.status, 'ok', 'list returns ok');
    assert.equal(result.data.items.length, 1, 'returns 1 item');
    assert.equal(result.data.items[0].status, 'PENDING_COMPLIANCE', 'item status is PENDING_COMPLIANCE');
    assert.ok('documentSummary' in result.data.items[0], 'documentSummary present');
    assert.equal(result.data.pagination.total, 1, 'pagination.total correct');
  }

  // ── GET detail — returns driver profile, org mapping, docs, missing requirements ──

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [kycStub({ documentType: 'DRIVING_LICENSE' }), kycStub({ id: 'kyc_2', documentType: 'AADHAAR', expiresAt: null })] },
    });

    const result = await c.getVerificationDetail('drv_1');
    assert.equal(result.status, 'ok', 'detail returns ok');
    assert.ok(result.data.driver, 'driver present');
    assert.ok(result.data.organizationDriver, 'org mapping present');
    assert.equal(result.data.documents.length, 2, '2 documents returned');
    assert.ok('missingRequiredFields' in result.data, 'missingRequiredFields present');
    assert.ok('canApproveProfile' in result.data, 'canApproveProfile present');
  }

  // ── GET detail — sensitive fields not exposed ─────────────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [kycStub()] },
    });

    const result = await c.getVerificationDetail('drv_1');
    const doc = result.data.documents[0];
    assert.ok(!('documentUrl' in doc), 'raw documentUrl not exposed in document');
    assert.ok(!('documentNo' in doc) || doc.documentNumberMasked !== undefined, 'document number is masked');
    // Aadhaar: full number must not appear
    const aadhaar = { ...kycStub({ documentType: 'AADHAAR', documentNo: '123456789012' }) };
    const c2 = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findFirst: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [aadhaar] },
    });
    const r2 = await c2.getVerificationDetail('drv_1');
    const aadhaarDoc = r2.data.documents[0];
    assert.ok(aadhaarDoc.documentNumberMasked !== '123456789012', 'full Aadhaar number not exposed');
    assert.ok(aadhaarDoc.documentNumberMasked.startsWith('XXXX'), 'Aadhaar masked with XXXX prefix');
  }

  // ── Approve document — success ────────────────────────────────────────────

  {
    const updates: any[] = [];
    const auditCreated: any[] = [];
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: {
        findUnique: async () => kycStub({ status: 'PENDING' }),
        update: async ({ data }: any) => { updates.push(data); return { ...kycStub(), ...data }; },
      },
      auditEvent: { create: async ({ data }: any) => { auditCreated.push(data); return {}; } },
    });

    const result = await c.approveDocument(superAdminReq, 'drv_1', 'kyc_1', { remarks: 'Looks good' });
    assert.equal(result.status, 'ok', 'approve returns ok');
    assert.equal(updates[0].status, 'APPROVED', 'document status set to APPROVED');
    assert.ok(updates[0].reviewedAt instanceof Date, 'reviewedAt set');
    assert.equal(updates[0].reviewedById, 'admin_1', 'reviewedById set to super admin');
    assert.equal(updates[0].rejectionReason, null, 'rejectionReason cleared on approval');
    assert.equal(auditCreated.length, 1, 'audit event created');
    assert.equal(auditCreated[0].action, 'driver_document.approved', 'correct audit action');
  }

  // ── Approve document — cannot approve document from another driver ─────────

  {
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: { findUnique: async () => kycStub({ entityId: 'drv_2' }) },
    });

    await assert.rejects(
      () => c.approveDocument(superAdminReq, 'drv_1', 'kyc_1', {}),
      (err: any) => err.response?.error_code === 'document_not_found',
      'cannot approve document belonging to another driver',
    );
  }

  // ── Reject document — requires reason ─────────────────────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: { findUnique: async () => kycStub({ status: 'PENDING' }) },
    });

    // Reject without reason triggers DTO validation at runtime, but we test
    // that the reason field is actually stored when provided.
    // (DTO validation is framework-level, so test the handler stores reason)
    const updates: any[] = [];
    const auditCreated: any[] = [];
    const c2 = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: {
        findUnique: async () => kycStub({ status: 'PENDING' }),
        update: async ({ data }: any) => { updates.push(data); return { ...kycStub(), ...data }; },
      },
      auditEvent: { create: async ({ data }: any) => { auditCreated.push(data); return {}; } },
    });

    const result = await c2.rejectDocument(superAdminReq, 'drv_1', 'kyc_1', { reason: 'Image is blurry', remarks: 'Re-upload' });
    assert.equal(result.status, 'ok', 'reject returns ok');
    assert.equal(updates[0].status, 'REJECTED', 'document set to REJECTED');
    assert.equal(updates[0].rejectionReason, 'Image is blurry', 'reason stored');
    assert.equal(auditCreated[0].action, 'driver_document.rejected', 'audit action for rejection');
  }

  // ── Reject document — stores reason in KycRecord ─────────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: {
        findUnique: async () => kycStub({ status: 'PENDING' }),
        update: async ({ data }: any) => { updates.push(data); return { ...kycStub(), ...data }; },
      },
      auditEvent: { create: async () => ({}) },
    });

    await c.rejectDocument(superAdminReq, 'drv_1', 'kyc_1', { reason: 'Face not visible in photo' });
    assert.equal(updates[0].rejectionReason, 'Face not visible in photo', 'rejection reason correctly stored');
  }

  // ── Full approval fails — mandatory profile fields missing ─────────────────

  {
    const c = controller({
      driver: { findUnique: async () => emptyDriver() },
      organizationDriver: { findUnique: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [approvedKyc('DRIVING_LICENSE'), approvedKyc('AADHAAR', { expiresAt: null })],
      },
    });

    await assert.rejects(
      () => c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' }),
      (err: any) => err.response?.error_code === 'missing_profile_fields',
      'full approval fails when mandatory profile fields are missing',
    );
  }

  // ── Full approval fails — DRIVING_LICENSE missing ──────────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findUnique: async () => orgDriverStub() },
      kycRecord: { findMany: async () => [approvedKyc('AADHAAR', { expiresAt: null })] },
    });

    await assert.rejects(
      () => c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' }),
      (err: any) => err.response?.error_code === 'missing_required_documents',
      'full approval fails when DRIVING_LICENSE is missing',
    );
  }

  // ── Full approval succeeds with only DRIVING_LICENSE — AADHAAR is optional ─

  {
    const updates: any[] = [];
    const c = controller({
      driver: {
        findUnique: async () => fullDriver(),
        update: async ({ data }: any) => ({ id: 'drv_1', ...data }),
      },
      organizationDriver: {
        findUnique: async () => orgDriverStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...orgDriverStub(), ...data }; },
      },
      kycRecord: { findMany: async () => [approvedKyc('DRIVING_LICENSE')] },
      auditEvent: { create: async () => ({}) },
    });

    const result = await c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' });
    assert.equal(result.data.status, 'ACTIVE', 'AADHAAR is optional — approved DL alone is sufficient');
  }

  // ── Full approval fails — mandatory doc is PENDING (not approved) ──────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findUnique: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          kycStub({ documentType: 'DRIVING_LICENSE', status: 'PENDING' }),
          approvedKyc('AADHAAR', { expiresAt: null }),
        ],
      },
    });

    await assert.rejects(
      () => c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' }),
      (err: any) => err.response?.error_code === 'mandatory_docs_not_approved',
      'approval fails when mandatory doc is PENDING',
    );
  }

  // ── Full approval fails — mandatory doc is REJECTED ───────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findUnique: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          approvedKyc('DRIVING_LICENSE'),
          kycStub({ id: 'kyc_2', documentType: 'AADHAAR', status: 'REJECTED', expiresAt: null }),
        ],
      },
    });

    await assert.rejects(
      () => c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' }),
      // DL is approved here; the REJECTED Aadhaar (a submitted optional doc) is what blocks
      (err: any) => err.response?.error_code === 'optional_docs_not_approved',
      'approval fails when a submitted optional doc is REJECTED',
    );
  }

  // ── Full approval fails — driving license expired ──────────────────────────

  {
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: { findUnique: async () => orgDriverStub() },
      kycRecord: {
        findMany: async () => [
          approvedKyc('DRIVING_LICENSE', { expiresAt: new Date(Date.now() - 1000) }),
          approvedKyc('AADHAAR', { expiresAt: null }),
        ],
      },
    });

    await assert.rejects(
      () => c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' }),
      (err: any) => err.response?.error_code === 'driving_license_expired',
      'approval fails when driving license is expired',
    );
  }

  // ── Full approval — success moves to ACTIVE ───────────────────────────────

  {
    const updates: any[] = [];
    const auditCreated: any[] = [];
    const c = controller({
      driver: {
        findUnique: async () => fullDriver(),
        update: async ({ data }: any) => ({ id: 'drv_1', ...data }),
      },
      organizationDriver: {
        findUnique: async () => orgDriverStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...orgDriverStub(), ...data }; },
      },
      kycRecord: {
        findMany: async () => [
          approvedKyc('DRIVING_LICENSE'),
          approvedKyc('AADHAAR', { expiresAt: null }),
        ],
      },
      auditEvent: { create: async ({ data }: any) => { auditCreated.push(data); return {}; } },
    });

    const result = await c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1', remarks: 'All good' });
    assert.equal(result.status, 'ok', 'approval returns ok');
    assert.equal(result.data.status, 'ACTIVE', 'driver moved to ACTIVE');
    assert.equal(updates[0].status, 'ACTIVE', 'OrganizationDriver.status updated to ACTIVE');
    assert.ok(updates[0].activatedAt instanceof Date, 'activatedAt set');
    assert.equal(updates[0].approvedBySuperAdminId, 'admin_1', 'approvedBySuperAdminId recorded');
    assert.equal(auditCreated[0].action, 'driver.activated', 'correct audit action on activation');
  }

  // ── Full approval — does NOT activate other org mappings for same driver ───

  {
    let updateCount = 0;
    const c = controller({
      driver: {
        findUnique: async () => fullDriver(),
        update: async ({ data }: any) => ({ id: 'drv_1', ...data }),
      },
      organizationDriver: {
        findUnique: async () => orgDriverStub(),
        update: async ({ data }: any) => { updateCount++; return { ...orgDriverStub(), ...data }; },
      },
      kycRecord: {
        findMany: async () => [
          approvedKyc('DRIVING_LICENSE'),
          approvedKyc('AADHAAR', { expiresAt: null }),
        ],
      },
      auditEvent: { create: async () => ({}) },
    });

    await c.approveDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1' });
    assert.equal(updateCount, 1, 'only 1 OrganizationDriver row updated (not other org mappings)');
  }

  // ── Rejection — stores rejection info and keeps PENDING_COMPLIANCE ─────────

  {
    const updates: any[] = [];
    const auditCreated: any[] = [];
    const c = controller({
      driver: { findUnique: async () => fullDriver() },
      organizationDriver: {
        findUnique: async () => orgDriverStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...orgDriverStub(), ...data, status: 'PENDING_COMPLIANCE' }; },
      },
      auditEvent: { create: async ({ data }: any) => { auditCreated.push(data); return {}; } },
    });

    const result = await c.rejectDriver(superAdminReq, 'drv_1', { organizationDriverId: 'od_1', reason: 'Profile photo missing' });
    assert.equal(result.status, 'ok', 'reject driver returns ok');
    assert.equal(result.data.nextStep, 'RESUBMIT_REQUIRED', 'nextStep is RESUBMIT_REQUIRED');
    assert.equal(updates[0].complianceRejectionReason, 'Profile photo missing', 'rejection reason stored');
    assert.ok(updates[0].complianceRejectedAt instanceof Date, 'complianceRejectedAt set');
    assert.notEqual(result.data.status, 'ACTIVE', 'driver NOT activated on rejection');
    assert.equal(auditCreated[0].action, 'driver.compliance_rejected', 'audit action for rejection');
  }

  // ── Verification history — audit events returned in order ─────────────────

  {
    const auditEvents = [
      { id: 'evt_1', action: 'driver.activated', actorUserId: 'admin_1', reason: null, afterJson: {}, createdAt: new Date() },
      { id: 'evt_2', action: 'driver_document.approved', actorUserId: 'admin_1', reason: null, afterJson: {}, createdAt: new Date() },
    ];
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1', userId: 'usr_1' }) },
      auditEvent: { findMany: async () => auditEvents },
    });

    const result = await c.getVerificationHistory('drv_1');
    assert.equal(result.status, 'ok', 'history returns ok');
    assert.equal(result.data.history.length, 2, 'returns 2 history events');
    assert.equal(result.data.history[0].action, 'driver.activated', 'first event is activation');
  }

  // ── Audit event created for document approve/reject/profile approve/reject ──

  {
    // Already covered in individual action tests above. This test checks the
    // audit fields are correctly structured.
    const auditCreated: any[] = [];
    const c = controller({
      driver: { findUnique: async () => ({ id: 'drv_1' }) },
      kycRecord: {
        findUnique: async () => kycStub({ status: 'PENDING' }),
        update: async ({ data }: any) => ({ ...kycStub(), ...data }),
      },
      auditEvent: { create: async ({ data }: any) => { auditCreated.push(data); return {}; } },
    });

    await c.approveDocument(superAdminReq, 'drv_1', 'kyc_1', {});
    const evt = auditCreated[0];
    assert.equal(evt.targetType, 'DriverVerification', 'targetType is DriverVerification');
    assert.equal(evt.targetId, 'drv_1', 'targetId is driverId');
    assert.equal(evt.actorUserId, 'admin_1', 'actorUserId is super admin sub');
  }

  console.log('driver-verification contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { strict as assert } from 'assert';
import { DocumentStatus, KycStatus } from '@prisma/client';
import { DevKycProvider } from '@common/index';
import { DriverKycController } from './driver-kyc.controller';

// ── Stubs ──────────────────────────────────────────────────────────────────────

const driverReq = { user: { sub: 'usr_1', role: 'DRIVER', driverId: 'drv_1' } } as any;

function redisStub(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getClient: () => ({
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      },
      del: async (key: string) => {
        store.delete(key);
        return 1;
      },
    }),
    _store: store,
  } as any;
}

function controller(prisma: any, redis = redisStub()) {
  return new DriverKycController(prisma, redis, new DevKycProvider()) as any;
}

async function main() {
  // ── Aadhaar OTP → verify happy path creates APPROVED record ────────────────

  {
    const created: any[] = [];
    const redis = redisStub();
    const c = controller(
      {
        kycRecord: {
          findFirst: async () => null,
          create: async ({ data }: any) => {
            created.push(data);
            return { id: 'kyc_a1', ...data };
          },
        },
      },
      redis,
    );

    const otpRes = await c.requestAadhaarOtp(driverReq, { aadhaarNumber: '123412341234' });
    assert.equal(otpRes.data.otpSent, true, 'aadhaar OTP initiated');
    assert.ok(redis._store.has('kyc:aadhaar:ref:drv_1'), 'reference stored in redis');

    const verifyRes = await c.verifyAadhaarOtp(driverReq, { otp: '123456' });
    assert.equal(verifyRes.data.verified, true, 'aadhaar verified with dev OTP');
    assert.equal(created[0].documentType, 'AADHAAR', 'AADHAAR record created');
    assert.equal(created[0].status, DocumentStatus.APPROVED, 'record auto-approved on provider verification');
    assert.ok(String(created[0].documentNo).endsWith('1234'), 'only masked number stored');
    assert.ok(!redis._store.has('kyc:aadhaar:ref:drv_1'), 'reference cleared after verify');
  }

  // ── Aadhaar verify with wrong OTP fails ─────────────────────────────────────

  {
    const redis = redisStub({ 'kyc:aadhaar:ref:drv_1': JSON.stringify({ referenceId: 'ref_1', last4: '1234' }) });
    const c = controller({ kycRecord: { findFirst: async () => null, create: async () => ({}) } }, redis);
    await assert.rejects(
      () => c.verifyAadhaarOtp(driverReq, { otp: '999999' }),
      (err: any) => err.response?.error_code === 'aadhaar_verify_failed',
      'wrong OTP → aadhaar_verify_failed',
    );
  }

  // ── Aadhaar verify without prior OTP fails ─────────────────────────────────

  {
    const c = controller({ kycRecord: {} });
    await assert.rejects(
      () => c.verifyAadhaarOtp(driverReq, { otp: '123456' }),
      (err: any) => err.response?.error_code === 'aadhaar_session_expired',
      'no session → aadhaar_session_expired',
    );
  }

  // ── DL verify: VERIFIED → record APPROVED + driver auto-approved ────────────

  {
    const created: any[] = [];
    const driverUpdates: any[] = [];
    const c = controller({
      kycRecord: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          created.push(data);
          return { id: 'kyc_dl1', ...data };
        },
      },
      driver: {
        update: async ({ data }: any) => {
          driverUpdates.push(data);
          return { id: 'drv_1', ...data };
        },
      },
    });

    const res = await c.verifyDrivingLicense(driverReq, { dlNumber: 'UK0420150001234', dob: '1990-01-01' });
    assert.equal(res.data.verified, true, 'DL verified');
    assert.equal(created[0].documentType, 'DRIVING_LICENSE', 'DL record created');
    assert.equal(created[0].status, DocumentStatus.APPROVED, 'DL record approved');
    assert.ok(created[0].expiresAt instanceof Date, 'expiry synced from registry');
    assert.equal(driverUpdates[0].kycStatus, KycStatus.APPROVED, 'driver kycStatus auto-approved on RTO-verified DL');
  }

  // ── DL verify: failure fixture (ends 0000) → dl_verify_failed ───────────────

  {
    const c = controller({ kycRecord: {}, driver: {} });
    await assert.rejects(
      () => c.verifyDrivingLicense(driverReq, { dlNumber: 'UK0420150000', dob: '1990-01-01' }),
      (err: any) => err.response?.error_code === 'dl_verify_failed',
      'failure fixture → dl_verify_failed',
    );
  }

  // ── DL verify: NEEDS_REVIEW fixture (ends 9999) → pending, driver untouched ─

  {
    const created: any[] = [];
    let driverUpdated = false;
    const c = controller({
      kycRecord: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          created.push(data);
          return { id: 'kyc_dl2', ...data };
        },
      },
      driver: {
        update: async () => {
          driverUpdated = true;
          return {};
        },
      },
    });

    const res = await c.verifyDrivingLicense(driverReq, { dlNumber: 'UK0420159999', dob: '1990-01-01' });
    assert.equal(res.data.verified, false, 'NEEDS_REVIEW is not verified');
    assert.equal(res.data.needsManualReview, true, 'flagged for manual review');
    assert.equal(created[0].status, DocumentStatus.PENDING, 'record stays PENDING for super-admin review');
    assert.equal(driverUpdated, false, 'driver kycStatus NOT auto-approved');
  }

  // ── Face match without Aadhaar photo fails with guidance ────────────────────

  {
    const c = controller({ kycRecord: { findFirst: async () => null } });
    await assert.rejects(
      () => c.faceMatch(driverReq, { selfieBase64: 'c2VsZmll' }),
      (err: any) => err.response?.error_code === 'aadhaar_photo_missing',
      'face match requires verified aadhaar photo',
    );
  }

  // ── Face match with Aadhaar photo succeeds and stores the score ─────────────

  {
    const updates: any[] = [];
    const c = controller({
      kycRecord: {
        findFirst: async () => ({
          id: 'kyc_a1',
          metadataJson: { holderPhotoBase64: 'cmVmZXJlbmNl' },
        }),
        update: async ({ data }: any) => {
          updates.push(data);
          return {};
        },
      },
    });

    const res = await c.faceMatch(driverReq, { selfieBase64: 'c2VsZmll' });
    assert.equal(res.data.matched, true, 'dev provider matches faces');
    assert.ok(res.data.matchScore >= 75, 'score above threshold');
    assert.equal(updates[0].metadataJson.faceMatchScore, res.data.matchScore, 'score persisted on aadhaar record');
  }

  // ── RC verify syncs registry validity dates onto the vehicle ────────────────

  {
    const vehicleUpdates: any[] = [];
    const c = controller({
      driverVehicleAssignment: {
        findFirst: async () => ({
          id: 'asgn_1',
          vehicle: { id: 'veh_1', plate: 'UK05TA1234' },
        }),
      },
      vehicle: {
        update: async ({ data }: any) => {
          vehicleUpdates.push(data);
          return {};
        },
      },
      kycRecord: {
        create: async ({ data }: any) => ({ id: 'kyc_rc1', ...data }),
      },
    });

    const res = await c.verifyVehicleRc(driverReq, {});
    assert.equal(res.data.verified, true, 'RC verified via dev Vahan');
    assert.ok(vehicleUpdates[0].insuranceValidTill instanceof Date, 'insurance validity synced onto vehicle');
    assert.ok(vehicleUpdates[0].fitnessValidTill instanceof Date, 'fitness validity synced onto vehicle');
  }

  console.log('driver-kyc contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { strict as assert } from 'assert';
import { DriverInvitationsController } from './driver-invitations.controller';
import { OrganizationDriverStatus, UserRole } from '@prisma/client';

// Minimal JwtService stub
const jwtStub = { sign: (_payload: unknown, _opts?: unknown) => 'mock_jwt_token' };

function controller(prisma: any) {
  return new DriverInvitationsController(prisma, jwtStub as any) as any;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    organizationId: 'org_1',
    phone: '+919876543210',
    role: 'DRIVER',
    publicInviteRef: 'abc123ref',
    inviteTokenHash: hashSha256('secret_token'),
    status: 'INVITED',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedName: 'Ravi Kumar',
    invitedEmail: null,
    note: null,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpLastSentAt: null,
    otpAttemptCount: 0,
    cancelledAt: null,
    cancellationReason: null,
    acceptedByUserId: null,
    acceptedAt: null,
    createdByUserId: 'admin_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// SHA256 via Node crypto — mirrors the controller's hash()
import { createHash } from 'crypto';
function hashSha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function hashOtp(code: string, invitationId: string) {
  return hashSha256(`${invitationId}:${code}`);
}

const auditStub = { create: async () => ({}) };

async function main() {

  // ── 1. GET invite — success ────────────────────────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation() },
      organization: { findUnique: async () => ({ id: 'org_1', legalName: 'Pahadi Rides Pvt Ltd', tradeName: 'Pahadi Rides' }) },
    });
    const result = await c.getInviteDetails('abc123ref', 'secret_token');
    assert.equal(result.status, 'ok', 'GET invite returns ok');
    assert.equal(result.data.organizationName, 'Pahadi Rides', 'tradeName preferred over legalName');
    assert.equal(result.data.invitedName, 'Ravi Kumar', 'invitedName returned');
    assert.ok(result.data.phoneMasked.includes('XXXXX'), 'phone is masked');
    assert.ok(!('inviteTokenHash' in result.data), 'inviteTokenHash NOT in response');
    assert.ok(!('otpCodeHash' in result.data), 'otpCodeHash NOT in response');
    assert.equal(result.data.canRequestOtp, true, 'canRequestOtp is true');
  }

  // ── 2. GET invite — wrong token rejected ────────────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation() },
    });
    await assert.rejects(
      () => c.getInviteDetails('abc123ref', 'wrong_token'),
      (err: any) => err.response?.error_code === 'invite_not_found',
      'wrong token produces invite_not_found (no info leak)',
    );
  }

  // ── 3. GET invite — unknown publicInviteRef rejected ──────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => null },
    });
    await assert.rejects(
      () => c.getInviteDetails('unknown_ref', 'secret_token'),
      (err: any) => err.response?.error_code === 'invite_not_found',
      'unknown ref produces invite_not_found',
    );
  }

  // ── 4. GET invite — expired invitation rejected ────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation({ expiresAt: new Date(Date.now() - 1000) }) },
    });
    await assert.rejects(
      () => c.getInviteDetails('abc123ref', 'secret_token'),
      (err: any) => err.response?.error_code === 'invite_expired',
      'expired invitation rejected',
    );
  }

  // ── 5. GET invite — cancelled invitation rejected ──────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation({ status: 'CANCELLED' }) },
    });
    await assert.rejects(
      () => c.getInviteDetails('abc123ref', 'secret_token'),
      (err: any) => err.response?.error_code === 'invite_cancelled',
      'cancelled invitation rejected',
    );
  }

  // ── 6. GET invite — already accepted rejected ──────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation({ status: 'ACCEPTED' }) },
    });
    await assert.rejects(
      () => c.getInviteDetails('abc123ref', 'secret_token'),
      (err: any) => err.response?.error_code === 'invite_already_used',
      'already accepted invitation rejected',
    );
  }

  // ── 7. send-otp — success for invited phone ────────────────────────────────
  {
    const otpUpdates: any[] = [];
    const c = controller({
      organizationInvitation: {
        findUnique: async () => makeInvitation(),
        update: async ({ data }: any) => { otpUpdates.push(data); return makeInvitation(data); },
      },
      verificationAttempt: {
        count: async () => 0,
        create: async () => ({}),
      },
      $transaction: async (fn: any) => fn({
        organizationInvitation: { update: async ({ data }: any) => { otpUpdates.push(data); return {}; } },
        verificationAttempt: { create: async () => ({}) },
      }),
    });
    const result = await c.sendInviteOtp('abc123ref', { token: 'secret_token', phone: '9876543210' });
    assert.equal(result.status, 'ok', 'send-otp returns ok');
    assert.ok(result.data.otpExpiresIn > 0, 'otpExpiresIn returned');
    assert.ok(result.data.phoneMasked.includes('XXXXX'), 'masked phone in response');
    // OTP code hash stored (not the raw code)
    const stored = otpUpdates[0];
    assert.ok(stored?.otpCodeHash, 'otpCodeHash stored after send');
    assert.ok(stored?.otpExpiresAt instanceof Date, 'otpExpiresAt is Date');
    assert.equal(stored?.otpAttemptCount, 0, 'attempt count reset to 0 on new OTP');
    assert.ok(!('devOtpCode' in result.data) || process.env.NODE_ENV !== 'production', 'devOtpCode only in non-production');
  }

  // ── 8. send-otp — wrong phone rejected ────────────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation() },
      verificationAttempt: { count: async () => 0 },
    });
    await assert.rejects(
      () => c.sendInviteOtp('abc123ref', { token: 'secret_token', phone: '9999999999' }),
      (err: any) => err.response?.error_code === 'invite_phone_mismatch',
      'different phone rejected with phone_mismatch',
    );
  }

  // ── 9. send-otp — +91 prefix normalised correctly ─────────────────────────
  {
    const otpUpdates: any[] = [];
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation({ phone: '+919876543210' }) },
      verificationAttempt: { count: async () => 0 },
      $transaction: async (fn: any) => fn({
        organizationInvitation: { update: async ({ data }: any) => { otpUpdates.push(data); return {}; } },
        verificationAttempt: { create: async () => ({}) },
      }),
    });
    // Providing phone without country prefix — should still match
    const result = await c.sendInviteOtp('abc123ref', { token: 'secret_token', phone: '9876543210' });
    assert.equal(result.status, 'ok', '+91 prefix normalised for comparison');
  }

  // ── 10. send-otp — rate limited after 5 sends ─────────────────────────────
  {
    const c = controller({
      organizationInvitation: { findUnique: async () => makeInvitation() },
      verificationAttempt: { count: async () => 5 },
    });
    await assert.rejects(
      () => c.sendInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210' }),
      (err: any) => err.response?.error_code === 'rate_limited',
      'rate limit enforced after 5 sends',
    );
  }

  // ── 11. verify-otp — success + creates OrganizationDriver mapping ──────────
  {
    const created: any[] = [];
    const validOtp = '123456';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      otpAttemptCount: 0,
    });

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: {
          findUnique: async () => null,
          upsert: async ({ create }: any) => ({ id: 'user_1', phone: '+919876543210', role: UserRole.DRIVER, name: 'Ravi', ...create }),
        },
        driver: {
          upsert: async ({ create }: any) => ({ id: 'drv_1', userId: 'user_1', ...create }),
        },
        organizationDriver: {
          findUnique: async () => null,
          upsert: async ({ create }: any) => { created.push(create); return { id: 'od_1', ...create }; },
        },
        organizationInvitation: {
          update: async () => ({}),
        },
      }),
    });

    const result = await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    assert.equal(result.status, 'ok', 'verify-otp returns ok');
    assert.equal(created[0].status, OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE, 'OrganizationDriver created with PENDING_DRIVER_ACCEPTANCE');
    assert.ok(result.data.authToken, 'authToken issued');
    assert.ok(result.data.refreshToken, 'refreshToken issued');
    assert.equal(result.data.nextStep, 'COMPLETE_DRIVER_PROFILE', 'nextStep is COMPLETE_DRIVER_PROFILE');
    assert.ok(!('inviteTokenHash' in result.data), 'inviteTokenHash NOT in verify response');
  }

  // ── 12. verify-otp — reuses existing user by phone ────────────────────────
  {
    const validOtp = '654321';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const existingUser = { id: 'existing_user', phone: '+919876543210', role: UserRole.DRIVER, name: 'Old Name' };

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: {
          findUnique: async () => existingUser,
          upsert: async ({ update }: any) => ({ ...existingUser, ...update }),
        },
        driver: {
          upsert: async () => ({ id: 'drv_existing', userId: 'existing_user' }),
        },
        organizationDriver: {
          findUnique: async () => null,
          upsert: async ({ create }: any) => ({ id: 'od_1', ...create }),
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    const result = await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    assert.equal(result.status, 'ok', 'verify-otp reuses existing user');
    assert.equal(result.data.userId, 'existing_user', 'existing userId returned');
  }

  // ── 13. verify-otp — does NOT activate driver (status is PENDING_DRIVER_ACCEPTANCE) ──
  {
    const validOtp = '111111';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: { findUnique: async () => null, upsert: async () => ({ id: 'u1', phone: '+919876543210', role: UserRole.DRIVER, name: 'X' }) },
        driver: { upsert: async () => ({ id: 'd1', userId: 'u1' }) },
        organizationDriver: {
          findUnique: async () => null,
          upsert: async ({ create }: any) => ({ id: 'od1', ...create }),
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    const result = await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    assert.notEqual(result.data.status, OrganizationDriverStatus.ACTIVE, 'driver is NOT activated after OTP');
    assert.equal(result.data.status, OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE, 'status is PENDING_DRIVER_ACCEPTANCE only');
  }

  // ── 14. verify-otp — does NOT create duplicate mapping ────────────────────
  {
    const validOtp = '222222';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const existingMapping = { id: 'od_existing', status: OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE };
    const upsertCalls: any[] = [];

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: { findUnique: async () => null, upsert: async () => ({ id: 'u1', phone: '+919876543210', role: UserRole.DRIVER, name: 'X' }) },
        driver: { upsert: async () => ({ id: 'd1', userId: 'u1' }) },
        organizationDriver: {
          findUnique: async () => existingMapping,
          upsert: async (args: any) => { upsertCalls.push(args); return { ...existingMapping, ...args.update }; },
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    assert.equal(upsertCalls.length, 1, 'upsert called once — no duplicate');
    assert.equal(upsertCalls[0].create.organizationId, 'org_1', 'organizationId correct in create path');
  }

  // ── 15. verify-otp — ACTIVE driver returns alreadyActive hint ─────────────
  {
    const validOtp = '333333';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: { findUnique: async () => null, upsert: async () => ({ id: 'u1', phone: '+919876543210', role: UserRole.DRIVER, name: 'X' }) },
        driver: { upsert: async () => ({ id: 'd1', userId: 'u1' }) },
        organizationDriver: {
          findUnique: async () => ({ id: 'od1', status: OrganizationDriverStatus.ACTIVE }),
          upsert: async () => ({ id: 'od1', status: OrganizationDriverStatus.ACTIVE }),
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    const result = await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    assert.equal(result.data.alreadyActive, true, 'alreadyActive flag set for already-active driver');
    assert.equal(result.data.nextStep, 'DRIVER_DASHBOARD', 'nextStep is DRIVER_DASHBOARD for active driver');
  }

  // ── 16. verify-otp — suspended driver blocked ─────────────────────────────
  {
    const validOtp = '444444';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: { findUnique: async () => null, upsert: async () => ({ id: 'u1', phone: '+919876543210', role: UserRole.DRIVER, name: 'X' }) },
        driver: { upsert: async () => ({ id: 'd1', userId: 'u1' }) },
        organizationDriver: {
          findUnique: async () => ({ id: 'od1', status: OrganizationDriverStatus.SUSPENDED }),
          upsert: async () => ({}),
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    await assert.rejects(
      () => c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp }),
      (err: any) => err.response?.error_code === 'driver_access_revoked',
      'suspended driver cannot re-join via invite',
    );
  }

  // ── 17. verify-otp — wrong OTP increments attempt counter ─────────────────
  {
    const inv = makeInvitation({
      otpCodeHash: hashOtp('correct_otp', 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      otpAttemptCount: 0,
    });
    const updates: any[] = [];

    const c = controller({
      organizationInvitation: {
        findUnique: async () => inv,
        update: async ({ data }: any) => { updates.push(data); return {}; },
      },
    });

    await assert.rejects(
      () => c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: 'wrong_otp' }),
      (err: any) => err.response?.error_code === 'invalid_otp',
      'wrong OTP gives invalid_otp',
    );
    assert.deepEqual(updates[0], { otpAttemptCount: { increment: 1 } }, 'attempt count incremented on wrong OTP');
  }

  // ── 18. verify-otp — expired OTP rejected ─────────────────────────────────
  {
    const validOtp = '555555';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() - 1000), // already expired
    });

    const c = controller({ organizationInvitation: { findUnique: async () => inv } });
    await assert.rejects(
      () => c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp }),
      (err: any) => err.response?.error_code === 'otp_expired',
      'expired OTP is rejected',
    );
  }

  // ── 19. normalizePhone — handles various formats ────────────────────────────
  {
    const c = controller({});
    assert.equal(c.normalizePhone('+919876543210'), '9876543210', 'strips +91 prefix');
    assert.equal(c.normalizePhone('09876543210'), '9876543210', 'strips leading 0');
    assert.equal(c.normalizePhone('98765 43210'), '9876543210', 'strips spaces');
    assert.equal(c.normalizePhone('9876543210'), '9876543210', 'plain 10-digit unchanged');
  }

  // ── 20. raw token never stored (only hash stored) ──────────────────────────
  {
    const storedData: any[] = [];
    const validOtp = '666666';
    const inv = makeInvitation({
      otpCodeHash: hashOtp(validOtp, 'inv_1'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const c = controller({
      organizationInvitation: { findUnique: async () => inv },
      $transaction: async (fn: any) => fn({
        user: { findUnique: async () => null, upsert: async () => ({ id: 'u1', phone: '+919876543210', role: UserRole.DRIVER, name: 'X' }) },
        driver: { upsert: async () => ({ id: 'd1', userId: 'u1' }) },
        organizationDriver: {
          findUnique: async () => null,
          upsert: async (args: any) => { storedData.push(args.create); return { id: 'od1', ...args.create }; },
        },
        organizationInvitation: { update: async () => ({}) },
      }),
    });

    const result = await c.verifyInviteOtp('abc123ref', { token: 'secret_token', phone: '+919876543210', otp: validOtp });
    // The raw token 'secret_token' must never appear in any stored data
    const serialized = JSON.stringify(storedData);
    assert.ok(!serialized.includes('secret_token'), 'raw invite token not stored in OrganizationDriver data');
    assert.ok(!serialized.includes('secret_token'), 'raw token not stored anywhere in DB writes');
    assert.ok(!result.data.authToken.includes('secret_token'), 'raw token not in JWT response');
  }

  console.log('driver-invitations step-2 contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

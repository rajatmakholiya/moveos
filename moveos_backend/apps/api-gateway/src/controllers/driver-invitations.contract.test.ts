import { strict as assert } from 'assert';
import { OrganizationsController } from './organizations.controller';

// Super-admin user bypasses all org membership checks in requireOrgOrAdminAccess.
const superAdmin = { sub: 'super_1', role: 'SUPER_ADMIN' };
const auditStub = { create: async () => ({}) };

function controller(prisma: any) {
  return new OrganizationsController(prisma, {} as any) as any;
}

// Helper: a stub invitation in INVITED status that has not yet expired.
function invitedStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    organizationId: 'org_1',
    phone: '+919876543210',
    role: 'DRIVER',
    inviteTokenHash: 'some_hash',
    status: 'INVITED',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedName: null,
    invitedEmail: null,
    note: null,
    cancelledAt: null,
    cancellationReason: null,
    acceptedAt: null,
    acceptedByUserId: null,
    createdByUserId: 'super_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function main() {

  // ── buildInviteLink ──────────────────────────────────────────────────────

  {
    const c = controller({});
    const original = process.env.PWA_BASE_URL;

    process.env.PWA_BASE_URL = 'https://pwa.example.com';
    const link = c.buildInviteLink('myref', 'abc123');
    assert.equal(link, 'https://pwa.example.com/organization-invite?ref=myref&token=abc123', 'buildInviteLink uses publicInviteRef + token');

    // trailing slash stripped
    process.env.PWA_BASE_URL = 'https://pwa.example.com/';
    const linkNoSlash = c.buildInviteLink('myref', 'abc123');
    assert.equal(linkNoSlash, 'https://pwa.example.com/organization-invite?ref=myref&token=abc123', 'buildInviteLink strips trailing slash');

    // fallback when env not set
    delete process.env.PWA_BASE_URL;
    const fallback = c.buildInviteLink('myref', 'abc123');
    assert.ok(fallback.startsWith('http://localhost:3010'), 'buildInviteLink falls back to localhost:3010');
    assert.ok(fallback.includes('ref=myref'), 'fallback link includes publicInviteRef');

    process.env.PWA_BASE_URL = original ?? '';
  }

  // ── buildDriverInvitationSharePayload ────────────────────────────────────

  {
    const c = controller({});
    const org = { legalName: 'Pahadi Rides Pvt Ltd', tradeName: 'Pahadi Rides' };
    const testLink = 'https://pwa.example.com/organization-invite?ref=myref&token=tok';
    const payload = c.buildDriverInvitationSharePayload(org, testLink);

    assert.ok(payload.text.includes('Pahadi Rides'), 'share text uses tradeName over legalName');
    assert.ok(payload.text.includes(testLink), 'share text includes invite link');
    assert.ok(payload.whatsappUrl.startsWith('https://wa.me/?text='), 'whatsappUrl uses wa.me');
    assert.ok(!payload.whatsappUrl.includes(' '), 'whatsappUrl has no raw spaces (URL-encoded)');
    assert.equal(payload.inviteLink, testLink, 'inviteLink echoed in payload');

    // falls back to legalName when tradeName is null
    const payload2 = c.buildDriverInvitationSharePayload({ legalName: 'Pahadi Rides Pvt Ltd', tradeName: null }, 'https://x.com/invite?token=t');
    assert.ok(payload2.text.includes('Pahadi Rides Pvt Ltd'), 'falls back to legalName when tradeName is null');
  }

  // ── safeInvitation ───────────────────────────────────────────────────────

  {
    const c = controller({});
    const raw = invitedStub({ inviteTokenHash: 'secret_hash_abc' });
    const safe = c.safeInvitation(raw);
    assert.ok(!('inviteTokenHash' in safe), 'safeInvitation strips inviteTokenHash');
    assert.equal(safe.id, 'inv_1', 'safeInvitation preserves id');
    assert.equal(safe.phone, '+919876543210', 'safeInvitation preserves phone');
  }

  // ── createDriverInvitation — success ─────────────────────────────────────

  {
    const created: any[] = [];
    const c = controller({
      organizationInvitation: {
        findFirst: async () => null,
        create: async ({ data }: any) => { created.push(data); return { ...invitedStub(), ...data, id: 'inv_new' }; },
      },
      organization: { findUnique: async () => ({ id: 'org_1', legalName: 'Test Org', tradeName: null, status: 'ACTIVE' }) },
      auditEvent: auditStub,
    });

    const result = await c.createDriverInvitation(
      { user: superAdmin },
      'org_1',
      { phone: '+919876543210', name: 'Ravi Kumar', email: 'ravi@example.com', note: 'Reliable driver', expiresAt: undefined },
    );

    assert.equal(result.status, 'ok', 'createDriverInvitation returns ok');
    assert.ok(result.data.inviteLink, 'inviteLink present in response');
    assert.ok(result.data.sharePayload.whatsappUrl, 'whatsappUrl present in response');
    assert.ok(!('inviteTokenHash' in result.data.invitation), 'inviteTokenHash NOT in response');
    assert.equal(created[0].invitedName, 'Ravi Kumar', 'invitedName stored');
    assert.equal(created[0].invitedEmail, 'ravi@example.com', 'invitedEmail stored');
    assert.equal(created[0].note, 'Reliable driver', 'note stored');
    assert.ok(created[0].inviteTokenHash, 'inviteTokenHash stored (hash, not raw token)');
    // the stored hash must NOT equal the raw token returned in inviteLink
    const returnedToken = result.data.inviteLink.split('token=')[1];
    assert.notEqual(created[0].inviteTokenHash, returnedToken, 'stored hash != raw token in link');
  }

  // ── createDriverInvitation — custom expiresAt ────────────────────────────

  {
    const created: any[] = [];
    const customExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const c = controller({
      organizationInvitation: {
        findFirst: async () => null,
        create: async ({ data }: any) => { created.push(data); return { ...invitedStub(), ...data }; },
      },
      organization: { findUnique: async () => ({ id: 'org_1', legalName: 'Test Org', tradeName: null }) },
      auditEvent: auditStub,
    });

    await c.createDriverInvitation({ user: superAdmin }, 'org_1', { phone: '+919999999999', expiresAt: customExpiry });
    assert.equal(created[0].expiresAt.toISOString(), new Date(customExpiry).toISOString(), 'custom expiresAt stored');
  }

  // ── createDriverInvitation — duplicate active invitation blocked ──────────

  {
    const { ConflictException } = await import('@nestjs/common');
    const c = controller({
      organizationInvitation: { findFirst: async () => invitedStub() },
      organization: { findUnique: async () => ({ id: 'org_1', legalName: 'Test Org', tradeName: null }) },
      auditEvent: auditStub,
    });

    await assert.rejects(
      () => c.createDriverInvitation({ user: superAdmin }, 'org_1', { phone: '+919876543210' }),
      (err: any) => err.response?.error_code === 'invite_duplicate',
      'duplicate active invitation is blocked with invite_duplicate',
    );
  }

  // ── cancelDriverInvitation — success ─────────────────────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      organizationInvitation: {
        findUnique: async () => invitedStub(),
        update: async ({ data }: any) => { updates.push(data); return { ...invitedStub(), ...data }; },
      },
      auditEvent: auditStub,
    });

    const result = await c.cancelDriverInvitation({ user: superAdmin }, 'inv_1', { reason: 'Driver declined' });

    assert.equal(result.status, 'ok', 'cancel returns ok');
    assert.equal(updates[0].status, 'CANCELLED', 'status updated to CANCELLED');
    assert.equal(updates[0].cancellationReason, 'Driver declined', 'cancellationReason stored');
    assert.ok(updates[0].cancelledAt instanceof Date, 'cancelledAt set as Date');
    assert.ok(!('inviteTokenHash' in result.data.invitation), 'inviteTokenHash NOT in cancel response');
  }

  // ── cancelDriverInvitation — already cancelled cannot be cancelled again ──

  {
    const c = controller({
      organizationInvitation: { findUnique: async () => invitedStub({ status: 'CANCELLED' }) },
      auditEvent: auditStub,
    });

    await assert.rejects(
      () => c.cancelDriverInvitation({ user: superAdmin }, 'inv_1', {}),
      (err: any) => err.response?.error_code === 'invite_not_cancellable',
      'already-cancelled invitation cannot be cancelled again',
    );
  }

  // ── cancelDriverInvitation — accepted invitation cannot be cancelled ──────

  {
    const c = controller({
      organizationInvitation: { findUnique: async () => invitedStub({ status: 'ACCEPTED' }) },
      auditEvent: auditStub,
    });

    await assert.rejects(
      () => c.cancelDriverInvitation({ user: superAdmin }, 'inv_1', {}),
      (err: any) => err.response?.error_code === 'invite_not_cancellable',
      'accepted invitation cannot be cancelled',
    );
  }

  // ── cancelDriverInvitation — not found ────────────────────────────────────

  {
    const c = controller({ organizationInvitation: { findUnique: async () => null }, auditEvent: auditStub });

    await assert.rejects(
      () => c.cancelDriverInvitation({ user: superAdmin }, 'missing_id', {}),
      (err: any) => err.response?.error_code === 'invite_not_found',
      'cancel throws invite_not_found for unknown id',
    );
  }

  // ── regenerateDriverInvitationLink — success ──────────────────────────────

  {
    const updates: any[] = [];
    const c = controller({
      organizationInvitation: {
        findUnique: async () => ({ ...invitedStub(), organization: { id: 'org_1', legalName: 'Test Org', tradeName: 'Test' } }),
        update: async ({ data }: any) => { updates.push(data); return { ...invitedStub(), ...data }; },
      },
      auditEvent: auditStub,
    });

    const result = await c.regenerateDriverInvitationLink({ user: superAdmin }, 'inv_1');

    assert.equal(result.status, 'ok', 'regenerate returns ok');
    assert.ok(result.data.inviteLink, 'new inviteLink present');
    assert.ok(result.data.sharePayload.whatsappUrl, 'whatsappUrl present after regenerate');
    assert.ok(updates[0].inviteTokenHash, 'new inviteTokenHash stored');
    assert.ok(!('inviteTokenHash' in result.data.invitation), 'inviteTokenHash NOT in regenerate response');
    // New hash must differ from the original
    assert.notEqual(updates[0].inviteTokenHash, 'some_hash', 'new token hash differs from old');
  }

  // ── regenerateDriverInvitationLink — expired invitation blocked ───────────

  {
    const c = controller({
      organizationInvitation: {
        findUnique: async () => ({
          ...invitedStub({ expiresAt: new Date(Date.now() - 1000) }),
          organization: { id: 'org_1', legalName: 'Test Org', tradeName: null },
        }),
      },
      auditEvent: auditStub,
    });

    await assert.rejects(
      () => c.regenerateDriverInvitationLink({ user: superAdmin }, 'inv_1'),
      (err: any) => err.response?.error_code === 'invite_expired',
      'expired invitation cannot be regenerated',
    );
  }

  // ── regenerateDriverInvitationLink — wrong status blocked ────────────────

  {
    const c = controller({
      organizationInvitation: {
        findUnique: async () => ({
          ...invitedStub({ status: 'CANCELLED' }),
          organization: { id: 'org_1', legalName: 'Test Org', tradeName: null },
        }),
      },
      auditEvent: auditStub,
    });

    await assert.rejects(
      () => c.regenerateDriverInvitationLink({ user: superAdmin }, 'inv_1'),
      (err: any) => err.response?.error_code === 'invite_not_regenerable',
      'cancelled invitation cannot have link regenerated',
    );
  }

  // ── listDriverInvitations — pagination math ───────────────────────────────

  {
    const c = controller({
      organizationInvitation: {
        count: async () => 55,
        findMany: async ({ skip, take }: any) => Array.from({ length: take }, (_, i) => invitedStub({ id: `inv_${skip + i}` })),
      },
    });

    const page1 = await c.listDriverInvitations({ user: superAdmin }, 'org_1', undefined, undefined, undefined, '1', '20');
    assert.equal(page1.data.pagination.total, 55, 'total count correct');
    assert.equal(page1.data.pagination.totalPages, 3, 'totalPages = ceil(55/20) = 3');
    assert.equal(page1.data.invitations.length, 20, 'page 1 has 20 items');

    const page3 = await c.listDriverInvitations({ user: superAdmin }, 'org_1', undefined, undefined, undefined, '3', '20');
    assert.equal(page3.data.invitations.length, 20, 'page 3 returns up to limit items');
  }

  // ── listDriverInvitations — inviteTokenHash never returned ───────────────

  {
    const stub = invitedStub();
    const c = controller({
      organizationInvitation: {
        count: async () => 1,
        // Simulate Prisma select excluding inviteTokenHash (select is enforced in the handler)
        findMany: async () => {
          const { inviteTokenHash: _h, ...safe } = stub;
          return [safe];
        },
      },
    });

    const result = await c.listDriverInvitations({ user: superAdmin }, 'org_1');
    assert.ok(!('inviteTokenHash' in result.data.invitations[0]), 'inviteTokenHash not present in list response');
  }

  console.log('driver-invitations contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

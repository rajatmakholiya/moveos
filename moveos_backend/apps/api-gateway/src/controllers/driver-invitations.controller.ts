import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, SMS_PROVIDER, SmsProvider } from '@common/index';
import {
  ComplianceStatus,
  DriverStatus,
  KycStatus,
  OrganizationDriverStatus,
  UserRole,
  UserStatus,
  VerificationAttemptType,
} from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { SendInviteOtpDto, VerifyInviteOtpDto } from '../dto/organizations.dto';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SEND_LIMIT = { count: 5, windowMs: 60 * 60 * 1000 };
const OTP_MAX_ATTEMPTS = 5;

@Controller()
export class DriverInvitationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ─── GET /driver/invitations/:publicInviteRef?token=<rawToken> ─────────────
  // Public: no auth guard. Token in query param validates access.

  @Get('driver/invitations/:publicInviteRef')
  async getInviteDetails(
    @Param('publicInviteRef') publicInviteRef: string,
    @Query('token') rawToken: string,
  ) {
    if (!rawToken) throw new BadRequestException({ message: 'token query param is required', error_code: 'token_missing' });
    const invitation = await this.requireValidInvite(publicInviteRef, rawToken);
    const org = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { id: true, legalName: true, tradeName: true },
    });

    return {
      status: 'ok',
      data: {
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        organizationName: org?.tradeName ?? org?.legalName ?? '',
        invitedName: invitation.invitedName ?? null,
        phoneMasked: this.maskPhone(invitation.phone),
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        canRequestOtp: true,
      },
    };
  }

  // ─── POST /driver/invitations/:publicInviteRef/send-otp ────────────────────

  @Post('driver/invitations/:publicInviteRef/send-otp')
  async sendInviteOtp(
    @Param('publicInviteRef') publicInviteRef: string,
    @Body() body: SendInviteOtpDto,
  ) {
    const invitation = await this.requireValidInvite(publicInviteRef, body.token);
    this.requirePhoneMatch(invitation.phone, body.phone);

    await this.assertSendRateLimit(invitation.id, body.phone);

    const code = randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    const otpCodeHash = this.hashOtp(code, invitation.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { otpCodeHash, otpExpiresAt, otpLastSentAt: new Date(), otpAttemptCount: 0 },
      });
      await tx.verificationAttempt.create({
        data: { phone: body.phone, type: VerificationAttemptType.SEND, sessionId: null },
      });
    });

    const sent = await this.sms.sendOtp(invitation.phone, code, {
      purpose: 'invite',
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
    });
    if (!sent.delivered && this.sms.deliversRealSms) {
      throw new BadRequestException({
        message: 'Could not send the OTP right now. Please try again shortly.',
        error_code: 'otp_delivery_failed',
      });
    }

    return {
      status: 'ok',
      data: {
        otpExpiresIn: Math.floor(OTP_TTL_MS / 1000),
        phoneMasked: this.maskPhone(invitation.phone),
        // surface dev code only when SMS is not actually being delivered
        devOtpCode: this.sms.deliversRealSms ? undefined : code,
      },
    };
  }

  // ─── POST /driver/invitations/:publicInviteRef/verify-otp ──────────────────

  @Post('driver/invitations/:publicInviteRef/verify-otp')
  async verifyInviteOtp(
    @Param('publicInviteRef') publicInviteRef: string,
    @Body() body: VerifyInviteOtpDto,
  ) {
    const invitation = await this.requireValidInvite(publicInviteRef, body.token);
    this.requirePhoneMatch(invitation.phone, body.phone);
    await this.requireOtpValid(invitation, body.otp);

    const { user, driver, orgDriver, alreadyActive } = await this.prisma.$transaction(async (tx) => {
      // Upsert user — reuse if phone already exists as DRIVER role
      const existingUser = await tx.user.findUnique({ where: { phone: invitation.phone } });
      if (existingUser && existingUser.role !== UserRole.DRIVER) {
        throw new ConflictException({ message: 'This phone is registered under a different role', error_code: 'role_conflict' });
      }

      const user = await tx.user.upsert({
        where: { phone: invitation.phone },
        update: {
          name: existingUser?.name ?? invitation.invitedName ?? undefined,
          email: existingUser?.email ?? invitation.invitedEmail ?? undefined,
          status: UserStatus.ACTIVE,
        },
        create: {
          phone: invitation.phone,
          name: invitation.invitedName ?? null,
          email: invitation.invitedEmail ?? null,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
        },
      });

      const driver = await tx.driver.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          name: invitation.invitedName ?? user.name ?? 'Driver',
          status: DriverStatus.OFFLINE,
          kycStatus: KycStatus.PENDING,
          complianceStatus: ComplianceStatus.CLEAR,
        },
      });

      // Check for existing mapping
      const existingLink = await tx.organizationDriver.findUnique({
        where: { organizationId_driverId: { organizationId: invitation.organizationId, driverId: driver.id } },
      });

      if (existingLink?.status === OrganizationDriverStatus.SUSPENDED || existingLink?.status === OrganizationDriverStatus.REMOVED) {
        throw new ConflictException({ message: 'Your access to this organization has been suspended or removed. Contact the organization admin.', error_code: 'driver_access_revoked' });
      }

      const alreadyActive = existingLink?.status === OrganizationDriverStatus.ACTIVE;

      const orgDriver = await tx.organizationDriver.upsert({
        where: { organizationId_driverId: { organizationId: invitation.organizationId, driverId: driver.id } },
        create: {
          organizationId: invitation.organizationId,
          driverId: driver.id,
          status: OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE,
          acceptedAt: new Date(),
          startedAt: new Date(),
          invitedById: invitation.createdByUserId ?? undefined,
          metadataJson: { source: 'driver_invite', invitationId: invitation.id } as any,
        },
        update: alreadyActive
          ? {}
          : { status: OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE, acceptedAt: new Date() },
      });

      // Mark invitation consumed; clear OTP state
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
          otpCodeHash: null,
          otpExpiresAt: null,
        },
      });

      return { user, driver, orgDriver, alreadyActive };
    });

    // Issue JWT so the driver can make authenticated calls in Step 3 (profile completion)
    const jwtPayload = { sub: user.id, phone: user.phone, role: user.role, driverId: driver.id };
    const authToken = this.jwt.sign(jwtPayload);
    const refreshToken = this.jwt.sign(jwtPayload, { expiresIn: '7d' });

    return {
      status: 'ok',
      data: {
        driverId: driver.id,
        userId: user.id,
        organizationId: invitation.organizationId,
        organizationDriverId: orgDriver.id,
        status: orgDriver.status,
        alreadyActive,
        authToken,
        refreshToken,
        nextStep: alreadyActive ? 'DRIVER_DASHBOARD' : 'COMPLETE_DRIVER_PROFILE',
      },
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async requireValidInvite(publicInviteRef: string, rawToken: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { publicInviteRef },
    });
    if (!invitation) {
      throw new NotFoundException({ message: 'Invitation not found', error_code: 'invite_not_found' });
    }
    if (!this.constantTimeEqual(this.hash(rawToken), invitation.inviteTokenHash)) {
      throw new NotFoundException({ message: 'Invitation not found', error_code: 'invite_not_found' });
    }
    if (invitation.status === 'CANCELLED') {
      throw new BadRequestException({ message: 'This invitation has been cancelled', error_code: 'invite_cancelled' });
    }
    if (invitation.status === 'ACCEPTED') {
      throw new BadRequestException({ message: 'This invitation has already been used', error_code: 'invite_already_used' });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ message: 'This invitation has expired', error_code: 'invite_expired' });
    }
    return invitation;
  }

  private requirePhoneMatch(storedPhone: string, providedPhone: string) {
    if (this.normalizePhone(storedPhone) !== this.normalizePhone(providedPhone)) {
      throw new BadRequestException({
        message: 'This invite is linked to a different mobile number. Please contact your organization admin.',
        error_code: 'invite_phone_mismatch',
      });
    }
  }

  private async requireOtpValid(invitation: { id: string; otpCodeHash: string | null; otpExpiresAt: Date | null; otpAttemptCount: number }, otp: string) {
    if (!invitation.otpCodeHash || !invitation.otpExpiresAt) {
      throw new BadRequestException({ message: 'OTP has not been requested yet', error_code: 'otp_not_requested' });
    }
    if (invitation.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ message: 'OTP has expired. Please request a new one.', error_code: 'otp_expired' });
    }
    if (invitation.otpAttemptCount >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({ message: 'Too many failed attempts. Please request a new OTP.', error_code: 'rate_limited' });
    }

    const isValid = this.constantTimeEqual(this.hashOtp(otp, invitation.id), invitation.otpCodeHash);
    if (!isValid) {
      // Increment attempt counter before rejecting
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { otpAttemptCount: { increment: 1 } },
      });
      throw new BadRequestException({ message: 'Invalid OTP', error_code: 'invalid_otp' });
    }
  }

  private async assertSendRateLimit(invitationId: string, phone: string) {
    const since = new Date(Date.now() - OTP_SEND_LIMIT.windowMs);
    const count = await this.prisma.verificationAttempt.count({
      where: { phone, type: VerificationAttemptType.SEND, createdAt: { gte: since } },
    });
    if (count >= OTP_SEND_LIMIT.count) {
      throw new BadRequestException({ message: 'Too many OTP requests. Please wait before trying again.', error_code: 'rate_limited', retry_after: Math.ceil(OTP_SEND_LIMIT.windowMs / 1000) });
    }
    // Suppress unused param warning — invitationId reserved for per-invite rate limiting
    void invitationId;
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  private maskPhone(value: string): string {
    const digits = this.normalizePhone(value);
    return `+91 XXXXX X${digits.slice(-4)}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashOtp(code: string, invitationId: string): string {
    return this.hash(`${invitationId}:${code}`);
  }

  // Constant-time string comparison to prevent timing attacks on token hashes
  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) {
      diff |= bufA[i] ^ bufB[i];
    }
    return diff === 0;
  }
}

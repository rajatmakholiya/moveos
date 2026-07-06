import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, SMS_PROVIDER, SmsProvider } from '@common/index';
import {
  Driver,
  OnboardingConsent,
  OnboardingSession,
  OnboardingSessionStatus,
  Passenger,
  User,
  UserRole,
  UserStatus,
  VerificationAttemptType,
} from '@prisma/client';
import { randomBytes, createHash, randomInt } from 'crypto';
import { ConsentsDto, CreateSessionDto, ProfileDto } from './dto/onboarding.dto';

type SessionWithUser = OnboardingSession & { user: User | null };

@Injectable()
export class OnboardingService {
  private readonly onboardingTtlMs = 15 * 60 * 1000;
  private readonly otpTtlMs = 10 * 60 * 1000;
  private readonly otpSendLimit = { count: 5, windowMs: 60 * 60 * 1000 };
  private readonly otpVerifyLimit = { count: 3, windowMs: 10 * 60 * 1000 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async createSession(dto: CreateSessionDto) {
    const onboardingToken = randomBytes(24).toString('hex');
    const onboardingTokenHash = this.hash(onboardingToken);
    const expiresAt = new Date(Date.now() + this.onboardingTtlMs);
    const featureFlags = this.assignFlags(dto.deviceFingerprint);
    const session = await this.prisma.onboardingSession.create({
      data: {
        onboardingTokenHash,
        deviceFingerprint: dto.deviceFingerprint,
        referralCode: dto.referralCode,
        userRole: dto.role ?? UserRole.DRIVER,
        status: OnboardingSessionStatus.ACTIVE,
        locale: dto.locale,
        timezone: dto.timezone,
        appVersion: dto.appVersion,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        featureFlagsJson: featureFlags,
        expiresAt,
      },
    });

    return {
      status: 'ok',
      data: {
        sessionId: session.id,
        onboardingToken,
        expiresIn: Math.floor(this.onboardingTtlMs / 1000),
        flags: featureFlags,
        role: session.userRole,
      },
    };
  }

  async validateSessionToken(token: string): Promise<SessionWithUser> {
    const onboardingTokenHash = this.hash(token);
    const session = await this.prisma.onboardingSession.findUnique({
      where: { onboardingTokenHash },
      include: { user: true },
    });
    if (!session) {
      throw new UnauthorizedException('Invalid onboarding token');
    }
    if (session.status === OnboardingSessionStatus.COMPLETED) {
      throw new UnauthorizedException('Onboarding session already completed');
    }
    if (session.status === OnboardingSessionStatus.EXPIRED || session.expiresAt.getTime() < Date.now()) {
      if (session.status === OnboardingSessionStatus.ACTIVE) {
        await this.prisma.onboardingSession.update({
          where: { id: session.id },
          data: { status: OnboardingSessionStatus.EXPIRED },
        });
      }
      throw new UnauthorizedException('Onboarding session expired');
    }
    return session;
  }

  async handleProfile(session: SessionWithUser, dto: ProfileDto) {
    await this.ensureActive(session.id);
    if (dto.resend || !dto.otp) {
      const { code, expiresAt } = await this.issueOtp(session, dto);
      return {
        status: 'pending_otp',
        data: {
          otpExpiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          nextHint: 'verify_phone',
          // surface dev code only when SMS is not actually being delivered
          devOtpCode: this.sms.deliversRealSms ? undefined : code,
        },
      };
    }

    const verifiedSession = await this.verifyOtp(session, dto.phone, dto.otp);
    const user = await this.ensureUserForSession(verifiedSession, dto);
    const completedAuth = await this.buildCompletedAuthResponse(verifiedSession.id, user);
    if (completedAuth) {
      return completedAuth;
    }

    const hasName = Boolean(user.name);
    return {
      status: 'ok',
      data: {
        userId: user.id,
        name: user.name,
        phoneVerified: true,
        emailVerified: Boolean(user.email),
        hasName,
        requiresName: !hasName,
        nextHint: !hasName
          ? 'collect_profile'
          : session.userRole === UserRole.PASSENGER
            ? 'ready_to_complete'
            : 'collect_consents',
        role: user.role,
      },
    };
  }

  async recordConsents(session: SessionWithUser, dto: ConsentsDto) {
    const timestamp = dto.timestampOverride ? new Date(dto.timestampOverride) : new Date();
    await this.ensureActive(session.id);

    const entries = [
      {
        scope: 'location',
        value: dto.locationPermission,
        sessionId: session.id,
        userId: session.userId,
        locale: dto.locale ?? session.locale,
        timezone: dto.timezone ?? session.timezone,
        source: session.appVersion,
        createdAt: timestamp,
      },
      {
        scope: 'notifications',
        value: dto.notificationsOptIn ? 'opt_in' : 'opt_out',
        sessionId: session.id,
        userId: session.userId,
        locale: dto.locale ?? session.locale,
        timezone: dto.timezone ?? session.timezone,
        source: session.appVersion,
        createdAt: timestamp,
      },
      {
        scope: 'marketing',
        value: dto.marketingOptIn ? 'opt_in' : 'opt_out',
        sessionId: session.id,
        userId: session.userId,
        locale: dto.locale ?? session.locale,
        timezone: dto.timezone ?? session.timezone,
        source: session.appVersion,
        createdAt: timestamp,
      },
    ];

    await this.prisma.onboardingConsent.createMany({ data: entries });
    await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: { locale: dto.locale ?? session.locale, timezone: dto.timezone ?? session.timezone },
    });

    return {
      status: 'ok',
      data: {
        locationPermission: dto.locationPermission,
        notificationsOptIn: dto.notificationsOptIn,
        marketingOptIn: dto.marketingOptIn,
        timestamps: {
          recordedAt: timestamp.toISOString(),
        },
        nextHint: dto.locationPermission === 'granted' ? 'ready_to_complete' : 'enable_location',
      },
    };
  }

  async getContext(session: SessionWithUser, lat?: number, lng?: number) {
    await this.ensureActive(session.id);
    const pickupHints = this.buildPickupHints(lat, lng);
    const destinations = [
      { label: 'Home', lat: lat ?? 12.9352, lng: lng ?? 77.6245 },
      { label: 'Work', lat: lat ? lat + 0.01 : 12.9752, lng: lng ? lng + 0.01 : 77.5945 },
    ];
    const schemes = [
      { id: 'cashback_5', title: '5% cashback on wallet reloads', expiresInHours: 48 },
      { id: 'streak_bonus', title: 'Complete 5 rides to unlock bonus', expiresInHours: 72 },
    ];
    return {
      status: 'ok',
      data: {
        pickupHints,
        topDestinations: destinations,
        schemes,
        featureFlags: session.featureFlagsJson ?? {},
        cacheTtl: 30,
      },
    };
  }

  async complete(session: SessionWithUser, dto?: Partial<ProfileDto>) {
    const freshSession = await this.ensureActive(session.id);
    if (dto?.name || dto?.email) {
      await this.prisma.onboardingSession.update({
        where: { id: freshSession.id },
        data: {
          name: dto.name ?? undefined,
          email: dto.email ?? undefined,
          locale: dto.locale ?? undefined,
          timezone: dto.timezone ?? undefined,
        },
      });
    }
    const hydratedSession = await this.prisma.onboardingSession.findUnique({
      where: { id: freshSession.id },
      include: { user: true },
    });
    if (!hydratedSession?.otpVerifiedAt) {
      throw new BadRequestException({ message: 'Phone not verified', error_code: 'verification_failed' });
    }
    if (!hydratedSession.phone) {
      throw new BadRequestException({ message: 'Phone missing on session', error_code: 'invalid_state' });
    }

    // Consents are only required for DRIVER onboarding; PASSENGER flow skips this step.
    let consentMap: Record<string, string | undefined> = {};
    if (hydratedSession.userRole === UserRole.DRIVER) {
      const consents = await this.prisma.onboardingConsent.findMany({
        where: { sessionId: hydratedSession.id },
        orderBy: { createdAt: 'desc' },
      });
      consentMap = this.reduceConsents(consents);
      if (!consentMap.location || !consentMap.notifications || !consentMap.marketing) {
        throw new BadRequestException({ message: 'Consents required', error_code: 'consent_required' });
      }
    }

    const user = await this.ensureUserForSession(hydratedSession, {
      name: hydratedSession.name ?? 'New User',
      phone: hydratedSession.phone,
      email: hydratedSession.email ?? undefined,
    });

    const activeUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.ACTIVE,
        name: hydratedSession.name ?? user.name,
        email: hydratedSession.email ?? user.email,
      },
    });

    let driverId: string | null = null;
    let passengerId: string | null = null;
    if (activeUser.role === UserRole.DRIVER) {
      const driver = await this.prisma.driver.upsert({
        where: { userId: activeUser.id },
        update: { name: hydratedSession.name ?? activeUser.name ?? 'Driver' },
        create: {
          userId: activeUser.id,
          name: hydratedSession.name ?? activeUser.name ?? 'Driver',
        },
      });
      driverId = driver.id;
    } else if (activeUser.role === UserRole.PASSENGER) {
      const passenger = await this.prisma.passenger.upsert({
        where: { userId: activeUser.id },
        update: { name: hydratedSession.name ?? activeUser.name },
        create: {
          userId: activeUser.id,
          name: hydratedSession.name ?? activeUser.name,
        },
      });
      passengerId = passenger.id;
    }

    const payload: Record<string, any> = {
      sub: activeUser.id,
      phone: activeUser.phone,
      role: activeUser.role,
    };
    if (driverId) payload.driverId = driverId;
    if (passengerId) payload.passengerId = passengerId;

    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    await this.prisma.onboardingSession.update({
      where: { id: hydratedSession.id },
      data: {
        status: OnboardingSessionStatus.COMPLETED,
        completedAt: new Date(),
        userId: activeUser.id,
      },
    });

    if (hydratedSession.featureFlagsJson) {
      await this.prisma.featureFlagAssignment.create({
        data: {
          userId: activeUser.id,
          deviceFingerprint: hydratedSession.deviceFingerprint,
          flags: hydratedSession.featureFlagsJson as object,
        },
      });
    }

    return {
      status: 'ok',
      data: {
        authToken: accessToken,
        refreshToken,
        userId: activeUser.id,
        driverId,
        passengerId,
        name: activeUser.name,
        phone: activeUser.phone,
        role: activeUser.role,
        userStatus: activeUser.status,
        nextHint:
          hydratedSession.userRole === UserRole.DRIVER
            ? consentMap.location === 'granted' ? 'load_wallet' : 'enable_location'
            : 'browse_trips',
      },
    };
  }

  private async ensureActive(sessionId: string): Promise<OnboardingSession> {
    const session = await this.prisma.onboardingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new UnauthorizedException('Onboarding session not found');
    }
    if (session.status === OnboardingSessionStatus.COMPLETED) {
      throw new UnauthorizedException('Onboarding session already completed');
    }
    if (session.status === OnboardingSessionStatus.EXPIRED || session.expiresAt.getTime() < Date.now()) {
      await this.prisma.onboardingSession.update({
        where: { id: session.id },
        data: { status: OnboardingSessionStatus.EXPIRED },
      });
      throw new UnauthorizedException('Onboarding session expired');
    }
    return session;
  }

  private async issueOtp(session: SessionWithUser, dto: ProfileDto) {
    await this.assertPhoneRoleAvailable(session, dto.phone);
    await this.assertWithinRateLimit(
      session.id,
      dto.phone,
      session.deviceFingerprint,
      VerificationAttemptType.SEND,
      this.otpSendLimit,
    );
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + this.otpTtlMs);
    const otpHash = this.hashOtp(code, session.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationAttempt.create({
        data: {
          phone: dto.phone,
          deviceFingerprint: session.deviceFingerprint,
          type: VerificationAttemptType.SEND,
          sessionId: session.id,
        },
      });
      await tx.onboardingSession.update({
        where: { id: session.id },
        data: {
          otpCodeHash: otpHash,
          otpExpiresAt: expiresAt,
          otpLastSentAt: new Date(),
          phone: dto.phone,
          email: dto.email ?? session.email,
          name: dto.name ?? session.name,
          locale: dto.locale ?? session.locale,
          timezone: dto.timezone ?? session.timezone,
        },
      });
    });

    const sent = await this.sms.sendOtp(dto.phone, code, {
      purpose: 'onboarding',
      ttlSeconds: Math.floor(this.otpTtlMs / 1000),
    });
    if (!sent.delivered && this.sms.deliversRealSms) {
      throw new BadRequestException({
        message: 'Could not send the OTP right now. Please try again shortly.',
        error_code: 'otp_delivery_failed',
      });
    }

    return { code, expiresAt };
  }

  private async verifyOtp(session: SessionWithUser, phone: string, otp: string) {
    await this.assertPhoneRoleAvailable(session, phone);
    await this.assertWithinRateLimit(
      session.id,
      phone,
      session.deviceFingerprint,
      VerificationAttemptType.VERIFY,
      this.otpVerifyLimit,
    );
    await this.recordAttempt(session.id, phone, session.deviceFingerprint, VerificationAttemptType.VERIFY);
    const record = await this.prisma.onboardingSession.findUnique({ where: { id: session.id } });
    if (!record?.otpCodeHash || !record.otpExpiresAt) {
      throw new BadRequestException({ message: 'OTP not requested', error_code: 'invalid_state' });
    }
    if (record.phone && record.phone !== phone) {
      throw new ConflictException({ message: 'Phone mismatch', error_code: 'conflict' });
    }
    if (record.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ message: 'OTP expired', error_code: 'expired_token' });
    }
    const hashed = this.hashOtp(otp, session.id);
    if (hashed !== record.otpCodeHash) {
      throw new BadRequestException({ message: 'Invalid OTP', error_code: 'invalid_otp' });
    }

    const updated = await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: { otpVerifiedAt: new Date(), phone, otpCodeHash: null, otpExpiresAt: null },
      include: { user: true },
    });
    return updated;
  }

  private async ensureUserForSession(session: SessionWithUser, dto: Partial<ProfileDto> & { phone: string }) {
    const existing = await this.assertPhoneRoleAvailable(session, dto.phone);
    if (existing) {
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: dto.name ?? session.name ?? existing.name,
          email: dto.email ?? session.email ?? existing.email,
          status: existing.status === UserStatus.INACTIVE ? UserStatus.PENDING : existing.status,
        },
      });
      await this.prisma.onboardingSession.update({
        where: { id: session.id },
        data: { userId: existing.id, name: updated.name, email: updated.email },
      });
      return updated;
    }

    const created = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        role: session.userRole,
        name: dto.name ?? session.name,
        email: dto.email ?? session.email,
        status: UserStatus.PENDING,
      },
    });
    await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: { userId: created.id },
    });
    return created;
  }

  private async buildCompletedAuthResponse(sessionId: string, user: User) {
    if (user.status !== UserStatus.ACTIVE) {
      return null;
    }

    let driver: Driver | null = null;
    let passenger: Passenger | null = null;

    if (user.role === UserRole.DRIVER) {
      driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
      if (!driver) return null;
    } else if (user.role === UserRole.PASSENGER) {
      passenger = await this.prisma.passenger.findUnique({ where: { userId: user.id } });
      if (!passenger) return null;
    } else {
      return null;
    }

    const payload: Record<string, any> = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };
    if (driver) payload.driverId = driver.id;
    if (passenger) payload.passengerId = passenger.id;

    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    await this.prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        status: OnboardingSessionStatus.COMPLETED,
        completedAt: new Date(),
        userId: user.id,
      },
    });

    return {
      status: 'ok',
      data: {
        authToken: accessToken,
        refreshToken,
        userId: user.id,
        driverId: driver?.id ?? null,
        passengerId: passenger?.id ?? null,
        name: user.name,
        phone: user.phone,
        role: user.role,
        userStatus: user.status,
        phoneVerified: true,
        hasName: Boolean(user.name),
        requiresName: false,
        hasCompletedOnboarding: true,
        nextHint: user.role === UserRole.DRIVER ? 'driver_dashboard' : 'browse_trips',
      },
    };
  }

  private async assertPhoneRoleAvailable(session: Pick<SessionWithUser, 'userRole'>, phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.role !== session.userRole) {
      throw new ConflictException({
        message: 'Phone already registered under another role',
        error_code: 'role_conflict',
        existingRole: existing.role,
      });
    }
    return existing;
  }

  private async assertWithinRateLimit(
    _sessionId: string,
    phone: string,
    deviceFingerprint: string,
    type: VerificationAttemptType,
    window: { count: number; windowMs: number },
  ) {
    const since = new Date(Date.now() - window.windowMs);
    const attempts = await this.prisma.verificationAttempt.count({
      where: {
        phone,
        deviceFingerprint,
        type,
        createdAt: { gte: since },
      },
    });
    if (attempts >= window.count) {
      throw new BadRequestException({
        message: 'Too many attempts',
        error_code: 'rate_limited',
        retry_after: Math.ceil(window.windowMs / 1000),
      });
    }
  }

  private async recordAttempt(
    sessionId: string,
    phone: string,
    deviceFingerprint: string,
    type: VerificationAttemptType,
  ) {
    await this.prisma.verificationAttempt.create({
      data: { phone, deviceFingerprint, type, sessionId },
    });
  }

  private assignFlags(deviceFingerprint: string) {
    const seed = createHash('sha256').update(deviceFingerprint).digest('hex');
    const bucket = parseInt(seed.slice(0, 4), 16) % 2;
    return {
      enableLocationNudge: true,
      enableWalletPrompt: bucket === 0,
    };
  }

  private buildPickupHints(lat?: number, lng?: number) {
    if (lat && lng) {
      return [
        { label: 'Nearest pickup', lat, lng },
        { label: 'High demand nearby', lat: lat + 0.005, lng: lng + 0.005 },
      ];
    }
    return [
      { label: 'Central Station', lat: 12.9716, lng: 77.5946 },
      { label: 'Popular hub', lat: 12.9352, lng: 77.6245 },
    ];
  }

  private reduceConsents(consents: OnboardingConsent[]) {
    const map: Record<string, string | undefined> = {};
    consents.forEach((c) => {
      if (!map[c.scope]) {
        map[c.scope] = c.value;
      }
    });
    return map;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashOtp(code: string, sessionId: string) {
    return this.hash(`${sessionId}:${code}`);
  }
}

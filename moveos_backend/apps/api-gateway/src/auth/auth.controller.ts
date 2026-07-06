import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService, SMS_PROVIDER, SmsProvider } from '@common/index';
import { OrganizationMemberRole, OrganizationMemberStatus, UserRole } from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { OtpRequestDto, OtpVerifyDto, RefreshTokenDto } from '../dto/auth.dto';

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SEND_LIMIT = 5; // per phone per window
const OTP_SEND_WINDOW_SECONDS = 60 * 60;

type OtpScope = 'driver' | 'admin' | 'org';

/**
 * Login OTP flows for returning users (driver app re-login, super admin,
 * org admin). OTP state lives in Redis (hashed code + attempt counter with
 * TTL) so gateway restarts don't invalidate codes and horizontal scaling
 * works. First-time signup still goes through onboarding-service.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ─── DRIVER login ──────────────────────────────────────────────────────────

  @Post('otp/request')
  async requestOtp(@Body() body: OtpRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: body.phone },
      include: { driver: true },
    });
    // Anti-enumeration: identical response shape whether or not the phone is
    // registered. The OTP is only stored (and sent) for real driver accounts.
    if (!user || user.role !== UserRole.DRIVER || !user.driver) {
      return { sent: true };
    }
    const code = await this.issueOtp('driver', body.phone, 'login');
    return {
      sent: true,
      devOtpCode: this.sms.deliversRealSms ? undefined : code,
    };
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: OtpVerifyDto) {
    await this.assertOtpValid('driver', body.phone, body.otp);
    const user = await this.prisma.user.findUnique({
      where: { phone: body.phone },
      include: { driver: true, passenger: true },
    });
    if (!user || user.role !== UserRole.DRIVER || !user.driver) {
      throw new BadRequestException('Invalid OTP');
    }
    await this.clearOtp('driver', body.phone);
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      driverId: user.driver.id,
      ...(user.passenger ? { passengerId: user.passenger.id } : {}),
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });
    return { accessToken, refreshToken, driverId: user.driver.id, userId: user.id, role: user.role };
  }

  @Post('refresh')
  refreshAccessToken(@Body() body: RefreshTokenDto) {
    try {
      const payload = this.jwt.verify<Record<string, unknown>>(body.refreshToken);
      const { exp: _exp, iat: _iat, ...claims } = payload;
      const accessToken = this.jwt.sign(claims, { expiresIn: '8h' });
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ─── SUPER_ADMIN login ────────────────────────────────────────────────────

  @Post('admin/otp/request')
  async requestAdminOtp(@Body() body: OtpRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      return { sent: true };
    }
    const code = await this.issueOtp('admin', body.phone, 'login');
    return { sent: true, devOtpCode: this.sms.deliversRealSms ? undefined : code };
  }

  @Post('admin/otp/verify')
  async verifyAdminOtp(@Body() body: OtpVerifyDto) {
    await this.assertOtpValid('admin', body.phone, body.otp);
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('SUPER_ADMIN access required');
    }
    await this.clearOtp('admin', body.phone);
    const payload = { sub: user.id, phone: user.phone, role: user.role, name: user.name };
    const accessToken = this.jwt.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });
    return { accessToken, refreshToken, role: user.role, name: user.name, userId: user.id };
  }

  // ─── ORGANIZATION ADMIN login ─────────────────────────────────────────────

  @Post('organization/otp/request')
  async requestOrganizationOtp(@Body() body: OtpRequestDto) {
    const memberships = await this.findAdminMemberships(body.phone);
    if (memberships.length === 0) {
      return { sent: true };
    }
    const code = await this.issueOtp('org', body.phone, 'login');
    return { sent: true, devOtpCode: this.sms.deliversRealSms ? undefined : code };
  }

  @Post('organization/otp/verify')
  async verifyOrganizationOtp(@Body() body: OtpVerifyDto) {
    await this.assertOtpValid('org', body.phone, body.otp);
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    const memberships = user
      ? await this.prisma.organizationMember.findMany({
          where: {
            userId: user.id,
            status: OrganizationMemberStatus.ACTIVE,
            role: {
              in: [
                OrganizationMemberRole.OWNER,
                OrganizationMemberRole.ADMIN,
                OrganizationMemberRole.FLEET_MANAGER,
                OrganizationMemberRole.COMPLIANCE_MANAGER,
              ],
            },
          },
          include: {
            organization: {
              select: { id: true, legalName: true, tradeName: true, status: true },
            },
          },
        })
      : [];

    if (!user || memberships.length === 0) {
      throw new ForbiddenException('Organization admin access required');
    }

    await this.clearOtp('org', body.phone);
    const defaultMembership = memberships[0];
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: 'ORG_ADMIN',
      name: user.name,
      organizationIds: memberships.map((m) => m.organizationId),
      defaultOrganizationId: defaultMembership.organizationId,
      orgRole: defaultMembership.role,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });
    return {
      accessToken,
      refreshToken,
      role: 'ORG_ADMIN',
      name: user.name,
      userId: user.id,
      defaultOrganizationId: defaultMembership.organizationId,
      memberships: memberships.map((membership) => ({
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        organization: membership.organization,
      })),
    };
  }

  // ─── OTP plumbing (Redis-backed) ──────────────────────────────────────────

  private async issueOtp(scope: OtpScope, phone: string, purpose: 'login'): Promise<string> {
    const redis = this.redis.getClient();
    const sendCountKey = `otp:${scope}:sends:${phone}`;
    const sends = await redis.incr(sendCountKey);
    if (sends === 1) {
      await redis.expire(sendCountKey, OTP_SEND_WINDOW_SECONDS);
    }
    if (sends > OTP_SEND_LIMIT) {
      throw new BadRequestException({
        message: 'Too many OTP requests. Please wait before trying again.',
        error_code: 'rate_limited',
      });
    }

    const code = randomInt(100000, 999999).toString();
    const stateKey = `otp:${scope}:state:${phone}`;
    await redis.set(stateKey, JSON.stringify({ hash: this.hashOtp(scope, phone, code), attempts: 0 }), 'EX', OTP_TTL_SECONDS);
    await this.sms.sendOtp(phone, code, { purpose, ttlSeconds: OTP_TTL_SECONDS });
    return code;
  }

  private async assertOtpValid(scope: OtpScope, phone: string, otp: string): Promise<void> {
    const redis = this.redis.getClient();
    const stateKey = `otp:${scope}:state:${phone}`;
    const raw = await redis.get(stateKey);
    if (!raw) {
      throw new BadRequestException('Invalid OTP');
    }
    const state = JSON.parse(raw) as { hash: string; attempts: number };
    if (state.attempts >= OTP_MAX_ATTEMPTS) {
      await redis.del(stateKey);
      throw new BadRequestException({
        message: 'Too many failed attempts. Please request a new OTP.',
        error_code: 'rate_limited',
      });
    }
    if (this.hashOtp(scope, phone, otp) !== state.hash) {
      const ttl = await redis.ttl(stateKey);
      await redis.set(
        stateKey,
        JSON.stringify({ ...state, attempts: state.attempts + 1 }),
        'EX',
        ttl > 0 ? ttl : OTP_TTL_SECONDS,
      );
      throw new BadRequestException('Invalid OTP');
    }
  }

  private async clearOtp(scope: OtpScope, phone: string): Promise<void> {
    await this.redis.getClient().del(`otp:${scope}:state:${phone}`);
  }

  private hashOtp(scope: OtpScope, phone: string, code: string): string {
    return createHash('sha256').update(`${scope}:${phone}:${code}`).digest('hex');
  }

  private async findAdminMemberships(phone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) return [];
    return this.prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: OrganizationMemberStatus.ACTIVE,
        role: {
          in: [
            OrganizationMemberRole.OWNER,
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.FLEET_MANAGER,
            OrganizationMemberRole.COMPLIANCE_MANAGER,
          ],
        },
      },
    });
  }
}

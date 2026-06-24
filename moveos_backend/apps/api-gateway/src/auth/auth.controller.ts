import { BadRequestException, Body, Controller, ForbiddenException, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@common/index';
import { OrganizationMemberRole, OrganizationMemberStatus } from '@prisma/client';
import { OtpRequestDto, OtpVerifyDto, RefreshTokenDto } from '../dto/auth.dto';

type StoredOtp = { code: string; driverId: string; role: 'DRIVER' | 'ADMIN' };
type AdminOtp = { code: string; userId: string };
type OrgOtp = { code: string; userId: string; membershipIds: string[] };

@Controller('auth')
export class AuthController {
  private readonly otpStore = new Map<string, StoredOtp>();
  private readonly adminOtpStore = new Map<string, AdminOtp>();
  private readonly orgOtpStore = new Map<string, OrgOtp>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('otp/request')
  requestOtp(@Body() body: OtpRequestDto) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const driverId = this.otpStore.get(body.phone)?.driverId ?? `drv_${Date.now()}`;
    this.otpStore.set(body.phone, { code, driverId, role: 'DRIVER' });
    return { devOtpCode: code, driverId };
  }

  @Post('otp/verify')
  verifyOtp(@Body() body: OtpVerifyDto) {
    const entry = this.otpStore.get(body.phone);
    if (!entry || entry.code !== body.otp) {
      throw new BadRequestException('Invalid OTP');
    }
    const payload = { sub: entry.driverId, phone: body.phone, role: entry.role, driverId: entry.driverId };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });
    return { accessToken, refreshToken, driverId: entry.driverId, role: entry.role };
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
      // Return same shape regardless to avoid phone enumeration
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      this.adminOtpStore.set(body.phone, { code, userId: 'invalid' });
      return { sent: true };
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.adminOtpStore.set(body.phone, { code, userId: user.id });
    return { sent: true, devOtpCode: code };
  }

  @Post('admin/otp/verify')
  async verifyAdminOtp(@Body() body: OtpVerifyDto) {
    const entry = this.adminOtpStore.get(body.phone);
    if (!entry || entry.code !== body.otp || entry.userId === 'invalid') {
      throw new BadRequestException('Invalid OTP or phone not authorized');
    }
    const user = await this.prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('SUPER_ADMIN access required');
    }
    this.adminOtpStore.delete(body.phone);
    const payload = { sub: user.id, phone: user.phone, role: user.role, name: user.name };
    const accessToken = this.jwt.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwt.sign(payload, { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d' });
    return { accessToken, refreshToken, role: user.role, name: user.name, userId: user.id };
  }

  // ─── ORGANIZATION ADMIN login ─────────────────────────────────────────────

  @Post('organization/otp/request')
  async requestOrganizationOtp(@Body() body: OtpRequestDto) {
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
        })
      : [];

    if (!user || memberships.length === 0) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      this.orgOtpStore.set(body.phone, { code, userId: 'invalid', membershipIds: [] });
      return { sent: true };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.orgOtpStore.set(body.phone, { code, userId: user.id, membershipIds: memberships.map((m) => m.id) });
    return { sent: true, devOtpCode: code };
  }

  @Post('organization/otp/verify')
  async verifyOrganizationOtp(@Body() body: OtpVerifyDto) {
    const entry = this.orgOtpStore.get(body.phone);
    if (!entry || entry.code !== body.otp || entry.userId === 'invalid') {
      throw new BadRequestException('Invalid OTP or phone not authorized');
    }

    const user = await this.prisma.user.findUnique({ where: { id: entry.userId } });
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        id: { in: entry.membershipIds },
        status: OrganizationMemberStatus.ACTIVE,
      },
      include: {
        organization: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            status: true,
          },
        },
      },
    });

    if (!user || memberships.length === 0) {
      throw new ForbiddenException('Organization admin access required');
    }

    this.orgOtpStore.delete(body.phone);
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
    const refreshToken = this.jwt.sign(payload, { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d' });
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
}

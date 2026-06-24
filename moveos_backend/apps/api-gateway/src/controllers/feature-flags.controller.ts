import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';

@Controller()
export class FeatureFlagsController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/feature-flags')
  async myFeatureFlags(@Req() req: any) {
    const userId = (req.user as { sub: string }).sub;
    const assignment = await this.prisma.featureFlagAssignment.findFirst({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return { flags: (assignment?.flags as Record<string, unknown>) ?? {} };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('admin/feature-flags')
  async adminFeatureFlags(@Query('userId') userId?: string) {
    if (!userId) {
      return { userId: null, flags: {}, assignmentCount: 0 };
    }
    const assignments = await this.prisma.featureFlagAssignment.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    const flags = assignments.length > 0
      ? (assignments[0].flags as Record<string, unknown>) ?? {}
      : {};
    return { userId, flags, assignmentCount: assignments.length };
  }
}

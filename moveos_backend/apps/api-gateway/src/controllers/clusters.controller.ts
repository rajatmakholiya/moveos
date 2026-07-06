import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import { OrganizationDriverStatus, OrgPlanTier } from '@prisma/client';
import { SchedulingServiceClient } from '../clients/scheduling-service.client';

/**
 * Cluster marketplace routes. Clustering is a paid feature: drivers in a
 * GROWTH/ENTERPRISE organization get it with their plan; independent drivers
 * unlock it via the `clusters_enabled` feature flag (individual Cluster Pack).
 * Everyone else gets 402 FEATURE_LOCKED with an upgrade pointer.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ClustersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingClient: SchedulingServiceClient,
  ) {}

  // ── Driver ──────────────────────────────────────────────────────────────────

  @Roles('DRIVER')
  @Get('driver/clusters')
  async listClusters(@Req() req: any, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    await this.assertClustersUnlocked(req);
    return this.schedulingClient.listClusters(lat, lng);
  }

  @Roles('DRIVER')
  @Post('driver/clusters/:clusterId/accept')
  async acceptCluster(
    @Req() req: any,
    @Param('clusterId') clusterId: string,
    @Body() body: { vehicleId?: string; routeId?: string },
  ) {
    await this.assertClustersUnlocked(req);
    return this.schedulingClient.acceptCluster(this.driverId(req), clusterId, body ?? {});
  }

  @Roles('DRIVER')
  @Post('driver/clusters/:clusterId/reject')
  async rejectCluster(@Req() req: any, @Param('clusterId') clusterId: string) {
    await this.assertClustersUnlocked(req);
    return this.schedulingClient.rejectCluster(this.driverId(req), clusterId);
  }

  // ── Passenger (not plan-gated — the driver/org pays for clustering) ────────

  @Roles('PASSENGER')
  @Get('passenger/clusters')
  listPassengerClusters(@Req() req: any) {
    return this.schedulingClient.listPassengerClusters(this.passengerId(req));
  }

  @Roles('PASSENGER')
  @Post('passenger/clusters/:clusterId/confirm')
  confirmCluster(@Req() req: any, @Param('clusterId') clusterId: string) {
    return this.schedulingClient.confirmCluster(this.passengerId(req), clusterId, true);
  }

  @Roles('PASSENGER')
  @Post('passenger/clusters/:clusterId/opt-out')
  optOutCluster(@Req() req: any, @Param('clusterId') clusterId: string) {
    return this.schedulingClient.confirmCluster(this.passengerId(req), clusterId, false);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @Roles('SUPER_ADMIN')
  @Get('admin/clusters')
  listAllClusters() {
    return this.schedulingClient.listAllClusters();
  }

  @Roles('SUPER_ADMIN')
  @Post('admin/clusters/run')
  runClustering() {
    return this.schedulingClient.runClustering();
  }

  // ── Plan gate ───────────────────────────────────────────────────────────────

  private async assertClustersUnlocked(req: any) {
    const driverId = this.driverId(req);
    const userId = req.user?.sub as string | undefined;

    // Org path: any active org membership on a paid tier unlocks clusters.
    const paidOrgLink = await this.prisma.organizationDriver.findFirst({
      where: {
        driverId,
        status: OrganizationDriverStatus.ACTIVE,
        organization: { planTier: { in: [OrgPlanTier.GROWTH, OrgPlanTier.ENTERPRISE] }, status: 'ACTIVE' },
      },
    });
    if (paidOrgLink) return;

    // Independent path: per-user feature flag (individual "Cluster Pack").
    if (userId) {
      const flags = await this.prisma.featureFlagAssignment.findFirst({
        where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'desc' },
      });
      const enabled = (flags?.flags as Record<string, unknown> | null)?.clusters_enabled === true;
      if (enabled) return;
    }

    throw new HttpException(
      {
        message: 'Clusters are available on the GROWTH plan. Upgrade to unlock passenger clustering.',
        code: 'FEATURE_LOCKED',
        feature: 'clusters',
        upgradeUrl: '/driver/organizations',
      },
      402,
    );
  }

  private driverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }

  private passengerId(req: any): string {
    return req.user?.passengerId ?? req.user?.sub;
  }
}

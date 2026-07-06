import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ClusterService } from './cluster.service';

@Controller('scheduling/clusters')
export class ClusterController {
  constructor(private readonly clusters: ClusterService) {}

  @Post('run')
  run() {
    return this.clusters.runClustering();
  }

  @Get()
  list(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.clusters.listOpenClusters(lat ? Number(lat) : undefined, lng ? Number(lng) : undefined);
  }

  @Get('all')
  listAll() {
    return this.clusters.listAllClusters();
  }

  @Get('passenger/:passengerId')
  listForPassenger(@Param('passengerId') passengerId: string) {
    return this.clusters.listPassengerClusters(passengerId);
  }

  @Post(':clusterId/accept')
  accept(
    @Param('clusterId') clusterId: string,
    @Headers('x-driver-id') driverId: string,
    @Body() body: { vehicleId?: string; routeId?: string },
  ) {
    return this.clusters.acceptCluster(clusterId, driverId, body?.vehicleId, body?.routeId);
  }

  @Post(':clusterId/reject')
  reject(@Param('clusterId') clusterId: string, @Headers('x-driver-id') driverId: string) {
    return this.clusters.rejectCluster(clusterId, driverId);
  }

  @Post(':clusterId/confirm')
  confirm(
    @Param('clusterId') clusterId: string,
    @Headers('x-passenger-id') passengerId: string,
    @Body() body: { confirm: boolean },
  ) {
    return this.clusters.confirmClusterParticipation(clusterId, passengerId, body?.confirm !== false);
  }
}

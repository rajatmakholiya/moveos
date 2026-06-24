import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { RideServiceClient } from '../clients/ride-service.client';
import { DispatchServiceClient } from '../clients/dispatch-service.client';
import { RiderOtpDto, RideCancelDto } from '../dto/rides.dto';
import { DriverRideEligibilityService } from '../services/driver-ride-eligibility.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('rides')
export class RidesController {
  constructor(
    private readonly rideClient: RideServiceClient,
    private readonly dispatchClient: DispatchServiceClient,
    private readonly eligibilityService: DriverRideEligibilityService,
  ) {}

  @Post(':rideId/accept')
  async acceptRide(@Req() req: any, @Param('rideId') rideId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'ACCEPT_RIDE',
    });
    return this.dispatchClient.acceptRide(rideId, driverId);
  }

  @Post(':rideId/reject')
  async rejectRide(@Req() req: any, @Param('rideId') rideId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'REJECT_RIDE',
    });
    return this.dispatchClient.rejectRide(rideId, driverId);
  }

  @Post(':rideId/arrived')
  async arrived(@Req() req: any, @Param('rideId') rideId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'START_RIDE',
    });
    return this.rideClient.arrived(rideId, driverId);
  }

  @Post(':rideId/start')
  async start(@Req() req: any, @Param('rideId') rideId: string, @Body() body: RiderOtpDto) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'START_RIDE',
    });
    return this.rideClient.start(rideId, driverId, body.riderOtp);
  }

  @Post(':rideId/complete')
  async complete(@Req() req: any, @Param('rideId') rideId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'COMPLETE_RIDE',
    });
    return this.rideClient.complete(rideId, driverId);
  }

  @Post(':rideId/cancel')
  async cancel(@Req() req: any, @Param('rideId') rideId: string, @Body() body: RideCancelDto) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'CANCEL_RIDE',
    });
    return this.rideClient.cancel(rideId, driverId, body.reason);
  }

  private getDriverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }
}

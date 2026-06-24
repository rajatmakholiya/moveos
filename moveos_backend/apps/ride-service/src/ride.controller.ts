import { Body, Controller, Param, Post } from '@nestjs/common';
import { RideService } from './ride.service';
import { RideActionDto, RideCancelDto, RideStartDto } from './dto/ride.dto';

@Controller('rides')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Post(':rideId/arrived')
  arrived(@Param('rideId') rideId: string, @Body() body: RideActionDto) {
    return this.rideService.arrived(rideId, body.driverId);
  }

  @Post(':rideId/start')
  start(@Param('rideId') rideId: string, @Body() body: RideStartDto) {
    return this.rideService.start(rideId, body.driverId, body.riderOtp);
  }

  @Post(':rideId/complete')
  complete(@Param('rideId') rideId: string, @Body() body: RideActionDto) {
    return this.rideService.complete(rideId, body.driverId);
  }

  @Post(':rideId/cancel')
  cancel(@Param('rideId') rideId: string, @Body() body: RideCancelDto) {
    return this.rideService.cancel(rideId, body.driverId, body.reason);
  }
}

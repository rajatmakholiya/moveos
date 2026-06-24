import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { CreateTransportRequestDto, RideDecisionDto } from './dto/dispatch.dto';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Post('rides/:rideId/accept')
  accept(@Param('rideId') rideId: string, @Body() body: RideDecisionDto) {
    return this.dispatchService.acceptRide(rideId, body.driverId);
  }

  @Post('rides/:rideId/reject')
  reject(@Param('rideId') rideId: string, @Body() body: RideDecisionDto) {
    return this.dispatchService.rejectRide(rideId, body.driverId);
  }

  @Get('requests')
  listRequests(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('passengerId') passengerId?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.dispatchService.listRequests({
      type,
      status,
      driverId,
      passengerId,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    });
  }

  @Post('requests')
  createRequest(@Body() body: CreateTransportRequestDto) {
    return this.dispatchService.createRequest(body);
  }

  @Post('requests/:requestId/accept')
  acceptRequest(@Param('requestId') requestId: string, @Body() body: RideDecisionDto) {
    const result = this.dispatchService.acceptRequest(requestId, body.driverId);
    if (!result) throw new NotFoundException('Request not found');
    return result;
  }

  @Post('requests/:requestId/reject')
  rejectRequest(@Param('requestId') requestId: string, @Body() body: RideDecisionDto) {
    return this.dispatchService.rejectRequest(requestId, body.driverId);
  }

  @Post('requests/:requestId/complete')
  completeRequest(
    @Param('requestId') requestId: string,
    @Body() body: RideDecisionDto & { agreedAmountPaise?: number },
  ) {
    return this.dispatchService.completeRequest(requestId, body.driverId, body.agreedAmountPaise);
  }

  @Post('requests/:requestId/cancel')
  cancelRequest(@Param('requestId') requestId: string, @Body() body: RideDecisionDto) {
    return this.dispatchService.cancelRequest(requestId, body.driverId);
  }
}

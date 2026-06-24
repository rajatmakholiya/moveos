import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { SchedulingServiceClient } from '../clients/scheduling-service.client';
import { AvailableTripsGatewayDto, CreateTripGatewayDto } from '../dto/trips.dto';
import { DriverRideEligibilityService } from '../services/driver-ride-eligibility.service';
import { GatewayEventsGateway } from '../gateway/events.gateway';

// No auth guard — these are public search endpoints.
@Controller('trips')
export class TripsController {
  constructor(private readonly schedulingClient: SchedulingServiceClient) {}

  @Get('available')
  getAvailableTrips(@Query() query: AvailableTripsGatewayDto) {
    return this.schedulingClient.getAvailableTrips(query);
  }

  @Get(':tripId/timeline')
  getTripTimeline(@Param('tripId') tripId: string) {
    return this.schedulingClient.getTripTimeline(tripId);
  }

  @Get(':tripId')
  getTrip(@Param('tripId') tripId: string) {
    return this.schedulingClient.getTrip(tripId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('driver/trips')
export class DriverTripsController {
  constructor(
    private readonly schedulingClient: SchedulingServiceClient,
    private readonly eligibilityService: DriverRideEligibilityService,
    private readonly wsGateway: GatewayEventsGateway,
  ) {}

  @Get()
  getDriverTrips(@Req() req: any, @Query('scope') scope?: string) {
    return this.schedulingClient.getDriverTrips(this.getDriverId(req), scope);
  }

  @Post()
  async createTrip(@Req() req: any, @Body() body: CreateTripGatewayDto) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      vehicleId: body.vehicleId,
      action: 'CREATE_TRIP',
    });
    return this.schedulingClient.createTrip(driverId, { ...body });
  }

  @Post(':tripId/cancel')
  async cancelTrip(@Req() req: any, @Param('tripId') tripId: string) {
    const result = await this.schedulingClient.cancelTrip(this.getDriverId(req), tripId) as any;
    this.wsGateway.emitTripUpdated(tripId, { tripId, status: 'CANCELLED' });
    const passengerIds: string[] = result?.passengerIds ?? [];
    for (const pid of passengerIds) {
      this.wsGateway.emitBookingUpdated(pid, { tripId, bookingStatus: 'CANCELLED' });
    }
    return result;
  }

  @Post(':tripId/depart')
  async departTrip(@Req() req: any, @Param('tripId') tripId: string) {
    const result = await this.schedulingClient.departTrip(this.getDriverId(req), tripId) as any;
    this.wsGateway.emitTripUpdated(tripId, { tripId, status: 'DEPARTED', departedAt: result?.departedAt });
    return result;
  }

  @Post(':tripId/complete')
  async completeTrip(@Req() req: any, @Param('tripId') tripId: string) {
    const result = await this.schedulingClient.completeTrip(this.getDriverId(req), tripId) as any;
    this.wsGateway.emitTripUpdated(tripId, { tripId, status: 'COMPLETED', completedAt: result?.completedAt });
    const passengerIds: string[] = result?.passengerIds ?? [];
    for (const pid of passengerIds) {
      this.wsGateway.emitBookingUpdated(pid, { tripId, bookingStatus: 'COMPLETED' });
    }
    return result;
  }

  @Post(':tripId/bookings/:bookingId/no-show')
  async markNoShow(
    @Req() req: any,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
  ) {
    const result = await this.schedulingClient.markNoShow(this.getDriverId(req), tripId, bookingId, body?.reason ?? '') as any;
    if (result?.passengerId) {
      this.wsGateway.emitBookingUpdated(result.passengerId, { tripId, bookingId, bookingStatus: 'NO_SHOW' });
    }
    return result;
  }

  @Get(':tripId/manifest')
  getManifest(@Req() req: any, @Param('tripId') tripId: string) {
    return this.schedulingClient.getManifest(this.getDriverId(req), tripId);
  }

  private getDriverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }
}

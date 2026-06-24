import { Controller, Post, Get, Body, Param, Query, Headers } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { AvailableTripsQueryDto } from './dto/available-trips-query.dto';

@Controller('scheduling/trips')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post()
  createTrip(
    @Headers('x-driver-id') driverId: string,
    @Body() dto: CreateTripDto,
  ) {
    return this.schedulingService.createTrip(driverId, dto);
  }

  // Static routes must be declared before :tripId to avoid being swallowed by the param route.

  @Get('available')
  getAvailableTrips(@Query() query: AvailableTripsQueryDto) {
    return this.schedulingService.getAvailableTrips(query);
  }

  @Get('driver/me')
  getDriverTrips(@Headers('x-driver-id') driverId: string, @Query('scope') scope?: string) {
    return this.schedulingService.getDriverTrips(driverId, scope);
  }

  @Get(':tripId')
  getTrip(@Param('tripId') tripId: string) {
    return this.schedulingService.getTrip(tripId);
  }

  @Get(':tripId/timeline')
  getTripTimeline(@Param('tripId') tripId: string) {
    return this.schedulingService.getTripTimeline(tripId);
  }

  @Post(':tripId/cancel')
  cancelTrip(
    @Param('tripId') tripId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.schedulingService.cancelTrip(tripId, driverId);
  }

  @Post(':tripId/depart')
  departTrip(
    @Param('tripId') tripId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.schedulingService.departTrip(tripId, driverId);
  }

  @Post(':tripId/complete')
  completeTrip(
    @Param('tripId') tripId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.schedulingService.completeTrip(tripId, driverId);
  }

  @Post(':tripId/bookings/:bookingId/no-show')
  markNoShow(
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
    @Body() body: { reason?: string },
  ) {
    return this.schedulingService.markNoShow(tripId, bookingId, driverId, body?.reason ?? '');
  }

  @Get(':tripId/manifest')
  getManifest(
    @Param('tripId') tripId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.schedulingService.getManifest(tripId, driverId);
  }
}

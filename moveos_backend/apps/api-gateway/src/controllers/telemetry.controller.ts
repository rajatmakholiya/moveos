import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { TelemetryServiceClient } from '../clients/telemetry-service.client';
import { LocationDto } from '../dto/telemetry.dto';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryClient: TelemetryServiceClient) {}

  @Post('location')
  sendLocation(@Req() req: any, @Body() body: LocationDto) {
    const driverId = this.getDriverId(req) ?? body.driverId ?? body.bookingId ?? 'web-client';
    return this.telemetryClient.sendLocation({ driverId, lat: body.lat, lng: body.lng });
  }

  @Get('location')
  getLocation(@Query('bookingId') bookingId?: string) {
    return this.telemetryClient.getLocation(bookingId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @Post('heartbeat')
  heartbeat(@Req() req: any) {
    const driverId = this.getDriverId(req) ?? req.user?.sub;
    return this.telemetryClient.heartbeat({ driverId });
  }

  private getDriverId(req: any): string | undefined {
    return req.user?.driverId ?? req.user?.sub;
  }
}

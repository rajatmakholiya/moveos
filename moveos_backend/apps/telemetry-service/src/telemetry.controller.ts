import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryDto, HeartbeatDto } from './dto/telemetry.dto';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('location')
  async handleLocation(@Body() body: TelemetryDto) {
    return this.telemetryService.ingestLocation(body.driverId, body.lat, body.lng);
  }

  @Get('location')
  async latestLocation(@Query('bookingId') bookingId?: string) {
    return this.telemetryService.latestLocation(bookingId);
  }

  @Post('heartbeat')
  async heartbeat(@Body() body: HeartbeatDto) {
    return this.telemetryService.heartbeat(body.driverId);
  }
}

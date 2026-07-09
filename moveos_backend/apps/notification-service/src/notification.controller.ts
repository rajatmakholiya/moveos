import { Body, Controller, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { DeviceTokenDto } from './dto/notification.dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('device-token')
  register(@Body() body: DeviceTokenDto) {
    return this.notificationService.registerDevice(body);
  }

  @Post('drop-off')
  dropOff(@Body() body: {
    bookingId: string;
    passengerId?: string | null;
    passengerPhone?: string | null;
    passengerName?: string | null;
    dropoffLabel?: string | null;
  }) {
    return this.notificationService.sendDropOff(body);
  }
}

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { NotificationServiceClient } from '../clients/notification-service.client';
import { DeviceTokenDto } from '../dto/notifications.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER', 'PASSENGER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationClient: NotificationServiceClient) {}

  @Post('device-token')
  register(@Req() req: any, @Body() body: DeviceTokenDto) {
    const driverId = req.user?.driverId ?? req.user?.passengerId ?? req.user?.sub;
    return this.notificationClient.registerDeviceToken({ driverId, token: body.token });
  }
}

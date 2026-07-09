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
    return this.notificationClient.registerDeviceToken({
      token: body.token,
      userId: req.user?.sub,
      driverId: req.user?.driverId ?? undefined,
      passengerId: req.user?.passengerId ?? undefined,
      platform: body.platform,
    });
  }
}

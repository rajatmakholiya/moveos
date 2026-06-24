import { Module } from '@nestjs/common';
import { AppConfigModule } from '@common/index';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule],
  controllers: [NotificationController, HealthController],
  providers: [NotificationService],
})
export class AppModule {}

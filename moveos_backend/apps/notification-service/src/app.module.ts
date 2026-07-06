import { Module } from '@nestjs/common';
import { AppConfigModule, PrismaModule, ProvidersModule, RedisModule } from '@common/index';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EventsConsumerService } from './events-consumer.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, ProvidersModule, RedisModule],
  controllers: [NotificationController, HealthController],
  providers: [NotificationService, EventsConsumerService],
})
export class AppModule {}

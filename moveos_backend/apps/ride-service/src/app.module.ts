import { Module } from '@nestjs/common';
import { AppConfigModule, PrismaModule, RedisModule, InternalEventBusModule } from '@common/index';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, InternalEventBusModule],
  controllers: [RideController, HealthController],
  providers: [RideService],
})
export class AppModule {}

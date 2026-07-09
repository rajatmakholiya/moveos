import { Module } from '@nestjs/common';
import { AppConfigModule, FileModule, PrismaModule, ProvidersModule, RedisModule } from '@common/index';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { PayoutService } from './payout.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, ProvidersModule, RedisModule, FileModule],
  controllers: [DriverController, HealthController],
  providers: [DriverService, PayoutService],
})
export class AppModule {}

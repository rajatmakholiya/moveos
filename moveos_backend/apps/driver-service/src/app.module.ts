import { Module } from '@nestjs/common';
import { AppConfigModule, FileModule, PrismaModule, RedisModule } from '@common/index';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, FileModule],
  controllers: [DriverController, HealthController],
  providers: [DriverService],
})
export class AppModule {}

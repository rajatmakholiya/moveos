import { Module } from '@nestjs/common';
import { AppConfigModule, RedisModule, InternalEventBusModule } from '@common/index';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, RedisModule, InternalEventBusModule],
  controllers: [TelemetryController, HealthController],
  providers: [TelemetryService],
})
export class AppModule {}

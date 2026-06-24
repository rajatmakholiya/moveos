import { Module } from '@nestjs/common';
import { AppConfigModule, RedisModule, InternalEventBusModule } from '@common/index';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, RedisModule, InternalEventBusModule],
  controllers: [DispatchController, HealthController],
  providers: [DispatchService],
})
export class AppModule {}

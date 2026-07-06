import { Module } from '@nestjs/common';
import { AppConfigModule, InternalEventBusModule, PrismaModule, RedisModule } from '@common/index';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, InternalEventBusModule],
  controllers: [DispatchController, HealthController],
  providers: [DispatchService],
})
export class AppModule {}

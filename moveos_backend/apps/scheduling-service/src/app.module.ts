import { Module } from '@nestjs/common';
import { AppConfigModule } from '@common/index';
import { SchedulingModule } from './scheduling/scheduling.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, SchedulingModule],
  controllers: [HealthController],
})
export class AppModule {}

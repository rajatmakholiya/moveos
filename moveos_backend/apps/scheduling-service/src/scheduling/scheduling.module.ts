import { Module } from '@nestjs/common';
import { PrismaModule, RedisModule } from '@common/index';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SchedulingController],
  providers: [SchedulingService],
})
export class SchedulingModule {}

import { Module } from '@nestjs/common';
import { PrismaModule, RedisModule } from '@common/index';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { ClusterController } from '../clusters/cluster.controller';
import { ClusterService } from '../clusters/cluster.service';
import { ClusterSchedulerService } from '../clusters/cluster-scheduler.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SchedulingController, ClusterController],
  providers: [SchedulingService, ClusterService, ClusterSchedulerService],
})
export class SchedulingModule {}

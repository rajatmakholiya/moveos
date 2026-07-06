import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClusterService } from './cluster.service';

const INTERVAL_MINUTES = Number(process.env.CLUSTER_INTERVAL_MINUTES ?? 30);

/**
 * Periodic clustering sweep. A plain interval (not BullMQ) is deliberate —
 * the run is idempotent and cheap, and this service runs as a single
 * instance. Disable with CLUSTER_INTERVAL_MINUTES=0.
 */
@Injectable()
export class ClusterSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClusterSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly clusters: ClusterService) {}

  onModuleInit() {
    if (INTERVAL_MINUTES <= 0) {
      this.logger.log('Cluster scheduler disabled (CLUSTER_INTERVAL_MINUTES=0)');
      return;
    }
    this.timer = setInterval(() => {
      void this.clusters
        .runClustering()
        .catch((err) => this.logger.warn(`Clustering run failed: ${(err as Error).message}`));
    }, INTERVAL_MINUTES * 60_000);
    // Don't keep the process alive just for the sweep.
    this.timer.unref?.();
    this.logger.log(`Cluster scheduler active (every ${INTERVAL_MINUTES} min)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

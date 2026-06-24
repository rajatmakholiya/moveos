import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingService } from './booking.service';

// How often the safety-net sweep runs, and how long after boot the first pass fires.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const INITIAL_DELAY_MS = 15 * 1000; // shortly after startup, once the app is settled

/**
 * Periodically heals trips left stuck in OPEN/DEPARTED with no active seats — the
 * cases the event-driven reconciler can't catch (transitions that happened before
 * it existed, or while the service was down). Uses a plain timer to avoid adding a
 * scheduling dependency. The boot pass also self-heals existing stuck data.
 */
@Injectable()
export class TripSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly bookings: BookingService) {}

  onModuleInit() {
    // First pass shortly after boot, then on a fixed interval.
    setTimeout(() => void this.runSweep(), INITIAL_DELAY_MS).unref?.();
    this.timer = setInterval(() => void this.runSweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.(); // don't keep the process alive solely for the sweep
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runSweep() {
    if (this.running) return; // never overlap passes
    this.running = true;
    try {
      await this.bookings.sweepStuckTrips();
    } catch (err) {
      this.logger.warn(`Stuck-trip sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

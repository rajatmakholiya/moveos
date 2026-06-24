import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { BookingService } from './booking.service';

const EVENTS_CHANNEL = 'pahadi:events';

/**
 * Reacts to trip lifecycle events on the shared event bus. On trip.departed
 * ("driver starts navigating") it pre-issues pickup OTPs for the whole trip, so
 * passengers have their code before the driver reaches the kerb.
 */
@Injectable()
export class TripEventsListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripEventsListenerService.name);
  private subscriber: Redis | null = null;

  constructor(private readonly bookings: BookingService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const sub = new Redis(redisUrl, { lazyConnect: true });
    this.subscriber = sub;
    sub.on('error', (err: Error) => this.logger.error('Trip events subscriber error', err.message));

    await sub.connect();
    await sub.subscribe(EVENTS_CHANNEL);

    sub.on('message', (_channel: string, message: string) => {
      let evt: { event?: string; tripId?: string };
      try {
        evt = JSON.parse(message);
      } catch {
        return; // malformed payload — skip
      }
      if (evt.event === 'trip.departed' && evt.tripId) {
        const tripId = evt.tripId;
        void this.bookings
          .issuePickupOtpsForTrip(tripId)
          .catch((err) => this.logger.warn(`OTP issuance failed for trip ${tripId}: ${(err as Error).message}`));
      }
    });

    this.logger.log(`Trip events listener active (${EVENTS_CHANNEL})`);
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
    this.subscriber = null;
  }
}

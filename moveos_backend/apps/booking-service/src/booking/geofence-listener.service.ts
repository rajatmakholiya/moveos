import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { BookingService } from './booking.service';

const LOCATION_CHANNEL_PREFIX = 'pahadi:location:';
// Minimum gap between geofence evaluations for the same driver. Telemetry can ping
// faster than this; we only need ~one DB read per few seconds to catch a crossing.
const MIN_EVAL_INTERVAL_MS = 4000;

/**
 * Subscribes to driver GPS pings and runs the booking-service geofence evaluator,
 * which auto-fires arrive-pickup / arrive-dropoff / dropoff transitions. Lives in
 * booking-service because that service owns the seat lifecycle these events drive.
 */
@Injectable()
export class GeofenceListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeofenceListenerService.name);
  private subscriber: Redis | null = null;
  private readonly lastEvalAt = new Map<string, number>();

  constructor(private readonly bookings: BookingService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const sub = new Redis(redisUrl, { lazyConnect: true });
    this.subscriber = sub;
    sub.on('error', (err: Error) => this.logger.error('Geofence subscriber error', err.message));

    await sub.connect();
    await sub.psubscribe(`${LOCATION_CHANNEL_PREFIX}*`);

    sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const driverId = channel.slice(LOCATION_CHANNEL_PREFIX.length);

      const now = Date.now();
      const last = this.lastEvalAt.get(driverId) ?? 0;
      if (now - last < MIN_EVAL_INTERVAL_MS) return; // throttle per driver
      this.lastEvalAt.set(driverId, now);

      let data: { lat?: number; lng?: number };
      try {
        data = JSON.parse(message);
      } catch {
        return; // malformed payload — skip
      }
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;

      void this.bookings
        .evaluateGeofences(driverId, data.lat, data.lng)
        .catch((err) => this.logger.warn(`Geofence eval error for ${driverId}: ${(err as Error).message}`));
    });

    this.logger.log('Geofence listener active (pahadi:location:*)');
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
    this.subscriber = null;
  }
}

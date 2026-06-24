import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '@common/index';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TelemetryService {
  private readonly geoKey = 'drivers:geo';

  constructor(
    private readonly redis: RedisService,
    @Inject('INTERNAL_EVENT_BUS') private readonly events: EventEmitter2,
  ) {}

  async ingestLocation(driverId: string, lat: number, lng: number) {
    const updatedAt = new Date().toISOString();
    const payload = { lat, lng, updatedAt };
    await this.redis.geoAddDriverLocation(this.geoKey, driverId, lat, lng);
    await this.redis.getClient().set(`location:latest:${driverId}`, JSON.stringify(payload), 'EX', 3600);
    await this.redis.setDriverState(driverId, 'ONLINE');
    // Publish for WebSocket relay in the API gateway
    await this.redis.getClient().publish(`pahadi:location:${driverId}`, JSON.stringify({ ...payload, driverId }));
    this.events.emit('driver.location.updated', { driverId, lat, lng });
    return { driverId, lat, lng, updatedAt };
  }

  async latestLocation(bookingId?: string) {
    if (bookingId) {
      const cached = await this.redis.getClient().get(`location:latest:${bookingId}`);
      if (cached) {
        return { location: JSON.parse(cached) };
      }
    }

    return {
      location: {
        lat: 29.5829,
        lng: 80.2182,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async heartbeat(driverId: string) {
    const timestamp = Date.now();
    await this.redis.trackHeartbeat(driverId, timestamp);
    this.events.emit('driver.heartbeat', { driverId, timestamp });
    return { driverId, lastSeenAt: new Date(timestamp).toISOString() };
  }
}

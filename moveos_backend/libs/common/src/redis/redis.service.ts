import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  async geoAddDriverLocation(clusterKey: string, driverId: string, lat: number, lng: number) {
    await this.client.geoadd(clusterKey, lng, lat, driverId);
  }

  async setDriverState(driverId: string, state: string) {
    await this.client.set(`driver:${driverId}:state`, state);
  }

  async setActiveRide(driverId: string, rideId: string | null) {
    if (rideId) {
      await this.client.set(`driver:${driverId}:activeRide`, rideId);
    } else {
      await this.client.del(`driver:${driverId}:activeRide`);
    }
  }

  async acceptRideAtomic(rideId: string, driverId: string): Promise<boolean> {
    const key = `ride:${rideId}:acceptedBy`;
    const result = await this.client.set(key, driverId, 'NX');
    return result === 'OK';
  }

  async trackHeartbeat(driverId: string, timestamp: number) {
    await this.client.set(`driver:${driverId}:heartbeat`, timestamp);
  }

  getClient() {
    return this.client;
  }
}

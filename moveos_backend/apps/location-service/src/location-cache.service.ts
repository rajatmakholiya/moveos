import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@common/index';
import { createHash } from 'crypto';

@Injectable()
export class LocationCacheService {
  private readonly ttlSeconds: number;
  private readonly enabled: boolean;
  private readonly prefix = 'location:cache:';
  private readonly logger = new Logger(LocationCacheService.name);

  constructor(private readonly redis: RedisService, config: ConfigService) {
    const rawTtl = Number(config.get('LOCATION_CACHE_TTL_SECONDS') ?? 300);
    this.ttlSeconds = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 0;
    this.enabled = this.ttlSeconds > 0;
    if (!this.enabled) {
      this.logger.warn('LOCATION_CACHE_TTL_SECONDS is not set or zero. Caching is disabled.');
    }
  }

  buildKey(kind: string, payload: unknown): string {
    const serialized = this.serialize(payload);
    const hash = createHash('sha256').update(serialized).digest('hex');
    return `${this.prefix}${kind}:${hash}`;
  }

  async getCached<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    const cached = await this.redis.getClient().get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  }

  async setCached<T>(key: string, value: T): Promise<void> {
    if (!this.enabled) return;
    await this.redis.getClient().setex(key, this.ttlSeconds, JSON.stringify(value));
  }

  private serialize(input: unknown): string {
    return JSON.stringify(this.normalize(input));
  }

  private normalize(value: any): any {
    if (Array.isArray(value)) {
      return value.map((v) => this.normalize(v));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.normalize(value[key]);
          return acc;
        }, {} as Record<string, any>);
    }
    return value;
  }
}

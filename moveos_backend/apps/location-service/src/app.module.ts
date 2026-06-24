import { Module } from '@nestjs/common';
import { AppConfigModule, HttpClientModule, RedisModule } from '@common/index';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { OlaMapsClient } from './ola-maps.client';
import { LocationCacheService } from './location-cache.service';
import { HealthController } from './health.controller';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({
  imports: [AppConfigModule, HttpClientModule, RedisModule],
  controllers: [LocationController, GeoController, HealthController],
  providers: [LocationService, GeoService, OlaMapsClient, LocationCacheService],
})
export class AppModule {}

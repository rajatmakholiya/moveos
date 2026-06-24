import { Injectable, Logger } from '@nestjs/common';
import {
  DirectionsRequestDto,
  DistanceMatrixRequestDto,
  FleetPlannerRequestDto,
  NearestRoadsRequestDto,
  NearbySearchAdvancedRequestDto,
  NearbySearchRequestDto,
  GeocodeRequestDto,
  ReverseGeocodeRequestDto,
  GeofenceCreateRequestDto,
  GeofenceUpdateRequestDto,
  GeofenceListRequestDto,
  GeofenceStatusRequestDto,
  PlaceDetailsAdvancedRequestDto,
  PlaceDetailsRequestDto,
  PlacePhotoRequestDto,
  PlacesAutocompleteRequestDto,
  AddressValidationRequestDto,
  RouteOptimizerRequestDto,
  SnapToRoadRequestDto,
  SpeedLimitsRequestDto,
  TextSearchRequestDto,
} from '@common/location';
import { OlaMapsClient } from './ola-maps.client';
import { LocationCacheService } from './location-cache.service';

@Injectable()
export class LocationService {
  private readonly inflight = new Map<string, Promise<any>>();
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly olaMaps: OlaMapsClient,
    private readonly cache: LocationCacheService,
  ) {}

  directions(payload: DirectionsRequestDto) {
    return this.resolveWithCache('directions', payload, () => this.olaMaps.directions(payload));
  }

  distanceMatrix(payload: DistanceMatrixRequestDto) {
    return this.resolveWithCache('distanceMatrix', payload, () => this.olaMaps.distanceMatrix(payload));
  }

  routeOptimizer(payload: RouteOptimizerRequestDto) {
    return this.resolveWithCache('routeOptimizer', payload, () => this.olaMaps.routeOptimizer(payload));
  }

  fleetPlanner(payload: FleetPlannerRequestDto) {
    return this.resolveWithCache('fleetPlanner', payload, () => this.olaMaps.fleetPlanner(payload));
  }

  snapToRoad(payload: SnapToRoadRequestDto) {
    return this.resolveWithCache('snapToRoad', payload, () => this.olaMaps.snapToRoad(payload));
  }

  nearestRoads(payload: NearestRoadsRequestDto) {
    return this.resolveWithCache('nearestRoads', payload, () => this.olaMaps.nearestRoads(payload));
  }

  speedLimits(payload: SpeedLimitsRequestDto) {
    return this.resolveWithCache('speedLimits', payload, () => this.olaMaps.speedLimits(payload));
  }

  placesAutocomplete(payload: PlacesAutocompleteRequestDto) {
    return this.resolveWithCache('placesAutocomplete', payload, () => this.olaMaps.placesAutocomplete(payload));
  }

  placeDetails(payload: PlaceDetailsRequestDto) {
    return this.resolveWithCache('placeDetails', payload, () => this.olaMaps.placeDetails(payload));
  }

  placeDetailsAdvanced(payload: PlaceDetailsAdvancedRequestDto) {
    return this.resolveWithCache('placeDetailsAdvanced', payload, () =>
      this.olaMaps.placeDetailsAdvanced(payload),
    );
  }

  nearbySearch(payload: NearbySearchRequestDto) {
    return this.resolveWithCache('nearbySearch', payload, () => this.olaMaps.nearbySearch(payload));
  }

  nearbySearchAdvanced(payload: NearbySearchAdvancedRequestDto) {
    return this.resolveWithCache('nearbySearchAdvanced', payload, () =>
      this.olaMaps.nearbySearchAdvanced(payload),
    );
  }

  textSearch(payload: TextSearchRequestDto) {
    return this.resolveWithCache('textSearch', payload, () => this.olaMaps.textSearch(payload));
  }

  addressValidation(payload: AddressValidationRequestDto) {
    return this.resolveWithCache('addressValidation', payload, () => this.olaMaps.addressValidation(payload));
  }

  async placePhoto(payload: PlacePhotoRequestDto) {
    const data = await this.resolveWithCache<Buffer | any>(
      'placePhoto',
      payload,
      () => this.olaMaps.placePhoto(payload),
      false,
    );
    if (Buffer.isBuffer(data)) {
      return { data: data.toString('base64') };
    }
    return { data };
  }

  geocode(payload: GeocodeRequestDto) {
    return this.resolveWithCache('geocode', payload, () => this.olaMaps.geocode(payload));
  }

  reverseGeocode(payload: ReverseGeocodeRequestDto) {
    return this.resolveWithCache('reverseGeocode', payload, () => this.olaMaps.reverseGeocode(payload));
  }

  createGeofence(payload: GeofenceCreateRequestDto) {
    return this.resolveWithCache('createGeofence', payload, () => this.olaMaps.createGeofence(payload), false);
  }

  updateGeofence(id: string, payload: GeofenceUpdateRequestDto) {
    return this.resolveWithCache(
      'updateGeofence',
      { id, payload },
      () => this.olaMaps.updateGeofence(id, payload),
      false,
    );
  }

  getGeofence(id: string) {
    return this.resolveWithCache('getGeofence', { id }, () => this.olaMaps.getGeofence(id), false);
  }

  deleteGeofence(id: string) {
    return this.resolveWithCache('deleteGeofence', { id }, () => this.olaMaps.deleteGeofence(id), false);
  }

  listGeofences(payload: GeofenceListRequestDto) {
    return this.resolveWithCache('listGeofences', payload, () => this.olaMaps.listGeofences(payload), false);
  }

  geofenceStatus(payload: GeofenceStatusRequestDto) {
    return this.resolveWithCache('geofenceStatus', payload, () => this.olaMaps.geofenceStatus(payload), false);
  }

  private async resolveWithCache<T>(
    kind: string,
    payload: object,
    fetcher: () => Promise<T>,
    cacheable = true,
  ): Promise<T> {
    const cacheKey = this.cache.buildKey(kind, payload);
    if (cacheable) {
      const cached = await this.cache.getCached<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const ongoing = this.inflight.get(cacheKey);
    if (ongoing) {
      return ongoing;
    }

    const promise = (async () => {
      try {
        const fresh = await fetcher();
        if (cacheable) {
          await this.cache.setCached(cacheKey, fresh);
        }
        return fresh;
      } catch (error) {
        this.logger.error(`Failed ${kind} request`, error as Error);
        throw error;
      } finally {
        this.inflight.delete(cacheKey);
      }
    })();

    this.inflight.set(cacheKey, promise);
    return promise;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';
import {
  CoordinateDto,
  DirectionsRequestDto,
  DistanceMatrixRequestDto,
  FleetPlannerRequestDto,
  GeocodeRequestDto,
  GeofenceCreateRequestDto,
  GeofenceListRequestDto,
  GeofenceStatusRequestDto,
  GeofenceUpdateRequestDto,
  NearestRoadsRequestDto,
  NearbySearchAdvancedRequestDto,
  NearbySearchRequestDto,
  PlaceDetailsAdvancedRequestDto,
  PlaceDetailsRequestDto,
  PlacePhotoRequestDto,
  PlacesAutocompleteRequestDto,
  PlacesRankBy,
  AddressValidationRequestDto,
  ReverseGeocodeRequestDto,
  RouteOptimizerRequestDto,
  RoutePreference,
  RoadMode,
  SnapStrategy,
  SnapToRoadRequestDto,
  SpeedLimitsRequestDto,
  TravelMode,
  TextSearchRequestDto,
} from '@common/location';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import * as FormData from 'form-data';

@Injectable()
export class OlaMapsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly httpAgent = new HttpAgent({ keepAlive: true });
  private readonly httpsAgent = new HttpsAgent({ keepAlive: true });

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('OLA_MAPS_BASE_URL') ?? 'https://api.olamaps.io';
    this.apiKey = this.config.get<string>('OLA_MAPS_API_KEY') ?? '';

    if (!this.apiKey) {
      throw new Error('OLA_MAPS_API_KEY is required to call Ola Maps APIs');
    }
  }

  directions(payload: DirectionsRequestDto) {
    const endpoint = payload.basic ? '/routing/v1/directions/basic' : '/routing/v1/directions';
    const params = this.buildDirectionsParams(payload);
    const url = `${this.baseUrl}${endpoint}?${params.toString()}`;
    return this.http.post(url, undefined, this.requestConfig());
  }

  distanceMatrix(payload: DistanceMatrixRequestDto) {
    const endpoint = payload.basic ? '/routing/v1/distanceMatrix/basic' : '/routing/v1/distanceMatrix';
    const params = this.buildDistanceMatrixParams(payload);
    const url = `${this.baseUrl}${endpoint}?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  routeOptimizer(payload: RouteOptimizerRequestDto) {
    const params = this.buildRouteOptimizerParams(payload);
    const url = `${this.baseUrl}/routing/v1/routeOptimizer?${params.toString()}`;
    return this.http.post(url, undefined, this.requestConfig());
  }

  placesAutocomplete(payload: PlacesAutocompleteRequestDto) {
    const params = this.buildAutocompleteParams(payload);
    const url = `${this.baseUrl}/places/v1/autocomplete?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  placeDetails(payload: PlaceDetailsRequestDto) {
    const params = this.buildPlaceDetailsParams(payload);
    const url = `${this.baseUrl}/places/v1/details?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  placeDetailsAdvanced(payload: PlaceDetailsAdvancedRequestDto) {
    const params = this.buildPlaceDetailsParams(payload);
    const url = `${this.baseUrl}/places/v1/details/advanced?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  nearbySearch(payload: NearbySearchRequestDto) {
    const params = this.buildNearbySearchParams(payload);
    const url = `${this.baseUrl}/places/v1/nearbysearch?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  nearbySearchAdvanced(payload: NearbySearchAdvancedRequestDto) {
    const params = this.buildNearbySearchParams(payload);
    const url = `${this.baseUrl}/places/v1/nearbysearch/advanced?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  textSearch(payload: TextSearchRequestDto) {
    const params = this.buildTextSearchParams(payload);
    const url = `${this.baseUrl}/places/v1/textsearch?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  addressValidation(payload: AddressValidationRequestDto) {
    const params = this.buildAddressValidationParams(payload);
    const url = `${this.baseUrl}/places/v1/addressvalidation?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  placePhoto(payload: PlacePhotoRequestDto) {
    const params = this.buildPhotoParams(payload);
    const url = `${this.baseUrl}/places/v1/photo?${params.toString()}`;
    return this.http.get(url, {
      ...this.requestConfig(),
      responseType: 'arraybuffer',
    });
  }

  fleetPlanner(payload: FleetPlannerRequestDto) {
    const params = this.buildFleetPlannerParams(payload);
    const url = `${this.baseUrl}/routing/v1/fleetPlanner?${params.toString()}`;
    const form = new FormData();
    form.append(
      'input',
      Buffer.from(JSON.stringify(payload.input)),
      {
        filename: payload.inputFilename ?? 'input.json',
        contentType: 'application/json',
      },
    );
    const config = {
      ...this.requestConfig(),
      headers: {
        ...form.getHeaders(),
      },
      maxBodyLength: 1_000_000, // ~1MB upper bound
    };
    return this.http.post(url, form, config);
  }

  snapToRoad(payload: SnapToRoadRequestDto) {
    const params = this.buildSnapToRoadParams(payload);
    const url = `${this.baseUrl}/routing/v1/snapToRoad?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  nearestRoads(payload: NearestRoadsRequestDto) {
    const params = this.buildNearestRoadsParams(payload);
    const url = `${this.baseUrl}/routing/v1/nearestRoads?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  speedLimits(payload: SpeedLimitsRequestDto) {
    const params = this.buildSpeedLimitsParams(payload);
    const url = `${this.baseUrl}/routing/v1/speedLimits?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  geocode(payload: GeocodeRequestDto) {
    const params = this.buildGeocodeParams(payload);
    const url = `${this.baseUrl}/places/v1/geocode?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  reverseGeocode(payload: ReverseGeocodeRequestDto) {
    const params = this.buildReverseGeocodeParams(payload);
    const url = `${this.baseUrl}/places/v1/reverse-geocode?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  createGeofence(payload: GeofenceCreateRequestDto) {
    const params = new URLSearchParams({ api_key: this.apiKey });
    const url = `${this.baseUrl}/places/v1/geofence?${params.toString()}`;
    return this.http.post(url, payload, this.requestConfig());
  }

  updateGeofence(id: string, payload: GeofenceUpdateRequestDto) {
    const params = new URLSearchParams({ api_key: this.apiKey });
    const url = `${this.baseUrl}/places/v1/geofence/${id}?${params.toString()}`;
    return this.http.put(url, payload, this.requestConfig());
  }

  getGeofence(id: string) {
    const params = new URLSearchParams({ api_key: this.apiKey });
    const url = `${this.baseUrl}/places/v1/geofence/${id}?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  deleteGeofence(id: string) {
    const params = new URLSearchParams({ api_key: this.apiKey });
    const url = `${this.baseUrl}/places/v1/geofence/${id}?${params.toString()}`;
    return this.http.delete(url, this.requestConfig());
  }

  listGeofences(payload: GeofenceListRequestDto) {
    const params = this.buildGeofenceListParams(payload);
    const url = `${this.baseUrl}/places/v1/geofences?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  geofenceStatus(payload: GeofenceStatusRequestDto) {
    const params = this.buildGeofenceStatusParams(payload);
    const url = `${this.baseUrl}/places/v1/geofence/status?${params.toString()}`;
    return this.http.get(url, this.requestConfig());
  }

  private buildDirectionsParams(payload: DirectionsRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('origin', this.formatCoordinate(payload.origin));
    params.set('destination', this.formatCoordinate(payload.destination));
    if (payload.waypoints?.length) {
      params.set(
        'waypoints',
        payload.waypoints.map((wp) => this.formatCoordinate(wp)).join('|'),
      );
    }
    params.set('mode', payload.mode ?? TravelMode.DRIVING);
    params.set('alternatives', String(payload.alternatives ?? false));
    params.set('steps', String(payload.steps ?? true));
    params.set('overview', payload.overview ?? 'full');
    params.set('language', payload.language ?? 'en');
    params.set('route_preference', payload.routePreference ?? RoutePreference.FASTEST);
    if (payload.trafficMetadata !== undefined) {
      params.set('traffic_metadata', String(payload.trafficMetadata));
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildDistanceMatrixParams(payload: DistanceMatrixRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set(
      'origins',
      payload.origins.map((origin) => this.formatCoordinate(origin)).join('|'),
    );
    params.set(
      'destinations',
      payload.destinations.map((destination) => this.formatCoordinate(destination)).join('|'),
    );
    if (!payload.basic) {
      params.set('mode', payload.mode ?? TravelMode.DRIVING);
    }
    params.set('route_preference', payload.routePreference ?? RoutePreference.FASTEST);
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildRouteOptimizerParams(payload: RouteOptimizerRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set(
      'locations',
      payload.locations.map((location) => this.formatCoordinate(location)).join('|'),
    );
    params.set('source', payload.source ?? 'first');
    params.set('destination', payload.destination ?? 'last');
    params.set('round_trip', String(payload.roundTrip ?? false));
    params.set('mode', payload.mode ?? TravelMode.DRIVING);
    params.set('steps', String(payload.steps ?? true));
    params.set('overview', payload.overview ?? 'full');
    params.set('language', payload.language ?? 'en');
    params.set('route_preference', payload.routePreference ?? RoutePreference.FASTEST);
    if (payload.trafficMetadata !== undefined) {
      params.set('traffic_metadata', String(payload.trafficMetadata));
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildFleetPlannerParams(payload: FleetPlannerRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('strategy', payload.strategy);
    params.set('route_preference', payload.routePreference ?? RoutePreference.FASTEST);
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildSnapToRoadParams(payload: SnapToRoadRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set(
      'points',
      payload.points.map((p) => this.formatCoordinate(p)).join('|'),
    );
    params.set('enhancePath', String(payload.enhancePath ?? false));
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildNearestRoadsParams(payload: NearestRoadsRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('mode', payload.mode ?? RoadMode.DRIVING);
    params.set(
      'points',
      payload.points.map((p) => this.formatCoordinate(p)).join('|'),
    );
    if (payload.radius !== undefined) {
      params.set('radius', String(payload.radius));
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildSpeedLimitsParams(payload: SpeedLimitsRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set(
      'points',
      payload.points.map((p) => this.formatCoordinate(p)).join('|'),
    );
    params.set('snapStrategy', payload.snapStrategy ?? SnapStrategy.SNAP_TO_ROAD);
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildAutocompleteParams(payload: PlacesAutocompleteRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('input', payload.input);
    if (payload.location) {
      params.set('location', this.formatCoordinate(payload.location));
    }
    if (payload.radius !== undefined) {
      params.set('radius', String(payload.radius));
    }
    if (payload.strictbounds !== undefined) {
      params.set('strictbounds', String(payload.strictbounds));
    }
    if (payload.language) {
      params.set('language', payload.language);
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildPlaceDetailsParams(
    payload: PlaceDetailsRequestDto | PlaceDetailsAdvancedRequestDto,
  ): URLSearchParams {
    const params = new URLSearchParams();
    params.set('place_id', payload.placeId);
    if (payload.language) {
      params.set('language', payload.language);
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildNearbySearchParams(
    payload: NearbySearchRequestDto | NearbySearchAdvancedRequestDto,
  ): URLSearchParams {
    const params = new URLSearchParams();
    params.set('location', this.formatCoordinate(payload.location));
    if (payload.types) {
      params.set('types', payload.types);
    }
    if (payload.language) {
      params.set('language', payload.language);
    }
    if (payload.radius !== undefined) {
      params.set('radius', String(payload.radius));
    }
    if (payload.withCentroid !== undefined) {
      params.set('withCentroid', String(payload.withCentroid));
    }
    params.set('rankBy', payload.rankBy ?? PlacesRankBy.POPULAR);
    if (payload.limit !== undefined) {
      params.set('limit', String(payload.limit));
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildTextSearchParams(payload: TextSearchRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('input', payload.input);
    if (payload.location) {
      params.set('location', this.formatCoordinate(payload.location));
    }
    if (payload.radius !== undefined) {
      params.set('radius', String(payload.radius));
    }
    if (payload.types) {
      params.set('types', payload.types);
    }
    if (payload.size !== undefined) {
      params.set('size', String(payload.size));
    }
    if (payload.language) {
      params.set('language', payload.language);
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildAddressValidationParams(payload: AddressValidationRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('address', payload.address);
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildPhotoParams(payload: PlacePhotoRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('photo_reference', payload.photoReference);
    if (payload.maxWidth !== undefined) {
      params.set('max_width', String(payload.maxWidth));
    }
    if (payload.maxHeight !== undefined) {
      params.set('max_height', String(payload.maxHeight));
    }
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildGeocodeParams(payload: GeocodeRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('address', payload.address);
    params.set('language', payload.language ?? 'English');
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildReverseGeocodeParams(payload: ReverseGeocodeRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('latlng', this.formatCoordinate(payload.latlng));
    params.set('language', payload.language ?? 'en');
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildGeofenceListParams(payload: GeofenceListRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('page', String(payload.page));
    params.set('size', String(payload.size));
    params.set('projectId', payload.projectId);
    params.set('api_key', this.apiKey);
    return params;
  }

  private buildGeofenceStatusParams(payload: GeofenceStatusRequestDto): URLSearchParams {
    const params = new URLSearchParams();
    params.set('geofenceId', payload.geofenceId);
    params.set('coordinates', this.formatCoordinate(payload.coordinates));
    params.set('api_key', this.apiKey);
    return params;
  }

  private formatCoordinate({ lat, lng }: CoordinateDto) {
    return `${lat},${lng}`;
  }

  private requestConfig() {
    return {
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (status: number) => status >= 200 && status < 300,
    };
  }
}

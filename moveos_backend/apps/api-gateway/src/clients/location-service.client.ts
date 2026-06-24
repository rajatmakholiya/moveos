import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';
import {
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
  AddressValidationRequestDto,
  ReverseGeocodeRequestDto,
  RouteOptimizerRequestDto,
  SnapToRoadRequestDto,
  SpeedLimitsRequestDto,
  TextSearchRequestDto,
} from '@common/location';

@Injectable()
export class LocationServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('LOCATION_SERVICE_URL') ?? 'http://localhost:3007/api';
  }

  directions(payload: DirectionsRequestDto) {
    return this.http.post(`${this.baseUrl}/location/directions`, payload);
  }

  distanceMatrix(payload: DistanceMatrixRequestDto) {
    return this.http.post(`${this.baseUrl}/location/distance-matrix`, payload);
  }

  routeOptimizer(payload: RouteOptimizerRequestDto) {
    return this.http.post(`${this.baseUrl}/location/route-optimizer`, payload);
  }

  fleetPlanner(payload: FleetPlannerRequestDto) {
    return this.http.post(`${this.baseUrl}/location/fleet-planner`, payload);
  }

  snapToRoad(payload: SnapToRoadRequestDto) {
    return this.http.post(`${this.baseUrl}/location/snap-to-road`, payload);
  }

  nearestRoads(payload: NearestRoadsRequestDto) {
    return this.http.post(`${this.baseUrl}/location/nearest-roads`, payload);
  }

  speedLimits(payload: SpeedLimitsRequestDto) {
    return this.http.post(`${this.baseUrl}/location/speed-limits`, payload);
  }

  placesAutocomplete(payload: PlacesAutocompleteRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/autocomplete`, payload);
  }

  placeDetails(payload: PlaceDetailsRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/details`, payload);
  }

  placeDetailsAdvanced(payload: PlaceDetailsAdvancedRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/details-advanced`, payload);
  }

  nearbySearch(payload: NearbySearchRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/nearby`, payload);
  }

  nearbySearchAdvanced(payload: NearbySearchAdvancedRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/nearby-advanced`, payload);
  }

  textSearch(payload: TextSearchRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/text-search`, payload);
  }

  addressValidation(payload: AddressValidationRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/address-validation`, payload);
  }

  placePhoto(payload: PlacePhotoRequestDto) {
    return this.http.post(`${this.baseUrl}/location/places/photo`, payload);
  }

  geocode(payload: GeocodeRequestDto) {
    return this.http.post(`${this.baseUrl}/location/geocode`, payload);
  }

  reverseGeocode(payload: ReverseGeocodeRequestDto) {
    return this.http.post(`${this.baseUrl}/location/reverse-geocode`, payload);
  }

  geoSearch(params: {
    q?: string;
    routeId?: string;
    intent?: 'pickup' | 'dropoff';
    currentLat?: number;
    currentLng?: number;
    originLat?: number;
    originLng?: number;
    destinationLat?: number;
    destinationLng?: number;
    searchRadiusKm?: number;
  }) {
    return this.http.get(`${this.baseUrl}/geo/search`, { params });
  }

  geoReverse(lat: number, lng: number) {
    return this.http.get(`${this.baseUrl}/geo/reverse`, { params: { lat, lng } });
  }

  createGeofence(payload: GeofenceCreateRequestDto) {
    return this.http.post(`${this.baseUrl}/location/geofence`, payload);
  }

  updateGeofence(id: string, payload: GeofenceUpdateRequestDto) {
    return this.http.put(`${this.baseUrl}/location/geofence/${id}`, payload);
  }

  getGeofence(id: string) {
    return this.http.get(`${this.baseUrl}/location/geofence/${id}`);
  }

  deleteGeofence(id: string) {
    return this.http.delete(`${this.baseUrl}/location/geofence/${id}`);
  }

  listGeofences(payload: GeofenceListRequestDto) {
    return this.http.post(`${this.baseUrl}/location/geofences`, payload);
  }

  geofenceStatus(payload: GeofenceStatusRequestDto) {
    return this.http.post(`${this.baseUrl}/location/geofence/status`, payload);
  }
}

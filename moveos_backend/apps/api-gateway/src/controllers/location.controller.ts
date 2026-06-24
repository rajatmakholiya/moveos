import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import {
  AddressValidationRequestDto,
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
  ReverseGeocodeRequestDto,
  RouteOptimizerRequestDto,
  SnapToRoadRequestDto,
  SpeedLimitsRequestDto,
  TextSearchRequestDto,
} from '@common/location';
import { LocationServiceClient } from '../clients/location-service.client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER', 'PASSENGER', 'ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
@Controller('location')
export class LocationController {
  constructor(private readonly locationClient: LocationServiceClient) {}

  @Post('directions')
  directions(@Body() body: DirectionsRequestDto) {
    return this.locationClient.directions(body);
  }

  @Post('distance-matrix')
  distanceMatrix(@Body() body: DistanceMatrixRequestDto) {
    return this.locationClient.distanceMatrix(body);
  }

  @Post('route-optimizer')
  routeOptimizer(@Body() body: RouteOptimizerRequestDto) {
    return this.locationClient.routeOptimizer(body);
  }

  @Post('fleet-planner')
  fleetPlanner(@Body() body: FleetPlannerRequestDto) {
    return this.locationClient.fleetPlanner(body);
  }

  @Post('snap-to-road')
  snapToRoad(@Body() body: SnapToRoadRequestDto) {
    return this.locationClient.snapToRoad(body);
  }

  @Post('nearest-roads')
  nearestRoads(@Body() body: NearestRoadsRequestDto) {
    return this.locationClient.nearestRoads(body);
  }

  @Post('speed-limits')
  speedLimits(@Body() body: SpeedLimitsRequestDto) {
    return this.locationClient.speedLimits(body);
  }

  @Post('places/autocomplete')
  placesAutocomplete(@Body() body: PlacesAutocompleteRequestDto) {
    return this.locationClient.placesAutocomplete(body);
  }

  @Post('places/details')
  placeDetails(@Body() body: PlaceDetailsRequestDto) {
    return this.locationClient.placeDetails(body);
  }

  @Post('places/details-advanced')
  placeDetailsAdvanced(@Body() body: PlaceDetailsAdvancedRequestDto) {
    return this.locationClient.placeDetailsAdvanced(body);
  }

  @Post('places/nearby')
  nearbySearch(@Body() body: NearbySearchRequestDto) {
    return this.locationClient.nearbySearch(body);
  }

  @Post('places/nearby-advanced')
  nearbySearchAdvanced(@Body() body: NearbySearchAdvancedRequestDto) {
    return this.locationClient.nearbySearchAdvanced(body);
  }

  @Post('places/text-search')
  textSearch(@Body() body: TextSearchRequestDto) {
    return this.locationClient.textSearch(body);
  }

  @Post('places/address-validation')
  addressValidation(@Body() body: AddressValidationRequestDto) {
    return this.locationClient.addressValidation(body);
  }

  @Post('places/photo')
  placePhoto(@Body() body: PlacePhotoRequestDto) {
    return this.locationClient.placePhoto(body);
  }

  @Post('geocode')
  geocode(@Body() body: GeocodeRequestDto) {
    return this.locationClient.geocode(body);
  }

  @Post('reverse-geocode')
  reverseGeocode(@Body() body: ReverseGeocodeRequestDto) {
    return this.locationClient.reverseGeocode(body);
  }

  @Post('geofence')
  createGeofence(@Body() body: GeofenceCreateRequestDto) {
    return this.locationClient.createGeofence(body);
  }

  @Put('geofence/:id')
  updateGeofence(@Param('id') id: string, @Body() body: GeofenceUpdateRequestDto) {
    return this.locationClient.updateGeofence(id, body);
  }

  @Get('geofence/:id')
  getGeofence(@Param('id') id: string) {
    return this.locationClient.getGeofence(id);
  }

  @Delete('geofence/:id')
  deleteGeofence(@Param('id') id: string) {
    return this.locationClient.deleteGeofence(id);
  }

  @Post('geofences')
  listGeofences(@Body() body: GeofenceListRequestDto) {
    return this.locationClient.listGeofences(body);
  }

  @Post('geofence/status')
  geofenceStatus(@Body() body: GeofenceStatusRequestDto) {
    return this.locationClient.geofenceStatus(body);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
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
import { LocationService } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('directions')
  directions(@Body() body: DirectionsRequestDto) {
    return this.locationService.directions(body);
  }

  @Post('distance-matrix')
  distanceMatrix(@Body() body: DistanceMatrixRequestDto) {
    return this.locationService.distanceMatrix(body);
  }

  @Post('route-optimizer')
  routeOptimizer(@Body() body: RouteOptimizerRequestDto) {
    return this.locationService.routeOptimizer(body);
  }

  @Post('fleet-planner')
  fleetPlanner(@Body() body: FleetPlannerRequestDto) {
    return this.locationService.fleetPlanner(body);
  }

  @Post('snap-to-road')
  snapToRoad(@Body() body: SnapToRoadRequestDto) {
    return this.locationService.snapToRoad(body);
  }

  @Post('nearest-roads')
  nearestRoads(@Body() body: NearestRoadsRequestDto) {
    return this.locationService.nearestRoads(body);
  }

  @Post('speed-limits')
  speedLimits(@Body() body: SpeedLimitsRequestDto) {
    return this.locationService.speedLimits(body);
  }

  @Post('places/autocomplete')
  placesAutocomplete(@Body() body: PlacesAutocompleteRequestDto) {
    return this.locationService.placesAutocomplete(body);
  }

  @Post('places/details')
  placeDetails(@Body() body: PlaceDetailsRequestDto) {
    return this.locationService.placeDetails(body);
  }

  @Post('places/details-advanced')
  placeDetailsAdvanced(@Body() body: PlaceDetailsAdvancedRequestDto) {
    return this.locationService.placeDetailsAdvanced(body);
  }

  @Post('places/nearby')
  nearbySearch(@Body() body: NearbySearchRequestDto) {
    return this.locationService.nearbySearch(body);
  }

  @Post('places/nearby-advanced')
  nearbySearchAdvanced(@Body() body: NearbySearchAdvancedRequestDto) {
    return this.locationService.nearbySearchAdvanced(body);
  }

  @Post('places/text-search')
  textSearch(@Body() body: TextSearchRequestDto) {
    return this.locationService.textSearch(body);
  }

  @Post('places/address-validation')
  addressValidation(@Body() body: AddressValidationRequestDto) {
    return this.locationService.addressValidation(body);
  }

  @Post('places/photo')
  placePhoto(@Body() body: PlacePhotoRequestDto) {
    return this.locationService.placePhoto(body);
  }

  @Post('geocode')
  geocode(@Body() body: GeocodeRequestDto) {
    return this.locationService.geocode(body);
  }

  @Post('reverse-geocode')
  reverseGeocode(@Body() body: ReverseGeocodeRequestDto) {
    return this.locationService.reverseGeocode(body);
  }

  @Post('geofence')
  createGeofence(@Body() body: GeofenceCreateRequestDto) {
    return this.locationService.createGeofence(body);
  }

  @Put('geofence/:id')
  updateGeofence(@Param('id') id: string, @Body() body: GeofenceUpdateRequestDto) {
    return this.locationService.updateGeofence(id, body);
  }

  @Get('geofence/:id')
  getGeofence(@Param('id') id: string) {
    return this.locationService.getGeofence(id);
  }

  @Delete('geofence/:id')
  deleteGeofence(@Param('id') id: string) {
    return this.locationService.deleteGeofence(id);
  }

  @Post('geofences')
  listGeofences(@Body() body: GeofenceListRequestDto) {
    return this.locationService.listGeofences(body);
  }

  @Post('geofence/status')
  geofenceStatus(@Body() body: GeofenceStatusRequestDto) {
    return this.locationService.geofenceStatus(body);
  }
}

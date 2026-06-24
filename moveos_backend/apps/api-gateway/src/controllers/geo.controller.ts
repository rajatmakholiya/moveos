import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LocationServiceClient } from '../clients/location-service.client';
import {
  DistanceMatrixRequestDto,
  GeocodeRequestDto,
  PlaceDetailsRequestDto,
  PlacesAutocompleteRequestDto,
} from '@common/location';

@Controller('geo')
export class GeoController {
  constructor(private readonly locationClient: LocationServiceClient) {}

  @Get('search')
  search(
    @Query('q') query?: string,
    @Query('routeId') routeId?: string,
    @Query('intent') intent?: 'pickup' | 'dropoff',
    @Query('currentLat') currentLat?: string,
    @Query('currentLng') currentLng?: string,
    @Query('originLat') originLat?: string,
    @Query('originLng') originLng?: string,
    @Query('destinationLat') destinationLat?: string,
    @Query('destinationLng') destinationLng?: string,
    @Query('searchRadiusKm') searchRadiusKm?: string,
  ) {
    return this.locationClient.geoSearch({
      q: query,
      routeId,
      intent,
      currentLat: this.readNumber(currentLat),
      currentLng: this.readNumber(currentLng),
      originLat: this.readNumber(originLat),
      originLng: this.readNumber(originLng),
      destinationLat: this.readNumber(destinationLat),
      destinationLng: this.readNumber(destinationLng),
      searchRadiusKm: this.readNumber(searchRadiusKm),
    });
  }

  @Get('reverse')
  reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.locationClient.geoReverse(Number(lat), Number(lng));
  }

  @Post('places/autocomplete')
  placesAutocomplete(@Body() body: PlacesAutocompleteRequestDto) {
    return this.locationClient.placesAutocomplete(body);
  }

  @Post('places/details')
  placeDetails(@Body() body: PlaceDetailsRequestDto) {
    return this.locationClient.placeDetails(body);
  }

  @Post('geocode')
  geocode(@Body() body: GeocodeRequestDto) {
    return this.locationClient.geocode(body);
  }

  @Post('distance-matrix')
  distanceMatrix(@Body() body: DistanceMatrixRequestDto) {
    return this.locationClient.distanceMatrix(body);
  }

  private readNumber(value?: string) {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

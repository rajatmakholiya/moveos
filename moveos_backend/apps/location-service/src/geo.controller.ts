import { Controller, Get, Query } from '@nestjs/common';
import { GeoService } from './geo.service';

function readNumber(value?: string) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPoint(lat?: string, lng?: string) {
  const parsedLat = readNumber(lat);
  const parsedLng = readNumber(lng);
  return parsedLat === undefined || parsedLng === undefined ? undefined : { lat: parsedLat, lng: parsedLng };
}

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

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
    return this.geoService.search(query, {
      routeId,
      intent,
      current: readPoint(currentLat, currentLng),
      origin: readPoint(originLat, originLng),
      destination: readPoint(destinationLat, destinationLng),
      searchRadiusKm: readNumber(searchRadiusKm),
    });
  }

  @Get('reverse')
  reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.geoService.reverse(Number(lat), Number(lng));
  }
}

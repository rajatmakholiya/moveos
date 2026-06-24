import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum TravelMode {
  DRIVING = 'driving',
  WALKING = 'walking',
  BIKE = 'bike',
  AUTO = 'auto',
}

export enum RoutePreference {
  FASTEST = 'fastest',
  SHORTEST = 'shortest',
}

export enum FleetStrategy {
  OPTIMAL = 'optimal',
  FAIR = 'fair',
}

export enum RoadMode {
  DRIVING = 'DRIVING',
  WALKING = 'WALKING',
  BICYCLING = 'BICYCLING',
  TRANSIT = 'TRANSIT',
}

export enum SnapStrategy {
  SNAP_TO_ROAD = 'snaptoroad',
  NEAREST_ROAD = 'nearestroad',
}

export enum PlacesRankBy {
  POPULAR = 'popular',
  DISTANCE = 'distance',
}

export enum GeofenceType {
  POLYGON = 'polygon',
  CIRCLE = 'circle',
}

export enum GeofenceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export type OverviewLevel = 'full' | 'simplified' | 'false';

export class CoordinateDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class DirectionsRequestDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  origin!: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  destination!: CoordinateDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints?: CoordinateDto[];

  @IsOptional()
  @IsEnum(TravelMode)
  mode: TravelMode = TravelMode.DRIVING;

  @IsOptional()
  @IsBoolean()
  alternatives = false;

  @IsOptional()
  @IsBoolean()
  steps = true;

  @IsOptional()
  @IsString()
  overview: OverviewLevel = 'full';

  @IsOptional()
  @IsString()
  language = 'en';

  @IsOptional()
  @IsBoolean()
  trafficMetadata = false;

  @IsOptional()
  @IsEnum(RoutePreference)
  routePreference: RoutePreference = RoutePreference.FASTEST;

  @IsOptional()
  @IsBoolean()
  basic = false;
}

export class DistanceMatrixRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  origins!: CoordinateDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  destinations!: CoordinateDto[];

  @IsOptional()
  @IsEnum(TravelMode)
  mode: TravelMode = TravelMode.DRIVING;

  @IsOptional()
  @IsEnum(RoutePreference)
  routePreference: RoutePreference = RoutePreference.FASTEST;

  @IsOptional()
  @IsBoolean()
  basic = false;
}

export class RouteOptimizerRequestDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  locations!: CoordinateDto[];

  @IsOptional()
  @IsIn(['first', 'any'])
  source: 'first' | 'any' = 'first';

  @IsOptional()
  @IsIn(['last', 'any'])
  destination: 'last' | 'any' = 'last';

  @IsOptional()
  @IsBoolean()
  roundTrip = false;

  @IsOptional()
  @IsEnum(TravelMode)
  mode: TravelMode = TravelMode.DRIVING;

  @IsOptional()
  @IsBoolean()
  steps = true;

  @IsOptional()
  @IsString()
  overview: OverviewLevel = 'full';

  @IsOptional()
  @IsString()
  language = 'en';

  @IsOptional()
  @IsBoolean()
  trafficMetadata = false;

  @IsOptional()
  @IsEnum(RoutePreference)
  routePreference: RoutePreference = RoutePreference.FASTEST;
}

export class FleetPlannerRequestDto {
  @IsString()
  @IsIn([FleetStrategy.OPTIMAL, FleetStrategy.FAIR])
  strategy!: FleetStrategy;

  @IsOptional()
  @IsEnum(RoutePreference)
  routePreference: RoutePreference = RoutePreference.FASTEST;

  @IsObject()
  input!: Record<string, any>;

  @IsOptional()
  @IsString()
  inputFilename?: string;
}

export class SnapToRoadRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  points!: CoordinateDto[];

  @IsOptional()
  @IsBoolean()
  enhancePath = false;
}

export class NearestRoadsRequestDto {
  @IsEnum(RoadMode)
  mode!: RoadMode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  points!: CoordinateDto[];

  @IsOptional()
  @IsNumber()
  radius?: number;
}

export class SpeedLimitsRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  points!: CoordinateDto[];

  @IsOptional()
  @IsEnum(SnapStrategy)
  snapStrategy: SnapStrategy = SnapStrategy.SNAP_TO_ROAD;
}

export class PlacesAutocompleteRequestDto {
  @IsString()
  input!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  location?: CoordinateDto;

  @IsOptional()
  @IsNumber()
  radius?: number;

  @IsOptional()
  @IsBoolean()
  strictbounds?: boolean;

  @IsOptional()
  @IsString()
  language: string = 'en';
}

export class PlaceDetailsRequestDto {
  @IsString()
  placeId!: string;

  @IsOptional()
  @IsString()
  language: string = 'en';
}

export class PlaceDetailsAdvancedRequestDto {
  @IsString()
  placeId!: string;

  @IsOptional()
  @IsString()
  language: string = 'en';
}

export class NearbySearchRequestDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  location!: CoordinateDto;

  @IsOptional()
  @IsString()
  types?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  radius: number = 10000;

  @IsOptional()
  @IsBoolean()
  withCentroid: boolean = false;

  @IsOptional()
  @IsEnum(PlacesRankBy)
  rankBy: PlacesRankBy = PlacesRankBy.POPULAR;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(50)
  limit = 5;
}

export class NearbySearchAdvancedRequestDto extends NearbySearchRequestDto {}

export class TextSearchRequestDto {
  @IsString()
  input!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  location?: CoordinateDto;

  @IsOptional()
  @IsNumber()
  radius: number = 5000;

  @IsOptional()
  @IsString()
  types?: string;

  @IsOptional()
  @IsNumber()
  size: number = 5;

  @IsOptional()
  @IsString()
  language: string = 'en';
}

export class AddressValidationRequestDto {
  @IsString()
  address!: string;
}

export class PlacePhotoRequestDto {
  @IsString()
  photoReference!: string;

  @IsOptional()
  @IsNumber()
  maxWidth?: number;

  @IsOptional()
  @IsNumber()
  maxHeight?: number;
}

export class GeocodeRequestDto {
  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  language: string = 'English';
}

export class ReverseGeocodeRequestDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  latlng!: CoordinateDto;

  @IsOptional()
  @IsString()
  language: string = 'en';
}

export class GeofenceCreateRequestDto {
  @IsString()
  name!: string;

  @IsEnum(GeofenceType)
  type!: GeofenceType;

  @IsEnum(GeofenceStatus)
  status: GeofenceStatus = GeofenceStatus.ACTIVE;

  @IsString()
  projectId!: string;

  @IsArray()
  @ArrayMinSize(1)
  coordinates!: [number, number][];

  @IsOptional()
  @IsNumber()
  radius?: number;
}

export class GeofenceUpdateRequestDto extends GeofenceCreateRequestDto {}

export class GeofenceListRequestDto {
  @IsNumber()
  page!: number;

  @IsNumber()
  size!: number;

  @IsString()
  projectId!: string;
}

export class GeofenceStatusRequestDto {
  @IsString()
  geofenceId!: string;

  @ValidateNested()
  @Type(() => CoordinateDto)
  coordinates!: CoordinateDto;
}

import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdminRouteDto {
  @IsString()
  @IsNotEmpty()
  fromCity!: string;

  @IsString()
  @IsNotEmpty()
  toCity!: string;

  @IsString()
  @IsNotEmpty()
  routeName!: string;

  @IsInt()
  @Min(1)
  distanceKm!: number;

  @IsInt()
  @Min(0)
  baseFarePaise!: number;

  @IsInt()
  @Min(1)
  estimatedDurationMinutes!: number;

  @IsOptional()
  metadataJson?: Record<string, unknown>;
}

export class UpdateAdminRouteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fromCity?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  toCity?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  routeName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  distanceKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  baseFarePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  @IsOptional()
  metadataJson?: Record<string, unknown> | null;
}

export class UpdateAdminRouteStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

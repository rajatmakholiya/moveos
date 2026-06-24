import { IsString, IsISO8601, IsInt, IsNotEmpty, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTripDto {
  @IsString()
  routeId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsISO8601()
  departureAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  frontSeatsTotal!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  backSeatsTotal!: number;

  @IsString()
  departurePoint!: string;

  @IsOptional()
  @IsString()
  luggagePolicy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

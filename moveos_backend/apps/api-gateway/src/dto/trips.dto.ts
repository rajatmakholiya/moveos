import { IsISO8601, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AvailableTripsGatewayDto {
  @IsString()
  routeId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsIn(['FRONT', 'BACK'])
  seatType?: string;
}

export class CreateTripGatewayDto {
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

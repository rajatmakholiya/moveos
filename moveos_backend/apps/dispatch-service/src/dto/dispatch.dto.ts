import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class RideDecisionDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

export class CreateTransportRequestDto {
  @IsOptional()
  @IsIn(['SEAT', 'FULL_VEHICLE', 'PARCEL'])
  type?: 'SEAT' | 'FULL_VEHICLE' | 'PARCEL';

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  pickup?: Record<string, unknown>;

  @IsOptional()
  dropoff?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  requestedFor?: string;

  @IsOptional()
  @IsString()
  passengerName?: string;

  @IsOptional()
  @IsString()
  passengerPhone?: string;

  @IsOptional()
  @IsString()
  passengerId?: string;

  @IsOptional()
  @IsNumber()
  seats?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  parcelDetails?: string;

  @IsOptional()
  @IsNumber()
  budgetPaise?: number;
}

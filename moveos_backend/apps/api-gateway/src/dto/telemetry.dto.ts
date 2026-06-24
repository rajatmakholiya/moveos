import { IsNumber, IsOptional, IsString } from 'class-validator';

export class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class HeartbeatDto {
  @IsString()
  driverId!: string;
}

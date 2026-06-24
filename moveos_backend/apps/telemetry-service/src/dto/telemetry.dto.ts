import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class TelemetryDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class HeartbeatDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

import { IsNotEmpty, IsString } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;
}

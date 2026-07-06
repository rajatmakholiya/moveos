import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  passengerId?: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}

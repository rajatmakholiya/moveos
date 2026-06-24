import { IsNotEmpty, IsString } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

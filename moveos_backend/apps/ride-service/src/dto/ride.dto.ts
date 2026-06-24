import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class RideActionDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

export class RideStartDto extends RideActionDto {
  @IsString()
  @Length(4, 6)
  riderOtp!: string;
}

export class RideCancelDto extends RideActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

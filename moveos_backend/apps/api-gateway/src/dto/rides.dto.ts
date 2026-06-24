import { IsOptional, IsString, Length } from 'class-validator';

export class RiderOtpDto {
  @IsString()
  @Length(4, 6)
  riderOtp!: string;
}

export class RideCancelDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

import { IsPhoneNumber, IsString, Length } from 'class-validator';

export class OtpRequestDto {
  @IsPhoneNumber()
  phone!: string;
}

export class OtpVerifyDto {
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  @Length(4, 6)
  otp!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

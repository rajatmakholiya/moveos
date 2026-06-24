import { IsString, Length } from 'class-validator';

export class VerifyPickupOtpDto {
  @IsString()
  @Length(6, 6)
  otp!: string;
}

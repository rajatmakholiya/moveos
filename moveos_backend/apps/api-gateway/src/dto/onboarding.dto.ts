import { IsBoolean, IsEnum, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsBoolean()
  resend?: boolean;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class ConsentsDto {
  @IsIn(['granted', 'denied', 'limited'])
  locationPermission!: 'granted' | 'denied' | 'limited';

  @IsBoolean()
  notificationsOptIn!: boolean;

  @IsBoolean()
  marketingOptIn!: boolean;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsISO8601()
  timestampOverride?: string;
}

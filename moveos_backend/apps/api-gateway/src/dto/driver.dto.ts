import { IsBoolean, IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { KycDocumentType } from '@prisma/client';

export class DocumentUploadRequestDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export class DriverDocumentDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsUrl({ require_protocol: true })
  @IsNotEmpty()
  url!: string;
}

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  plate!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;
}

export class ActivateVehicleDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;
}

export class VehicleDocumentDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsUrl({ require_protocol: true })
  @IsNotEmpty()
  url!: string;
}

export class SubmitDriverKycDto {
  @IsEnum(KycDocumentType)
  documentType!: KycDocumentType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  documentUrl?: string;

  @IsOptional()
  @IsString()
  fileUuid?: string;

  @IsOptional()
  @IsString()
  documentNo?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  metadataJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  @IsOptional()
  @IsString()
  consentText?: string;
}

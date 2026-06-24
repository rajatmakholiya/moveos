import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AssignmentStatus,
  ComplianceStatus,
  DocumentStatus,
  DriverStatus,
  KycDocumentType,
  KycStatus,
  OrgPlanTier,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  OrganizationStatus,
  VehicleOwnershipType,
  VehicleDocumentStatus,
  VehicleStatus,
} from '@prisma/client';

export class OrganizationOnboardingSessionDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsString()
  @IsPhoneNumber()
  ownerPhone!: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}

export class OrganizationBusinessDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  registrationNo?: string;

  @IsOptional()
  addressJson?: Record<string, unknown>;

  @IsOptional()
  operatingRegions?: unknown[];
}

export class OrganizationDocumentDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  documentNo?: string;
}

export class VehicleDocumentUploadDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  url?: string;

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
}

export class UpdateOrganizationStatusDto {
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateOrganizationInvitationDto {
  @IsString()
  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  role?: OrganizationMemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class SendInviteOtpDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class VerifyInviteOtpDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}

export class CancelDriverInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateOrganizationVehicleDto {
  @IsOptional()
  @IsString()
  vehicleNumber!: string;

  @IsOptional()
  @IsString()
  vehicleType!: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  variant?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  manufacturingYear?: number;

  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  @IsOptional()
  @IsString()
  registrationState?: string;

  @IsOptional()
  @IsString()
  chassisNumber?: string;

  @IsOptional()
  @IsString()
  engineNumber?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsInt()
  @Min(1)
  totalSeats!: number;

  @IsInt()
  @Min(0)
  frontSeats!: number;

  @IsInt()
  @Min(0)
  backSeats!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  luggageCapacityKg?: number;

  @IsOptional()
  @IsEnum(VehicleOwnershipType)
  ownershipType?: VehicleOwnershipType;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsPhoneNumber()
  ownerPhone?: string;

  @IsOptional()
  @IsString()
  ownerAddress?: string;

  @IsOptional()
  @IsString()
  commercialPermitNumber?: string;

  @IsOptional()
  @IsISO8601()
  permitValidFrom?: string;

  @IsOptional()
  @IsISO8601()
  permitValidTill?: string;

  @IsOptional()
  @IsString()
  fitnessCertificateNumber?: string;

  @IsOptional()
  @IsISO8601()
  fitnessValidTill?: string;

  @IsOptional()
  @IsString()
  pollutionCertificateNumber?: string;

  @IsOptional()
  @IsISO8601()
  pollutionValidTill?: string;

  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @IsOptional()
  @IsISO8601()
  insuranceValidTill?: string;
}

export class UpdateOrganizationVehicleDto {
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  variant?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  manufacturingYear?: number;

  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  @IsOptional()
  @IsString()
  registrationState?: string;

  @IsOptional()
  @IsString()
  chassisNumber?: string;

  @IsOptional()
  @IsString()
  engineNumber?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  frontSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  backSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  luggageCapacityKg?: number;

  @IsOptional()
  @IsEnum(VehicleOwnershipType)
  ownershipType?: VehicleOwnershipType;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsPhoneNumber()
  ownerPhone?: string;

  @IsOptional()
  @IsString()
  ownerAddress?: string;

  @IsOptional()
  @IsString()
  commercialPermitNumber?: string;

  @IsOptional()
  @IsISO8601()
  permitValidFrom?: string;

  @IsOptional()
  @IsISO8601()
  permitValidTill?: string;

  @IsOptional()
  @IsString()
  fitnessCertificateNumber?: string;

  @IsOptional()
  @IsISO8601()
  fitnessValidTill?: string;

  @IsOptional()
  @IsString()
  pollutionCertificateNumber?: string;

  @IsOptional()
  @IsISO8601()
  pollutionValidTill?: string;

  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @IsOptional()
  @IsISO8601()
  insuranceValidTill?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(VehicleDocumentStatus)
  documentStatus?: VehicleDocumentStatus;

  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @IsOptional()
  @IsEnum(ComplianceStatus)
  complianceStatus?: ComplianceStatus;
}

export class SubmitVehicleKycDto {
  @IsOptional()
  metadataJson?: Record<string, unknown>;
}

export class AssignVehicleDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

export class CreateOrganizationDriverDto {
  @IsString()
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateOrganizationDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @IsOptional()
  @IsEnum(ComplianceStatus)
  complianceStatus?: ComplianceStatus;
}

export class CreateOrganizationScheduledTripDto {
  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsISO8601()
  departureAt!: string;

  @IsString()
  @IsNotEmpty()
  departurePoint!: string;

  @IsOptional()
  frontSeatsTotal?: number;

  @IsOptional()
  backSeatsTotal?: number;

  @IsOptional()
  @IsString()
  luggagePolicy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrganizationAssignmentDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  policy?: 'PERMANENT' | 'SHARED' | 'SHIFT' | 'TEMPORARY';

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateOrganizationAssignmentDto {
  @IsEnum(AssignmentStatus)
  status!: AssignmentStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateOrganizationDetailsDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationNo?: string;

  @IsOptional()
  @IsString()
  primaryPhone?: string;

  @IsOptional()
  @IsEmail()
  primaryEmail?: string;

  @IsOptional()
  addressJson?: Record<string, unknown>;

  @IsOptional()
  operatingRegions?: unknown[];

  @IsOptional()
  @IsEnum(OrgPlanTier)
  planTier?: OrgPlanTier;
}

export class UpdateMemberRoleDto {
  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  role?: OrganizationMemberRole;

  @IsOptional()
  @IsEnum(OrganizationMemberStatus)
  status?: OrganizationMemberStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SubmitKycDto {
  @IsEnum(KycDocumentType)
  documentType!: KycDocumentType;

  @IsString()
  @IsNotEmpty()
  documentUrl!: string;

  @IsOptional()
  @IsString()
  documentNo?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  metadataJson?: Record<string, unknown>;
}

export class ReviewKycDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ReviewDocumentDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  rejectionNote?: string;
}

export class UpdateDocumentDetailsDto {
  @IsOptional()
  @IsString()
  documentNo?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class ApproveDriverComplianceDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'REMOVED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateAdminOrganizationDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsString()
  @IsPhoneNumber()
  ownerPhone!: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationNo?: string;

  @IsOptional()
  @IsEnum(OrgPlanTier)
  planTier?: OrgPlanTier;
}

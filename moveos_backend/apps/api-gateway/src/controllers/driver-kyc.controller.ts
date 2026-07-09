import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  KYC_PROVIDER,
  KycProvider,
  PrismaService,
  RedisService,
  Roles,
  RolesGuard,
} from '@common/index';
import { DocumentStatus, KycDocumentType, KycEntityType, KycStatus } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

class AadhaarOtpDto {
  @IsString()
  @Matches(/^\d{12}$/, { message: 'aadhaarNumber must be 12 digits' })
  aadhaarNumber!: string;
}

class AadhaarVerifyDto {
  @IsString()
  @IsNotEmpty()
  otp!: string;
}

class DlVerifyDto {
  @IsString()
  @IsNotEmpty()
  dlNumber!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dob must be YYYY-MM-DD' })
  dob!: string;
}

class RcVerifyDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;
}

class FaceMatchDto {
  @IsString()
  @IsNotEmpty()
  selfieBase64!: string;
}

const AADHAAR_REF_TTL_SECONDS = 10 * 60;

/**
 * Provider-backed KYC verification (Aadhaar OKYC, DL/RTO, RC/Vahan, face
 * match). A successful provider verification auto-approves the corresponding
 * KycRecord — the manual super-admin review queue remains the fallback for
 * NEEDS_REVIEW outcomes and org-level activation.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('driver/kyc')
export class DriverKycController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(KYC_PROVIDER) private readonly kyc: KycProvider,
  ) {}

  // ─── GET /driver/kyc/status ────────────────────────────────────────────────

  @Get('status')
  async getStatus(@Req() req: any) {
    const driverId = this.requireDriverId(req);
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const records = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
      orderBy: { createdAt: 'desc' },
    });
    const byType = new Map(records.map((r) => [r.documentType, r] as const));
    const aadhaar = byType.get(KycDocumentType.AADHAAR);
    const dl = byType.get(KycDocumentType.DRIVING_LICENSE);

    return {
      status: 'ok',
      data: {
        driverId,
        kycStatus: driver.kycStatus,
        providerVerification: this.kyc.performsRealVerification ? 'live' : 'dev',
        aadhaar: {
          status: aadhaar?.status ?? 'NOT_SUBMITTED',
          verifiedAt: aadhaar?.reviewedAt ?? null,
        },
        drivingLicense: {
          status: dl?.status ?? 'NOT_SUBMITTED',
          documentNo: dl?.documentNo ?? null,
          expiresAt: dl?.expiresAt ?? null,
          verifiedAt: dl?.reviewedAt ?? null,
        },
        faceMatch: {
          score: (aadhaar?.metadataJson as Record<string, unknown> | null)?.faceMatchScore ?? null,
        },
      },
    };
  }

  // ─── POST /driver/kyc/aadhaar/otp ─────────────────────────────────────────

  @Post('aadhaar/otp')
  async requestAadhaarOtp(@Req() req: any, @Body() body: AadhaarOtpDto) {
    const driverId = this.requireDriverId(req);
    const result = await this.kyc.aadhaarGenerateOtp(body.aadhaarNumber);
    if (!result.success || !result.referenceId) {
      throw new BadRequestException({
        message: 'Could not start Aadhaar verification. Check the number and try again.',
        error_code: 'aadhaar_otp_failed',
        details: result.error,
      });
    }
    await this.redis.getClient().set(
      `kyc:aadhaar:ref:${driverId}`,
      JSON.stringify({ referenceId: result.referenceId, last4: body.aadhaarNumber.slice(-4) }),
      'EX',
      AADHAAR_REF_TTL_SECONDS,
    );
    return {
      status: 'ok',
      data: {
        otpSent: true,
        expiresInSeconds: AADHAAR_REF_TTL_SECONDS,
        // dev provider always uses OTP 123456 — surfaced so local flows work
        devHint: this.kyc.performsRealVerification ? undefined : 'Use OTP 123456 (dev KYC provider)',
      },
    };
  }

  // ─── POST /driver/kyc/aadhaar/verify ──────────────────────────────────────

  @Post('aadhaar/verify')
  async verifyAadhaarOtp(@Req() req: any, @Body() body: AadhaarVerifyDto) {
    const driverId = this.requireDriverId(req);
    const raw = await this.redis.getClient().get(`kyc:aadhaar:ref:${driverId}`);
    if (!raw) {
      throw new BadRequestException({
        message: 'Aadhaar OTP session expired. Request a new OTP.',
        error_code: 'aadhaar_session_expired',
      });
    }
    const { referenceId, last4 } = JSON.parse(raw) as { referenceId: string; last4: string };
    const result = await this.kyc.aadhaarVerifyOtp(referenceId, body.otp);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Aadhaar verification failed. Check the OTP and try again.',
        error_code: 'aadhaar_verify_failed',
        details: result.error,
      });
    }
    await this.redis.getClient().del(`kyc:aadhaar:ref:${driverId}`);

    const record = await this.upsertVerifiedRecord(driverId, KycDocumentType.AADHAAR, {
      documentUrl: 'urn:moveos:kyc:aadhaar:okyc',
      documentNo: `XXXX-XXXX-${last4}`,
      status: DocumentStatus.APPROVED,
      metadataJson: {
        provider: result.provider,
        providerRef: result.providerRef,
        holderName: result.holder?.name,
        holderDob: result.holder?.dob,
        holderGender: result.holder?.gender,
        // Aadhaar photo kept for face-match; stripped from API responses
        holderPhotoBase64: result.holder?.photoBase64,
        verifiedVia: 'aadhaar_okyc',
      },
    });

    return {
      status: 'ok',
      data: {
        verified: true,
        recordId: record.id,
        holderName: result.holder?.name ?? null,
        nextStep: 'VERIFY_DRIVING_LICENSE',
      },
    };
  }

  // ─── POST /driver/kyc/dl/verify ───────────────────────────────────────────

  @Post('dl/verify')
  async verifyDrivingLicense(@Req() req: any, @Body() body: DlVerifyDto) {
    const driverId = this.requireDriverId(req);
    const result = await this.kyc.verifyDrivingLicense(body.dlNumber, body.dob);

    if (result.status === 'FAILED') {
      throw new BadRequestException({
        message: 'Driving license could not be verified against the RTO registry.',
        error_code: 'dl_verify_failed',
        details: result.error,
      });
    }

    const verified = result.status === 'VERIFIED';
    const expiresAt = result.license?.expiryDate ? new Date(result.license.expiryDate) : null;
    if (verified && expiresAt && expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'This driving license has expired.',
        error_code: 'driving_license_expired',
      });
    }

    const record = await this.upsertVerifiedRecord(driverId, KycDocumentType.DRIVING_LICENSE, {
      documentUrl: 'urn:moveos:kyc:dl:rto',
      documentNo: result.license?.dlNumber ?? body.dlNumber,
      status: verified ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
      expiresAt,
      metadataJson: {
        provider: result.provider,
        providerRef: result.providerRef,
        holderName: result.license?.holderName,
        vehicleClasses: result.license?.vehicleClasses,
        verifiedVia: 'rto_registry',
      },
    });

    // RTO-verified DL is the mandatory KYC document — auto-approve the driver.
    if (verified) {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { kycStatus: KycStatus.APPROVED },
      });
    }

    return {
      status: 'ok',
      data: {
        verified,
        needsManualReview: !verified,
        recordId: record.id,
        holderName: result.license?.holderName ?? null,
        expiresAt,
        kycStatus: verified ? KycStatus.APPROVED : undefined,
        nextStep: verified ? 'REGISTER_VEHICLE' : 'AWAIT_MANUAL_REVIEW',
      },
    };
  }

  // ─── POST /driver/kyc/rc/verify ───────────────────────────────────────────

  @Post('rc/verify')
  async verifyVehicleRc(@Req() req: any, @Body() body: RcVerifyDto) {
    const driverId = this.requireDriverId(req);
    const assignment = body.vehicleId
      ? await this.prisma.driverVehicleAssignment.findUnique({
          where: { driverId_vehicleId: { driverId, vehicleId: body.vehicleId } },
          include: { vehicle: true },
        })
      : await this.prisma.driverVehicleAssignment.findFirst({
          where: { driverId },
          orderBy: { id: 'desc' },
          include: { vehicle: true },
        });
    if (!assignment) {
      throw new ForbiddenException({ message: 'Vehicle is not assigned to this driver', error_code: 'vehicle_assignment_required' });
    }
    const vehicle = assignment.vehicle;

    const result = await this.kyc.verifyVehicleRc(vehicle.plate);
    if (result.status === 'FAILED') {
      throw new BadRequestException({
        message: 'Vehicle registration could not be verified against the Vahan registry.',
        error_code: 'rc_verify_failed',
        details: result.error,
      });
    }
    const verified = result.status === 'VERIFIED';

    // Sync registry-sourced validity dates onto the vehicle so expiry gates use them.
    if (verified && result.rc) {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          ...(result.rc.ownerName ? { ownerName: result.rc.ownerName } : {}),
          ...(result.rc.registrationDate ? { registrationDate: new Date(result.rc.registrationDate) } : {}),
          ...(result.rc.fitnessUpto ? { fitnessValidTill: new Date(result.rc.fitnessUpto) } : {}),
          ...(result.rc.insuranceUpto ? { insuranceValidTill: new Date(result.rc.insuranceUpto) } : {}),
        },
      });
    }

    const record = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.VEHICLE,
        entityId: vehicle.id,
        documentType: KycDocumentType.VEHICLE_REGISTRATION,
        documentUrl: 'urn:moveos:kyc:rc:vahan',
        documentNo: vehicle.plate,
        status: verified ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
        reviewedAt: verified ? new Date() : null,
        metadataJson: {
          provider: result.provider,
          providerRef: result.providerRef,
          rc: result.rc as any,
          verifiedVia: 'vahan_registry',
        } as any,
      },
    });

    return {
      status: 'ok',
      data: {
        verified,
        needsManualReview: !verified,
        recordId: record.id,
        vehicleId: vehicle.id,
        ownerName: result.rc?.ownerName ?? null,
        insuranceUpto: result.rc?.insuranceUpto ?? null,
        fitnessUpto: result.rc?.fitnessUpto ?? null,
      },
    };
  }

  // ─── POST /driver/kyc/face-match ──────────────────────────────────────────

  @Post('face-match')
  async faceMatch(@Req() req: any, @Body() body: FaceMatchDto) {
    const driverId = this.requireDriverId(req);
    const aadhaar = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId, documentType: KycDocumentType.AADHAAR },
      orderBy: { createdAt: 'desc' },
    });
    const referencePhoto = (aadhaar?.metadataJson as Record<string, unknown> | null)?.holderPhotoBase64 as string | undefined;
    if (!referencePhoto) {
      throw new BadRequestException({
        message: 'Verify your Aadhaar first — the face match compares your selfie with your Aadhaar photo.',
        error_code: 'aadhaar_photo_missing',
      });
    }

    const result = await this.kyc.faceMatch(body.selfieBase64, referencePhoto);
    if (aadhaar) {
      await this.prisma.kycRecord.update({
        where: { id: aadhaar.id },
        data: {
          metadataJson: {
            ...(aadhaar.metadataJson as Record<string, unknown>),
            faceMatchScore: result.matchScore ?? null,
            faceMatchStatus: result.status,
            faceMatchedAt: new Date().toISOString(),
          } as any,
        },
      });
    }

    if (result.status === 'FAILED') {
      throw new BadRequestException({
        message: 'Face match failed. Retake the selfie in good light.',
        error_code: 'face_match_failed',
        details: result.error,
      });
    }

    return {
      status: 'ok',
      data: {
        matched: result.status === 'VERIFIED',
        needsManualReview: result.status === 'NEEDS_REVIEW',
        matchScore: result.matchScore ?? null,
      },
    };
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private requireDriverId(req: any): string {
    const driverId = req.user?.driverId;
    if (!driverId) {
      throw new ForbiddenException({ message: 'Driver JWT required', error_code: 'driver_jwt_required' });
    }
    return driverId;
  }

  /** Create-or-refresh the latest KycRecord of a type for this driver. */
  private async upsertVerifiedRecord(
    driverId: string,
    documentType: KycDocumentType,
    data: {
      documentUrl: string;
      documentNo: string;
      status: DocumentStatus;
      expiresAt?: Date | null;
      metadataJson: Record<string, unknown>;
    },
  ) {
    const existing = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId, documentType },
      orderBy: { createdAt: 'desc' },
    });
    const payload = {
      documentUrl: data.documentUrl,
      documentNo: data.documentNo,
      status: data.status,
      expiresAt: data.expiresAt ?? null,
      reviewedAt: data.status === DocumentStatus.APPROVED ? new Date() : null,
      rejectionReason: null,
      metadataJson: data.metadataJson as any,
    };
    if (existing) {
      return this.prisma.kycRecord.update({ where: { id: existing.id }, data: payload });
    }
    return this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.DRIVER,
        entityId: driverId,
        documentType,
        ...payload,
      },
    });
  }
}

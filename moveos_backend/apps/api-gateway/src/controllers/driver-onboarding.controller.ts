import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService } from '@common/index';
import { AssignmentStatus, DocumentStatus, KycDocumentType, KycEntityType, KycStatus, OrganizationDriverStatus } from '@prisma/client';
import { RegisterIndependentVehicleDto, UpdateDriverProfileDto, UpsertDriverDocumentDto } from '../dto/driver-onboarding.dto';

const MANDATORY_PROFILE_FIELDS = [
  'name',
  'dob',
  'gender',
  'currentAddressJson',
  'permanentAddressJson',
  'emergencyContactName',
  'emergencyContactPhone',
  'profilePhotoFileId',
] as const;

const BASE_MANDATORY_DOCUMENT_TYPES: KycDocumentType[] = [KycDocumentType.DRIVING_LICENSE];

@Controller('driver/onboarding')
export class DriverOnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /driver/onboarding/me ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getOnboardingState(@Req() req: any) {
    const { driverId, sub: userId } = this.requireDriverJwt(req);

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { phone: true, email: true } } },
    });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findFirst({
      where: { driverId, status: { in: [OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE, OrganizationDriverStatus.PENDING_COMPLIANCE, OrganizationDriverStatus.ACTIVE] } },
      include: { organization: { select: { id: true, legalName: true, tradeName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
    });

    const missingRequiredFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.profileFieldFilled(driver, f));
    const missingRequiredDocuments = this.missingRequiredDocumentTypes(driver, docs);

    // For independent drivers, check if a vehicle is registered
    const independentVehicle = !orgDriver
      ? await this.prisma.driverVehicleAssignment.findFirst({
          where: { driverId, status: { in: [AssignmentStatus.PENDING_COMPLIANCE, AssignmentStatus.ACTIVE] } },
          include: { vehicle: true },
          orderBy: { id: 'desc' },
        })
      : null;

    const nextStep = this.resolveNextStep(orgDriver?.status ?? null, missingRequiredFields, missingRequiredDocuments, {
      kycStatus: driver.kycStatus,
      hasVehicle: !!independentVehicle,
      submittedAt: driver.independentSubmittedAt,
    });

    return {
      status: 'ok',
      data: {
        driverId: driver.id,
        userId,
        organizationDriverId: orgDriver?.id ?? null,
        organizationId: orgDriver?.organization?.id ?? null,
        organizationName: orgDriver?.organization?.tradeName ?? orgDriver?.organization?.legalName ?? null,
        status: orgDriver?.status ?? null,
        isIndependent: !orgDriver,
        independentVehicle: independentVehicle ?? null,
        profile: {
          fullName: driver.name,
          phone: driver.user.phone,
          email: driver.user.email ?? null,
          dob: driver.dob?.toISOString().split('T')[0] ?? null,
          gender: driver.gender ?? null,
          alternatePhone: driver.alternatePhone ?? null,
          currentAddress: driver.currentAddressJson ?? null,
          permanentAddress: driver.permanentAddressJson ?? null,
          emergencyContactName: driver.emergencyContactName ?? null,
          emergencyContactPhone: driver.emergencyContactPhone ?? null,
          bloodGroup: driver.bloodGroup ?? null,
          preferredLanguage: driver.preferredLanguage ?? null,
          profilePhotoFileId: driver.profilePhotoFileId ?? null,
        },
        documents: docs.map((d) => this.safeDocument(d)),
        missingRequiredFields,
        missingRequiredDocuments,
        nextStep,
      },
    };
  }

  // ─── PUT /driver/onboarding/profile ───────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req: any, @Body() body: UpdateDriverProfileDto) {
    const { driverId } = this.requireDriverJwt(req);

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const permanentAddressJson = body.sameAsCurrentAddress
      ? (body.currentAddress ?? driver.currentAddressJson)
      : (body.permanentAddress ?? driver.permanentAddressJson ?? undefined);

    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        ...(body.fullName ? { name: body.fullName } : {}),
        ...(body.dob !== undefined ? { dob: new Date(body.dob) } : {}),
        ...(body.gender !== undefined ? { gender: body.gender } : {}),
        ...(body.alternatePhone !== undefined ? { alternatePhone: body.alternatePhone } : {}),
        ...(body.currentAddress !== undefined ? { currentAddressJson: body.currentAddress as any } : {}),
        ...(permanentAddressJson !== undefined ? { permanentAddressJson: permanentAddressJson as any } : {}),
        ...(body.emergencyContactName !== undefined ? { emergencyContactName: body.emergencyContactName } : {}),
        ...(body.emergencyContactPhone !== undefined ? { emergencyContactPhone: body.emergencyContactPhone } : {}),
        ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
        ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
        ...(body.profilePhotoFileId !== undefined ? { profilePhotoFileId: body.profilePhotoFileId } : {}),
      },
      include: { user: { select: { phone: true, email: true } } },
    });

    if (body.email !== undefined) {
      await this.prisma.user.update({ where: { id: updated.userId }, data: { email: body.email } });
    }

    const filledCount = MANDATORY_PROFILE_FIELDS.filter((f) => this.profileFieldFilled(updated, f)).length;
    const completionPct = Math.round((filledCount / MANDATORY_PROFILE_FIELDS.length) * 100);

    return {
      status: 'ok',
      data: {
        driverId: updated.id,
        profile: {
          fullName: updated.name,
          phone: updated.user.phone,
          dob: updated.dob?.toISOString().split('T')[0] ?? null,
          gender: updated.gender ?? null,
          currentAddress: updated.currentAddressJson ?? null,
          permanentAddress: updated.permanentAddressJson ?? null,
          emergencyContactName: updated.emergencyContactName ?? null,
          emergencyContactPhone: updated.emergencyContactPhone ?? null,
          bloodGroup: updated.bloodGroup ?? null,
          preferredLanguage: updated.preferredLanguage ?? null,
          profilePhotoFileId: updated.profilePhotoFileId ?? null,
        },
        completionPercent: completionPct,
      },
    };
  }

  // ─── POST /driver/onboarding/documents ────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('documents')
  async upsertDocument(@Req() req: any, @Body() body: UpsertDriverDocumentDto) {
    const { driverId } = this.requireDriverJwt(req);

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const primaryFileUrl = body.frontFileId ?? body.fileId ?? null;
    this.validateDocumentPayload(body, primaryFileUrl);

    const metadata: Record<string, unknown> = {};
    if (body.frontFileId) metadata.frontFileId = body.frontFileId;
    if (body.backFileId) metadata.backFileId = body.backFileId;
    if (body.issueDate) metadata.issueDate = body.issueDate;
    if (body.issuingAuthority) metadata.issuingAuthority = body.issuingAuthority;
    if (body.accountHolderName) metadata.accountHolderName = body.accountHolderName;
    if (body.bankName) metadata.bankName = body.bankName;
    if (body.accountNumber) metadata.accountNumber = this.maskAccountNumber(body.accountNumber);
    if (body.ifscCode) metadata.ifscCode = body.ifscCode;

    const existing = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId, documentType: body.documentType },
    });

    if (existing) {
      throw new BadRequestException({
        message: 'This document has already been submitted and cannot be submitted again',
        error_code: 'document_already_submitted',
      });
    }

    const doc = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.DRIVER,
        entityId: driverId,
        documentType: body.documentType,
        documentUrl: primaryFileUrl ?? '',
        documentNo: body.documentNumber ?? null,
        expiresAt: body.expiryDate ? new Date(body.expiryDate) : null,
        status: DocumentStatus.PENDING,
        metadataJson: Object.keys(metadata).length ? (metadata as any) : undefined,
      },
    });

    return { status: 'ok', data: { document: this.safeDocument(doc) } };
  }

  // ─── GET /driver/onboarding/documents ─────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('documents')
  async listDocuments(@Req() req: any) {
    const { driverId } = this.requireDriverJwt(req);

    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
      orderBy: { createdAt: 'asc' },
    });

    return { status: 'ok', data: { documents: docs.map((d) => this.safeDocument(d)) } };
  }

  // ─── DELETE /driver/onboarding/documents/:documentId ──────────────────────

  @UseGuards(JwtAuthGuard)
  @Delete('documents/:documentId')
  async deleteDocument(@Req() req: any, @Param('documentId') documentId: string) {
    const { driverId } = this.requireDriverJwt(req);

    const doc = await this.prisma.kycRecord.findUnique({ where: { id: documentId } });
    if (!doc || doc.entityType !== KycEntityType.DRIVER || doc.entityId !== driverId) {
      throw new NotFoundException({ message: 'Document not found', error_code: 'document_not_found' });
    }
    if (doc.status === DocumentStatus.APPROVED) {
      throw new BadRequestException({ message: 'Approved documents cannot be deleted', error_code: 'document_approved_cannot_delete' });
    }

    await this.prisma.kycRecord.delete({ where: { id: documentId } });
    return { status: 'ok', data: { deleted: true } };
  }

  // ─── POST /driver/onboarding/vehicle ─────────────────────────────────────
  // Independent drivers register their own vehicle here for super-admin review.

  @UseGuards(JwtAuthGuard)
  @Post('vehicle')
  async registerVehicle(@Req() req: any, @Body() body: RegisterIndependentVehicleDto) {
    const { driverId } = this.requireDriverJwt(req);

    const existing = await this.prisma.driverVehicleAssignment.findFirst({
      where: { driverId, status: { in: [AssignmentStatus.PENDING_COMPLIANCE, AssignmentStatus.ACTIVE] } },
      include: { vehicle: true },
    });
    if (existing) {
      throw new ConflictException({ message: 'You already have a registered vehicle pending review or active.', error_code: 'vehicle_already_registered' });
    }

    const plateExists = await this.prisma.vehicle.findUnique({ where: { plate: body.plate } });
    if (plateExists) {
      throw new ConflictException({ message: 'A vehicle with this plate number is already registered.', error_code: 'plate_already_exists' });
    }

    const vehicle = await this.prisma.vehicle.create({
      data: { plate: body.plate, type: body.type },
    });

    const assignment = await this.prisma.driverVehicleAssignment.create({
      data: {
        driverId,
        vehicleId: vehicle.id,
        status: AssignmentStatus.PENDING_COMPLIANCE,
        source: 'INDEPENDENT_REGISTRATION',
        active: false,
      },
      include: { vehicle: true },
    });

    return { status: 'ok', data: { vehicle: assignment.vehicle, assignment } };
  }

  // ─── GET /driver/onboarding/vehicle ──────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('vehicle')
  async getVehicle(@Req() req: any) {
    const { driverId } = this.requireDriverJwt(req);

    const assignment = await this.prisma.driverVehicleAssignment.findFirst({
      where: { driverId, status: { not: AssignmentStatus.ENDED } },
      include: { vehicle: true },
      orderBy: { id: 'desc' },
    });

    return { status: 'ok', data: { assignment } };
  }

  // ─── POST /driver/onboarding/submit ───────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('submit')
  async submitOnboarding(@Req() req: any) {
    const { driverId } = this.requireDriverJwt(req);

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findFirst({
      where: {
        driverId,
        status: { in: [OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE, OrganizationDriverStatus.PENDING_COMPLIANCE] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ─── Independent driver path ───────────────────────────────────────────
    if (!orgDriver) {
      const missingFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.profileFieldFilled(driver, f));
      if (missingFields.length > 0) {
        throw new BadRequestException({ message: `Missing required profile fields: ${missingFields.join(', ')}`, error_code: 'missing_profile_fields', details: { missingFields } });
      }
      const docs = await this.prisma.kycRecord.findMany({ where: { entityType: KycEntityType.DRIVER, entityId: driverId } });
      const missingDocs = this.missingRequiredDocumentTypes(driver, docs);
      if (missingDocs.length > 0) {
        throw new BadRequestException({ message: `Missing required documents: ${missingDocs.join(', ')}`, error_code: 'missing_required_documents', details: { missingDocs } });
      }
      const dlDoc = docs.find((d) => d.documentType === KycDocumentType.DRIVING_LICENSE);
      if (dlDoc?.expiresAt && dlDoc.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException({ message: 'Your driving license has expired. Please upload a valid license.', error_code: 'driving_license_expired' });
      }
      const vehicleAssignment = await this.prisma.driverVehicleAssignment.findFirst({
        where: { driverId, status: { in: [AssignmentStatus.PENDING_COMPLIANCE, AssignmentStatus.ACTIVE] } },
      });
      if (!vehicleAssignment) {
        throw new BadRequestException({ message: 'Please register a vehicle before submitting for verification.', error_code: 'vehicle_required' });
      }
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { independentSubmittedAt: driver.independentSubmittedAt ?? new Date() },
      });
      return {
        status: 'ok',
        data: { organizationDriverId: null, status: null, nextStep: 'WAIT_FOR_VERIFICATION', message: 'Your details have been submitted for verification.' },
      };
    }

    // ─── Org driver path ───────────────────────────────────────────────────
    if (orgDriver.status !== OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE) {
      if (orgDriver.status === OrganizationDriverStatus.PENDING_COMPLIANCE) {
        throw new BadRequestException({ message: 'Your onboarding has already been submitted for verification.', error_code: 'already_submitted' });
      }
      throw new BadRequestException({ message: 'Cannot submit onboarding in current status.', error_code: 'invalid_status_for_submit' });
    }

    // Validate mandatory profile fields
    const missingFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.profileFieldFilled(driver, f));
    if (missingFields.length > 0) {
      throw new BadRequestException({
        message: `Missing required profile fields: ${missingFields.join(', ')}`,
        error_code: 'missing_profile_fields',
        details: { missingFields },
      });
    }

    // Validate mandatory documents
    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
    });
    const missingDocs = this.missingRequiredDocumentTypes(driver, docs);
    if (missingDocs.length > 0) {
      throw new BadRequestException({
        message: `Missing required documents: ${missingDocs.join(', ')}`,
        error_code: 'missing_required_documents',
        details: { missingDocs },
      });
    }

    // Validate driving license expiry
    const dlDoc = docs.find((d) => d.documentType === KycDocumentType.DRIVING_LICENSE);
    if (dlDoc?.expiresAt && dlDoc.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ message: 'Your driving license has expired. Please upload a valid license.', error_code: 'driving_license_expired' });
    }

    // Move OrganizationDriver to PENDING_COMPLIANCE
    const updated = await this.prisma.organizationDriver.update({
      where: { id: orgDriver.id },
      data: {
        status: OrganizationDriverStatus.PENDING_COMPLIANCE,
        onboardingSubmittedAt: new Date(),
      },
    });

    return {
      status: 'ok',
      data: {
        organizationDriverId: updated.id,
        status: updated.status,
        nextStep: 'WAIT_FOR_VERIFICATION',
        message: 'Your details have been submitted for verification.',
      },
    };
  }

  // ─── GET /driver/onboarding/status ────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req: any) {
    const { driverId } = this.requireDriverJwt(req);

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findFirst({
      where: { driverId, status: { not: OrganizationDriverStatus.REMOVED } },
      include: { organization: { select: { id: true, legalName: true, tradeName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
    });

    const missingRequiredFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.profileFieldFilled(driver, f));
    const missingRequiredDocuments = this.missingRequiredDocumentTypes(driver, docs);

    const independentVehicle = !orgDriver
      ? await this.prisma.driverVehicleAssignment.findFirst({
          where: { driverId, status: { in: [AssignmentStatus.PENDING_COMPLIANCE, AssignmentStatus.ACTIVE] } },
          include: { vehicle: true },
          orderBy: { id: 'desc' },
        })
      : null;

    const nextStep = this.resolveNextStep(orgDriver?.status ?? null, missingRequiredFields, missingRequiredDocuments, {
      kycStatus: driver.kycStatus,
      hasVehicle: !!independentVehicle,
      submittedAt: driver.independentSubmittedAt,
    });
    const rejectedDocs = docs.filter((d) => d.status === DocumentStatus.REJECTED);

    return {
      status: 'ok',
      data: {
        driverId: driver.id,
        organizationId: orgDriver?.organization?.id ?? null,
        organizationName: orgDriver?.organization?.tradeName ?? orgDriver?.organization?.legalName ?? null,
        orgDriverStatus: orgDriver?.status ?? null,
        profileComplete: missingRequiredFields.length === 0,
        missingRequiredFields,
        missingRequiredDocuments,
        documentSummary: docs.map((d) => ({ id: d.id, documentType: d.documentType, status: d.status, rejectionReason: d.rejectionReason ?? null })),
        rejectedDocuments: rejectedDocs.map((d) => ({ id: d.id, documentType: d.documentType, rejectionReason: d.rejectionReason ?? null })),
        nextStep,
        onboardingSubmittedAt: orgDriver?.onboardingSubmittedAt ?? null,
      },
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private requireDriverJwt(req: any): { driverId: string; sub: string } {
    const driverId = req.user?.driverId as string | undefined;
    const sub = req.user?.sub as string | undefined;
    if (!driverId || !sub) {
      throw new ForbiddenException({ message: 'Driver JWT required', error_code: 'driver_jwt_required' });
    }
    return { driverId, sub };
  }

  private profileFieldFilled(driver: any, field: string): boolean {
    const value = driver[field];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  private resolveNextStep(
    orgStatus: OrganizationDriverStatus | null,
    missingFields: string[],
    missingDocs: KycDocumentType[],
    opts?: { kycStatus?: KycStatus; hasVehicle?: boolean; submittedAt?: Date | null },
  ): string {
    // Independent driver — no org link
    if (orgStatus === null) {
      if (opts?.kycStatus === KycStatus.APPROVED) return 'ACTIVE';
      if (opts?.kycStatus === KycStatus.REJECTED) return 'RESUBMIT';
      if (missingFields.length > 0 || missingDocs.length > 0) return 'COMPLETE_PROFILE';
      if (!opts?.hasVehicle) return 'REGISTER_VEHICLE';
      if (opts?.submittedAt) return 'WAIT_FOR_VERIFICATION';
      return 'SUBMIT_ONBOARDING';
    }
    if (orgStatus === OrganizationDriverStatus.INVITED) return 'ACCEPT_INVITE';
    if (orgStatus === OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE) {
      if (missingFields.length > 0 || missingDocs.length > 0) return 'COMPLETE_PROFILE';
      return 'SUBMIT_ONBOARDING';
    }
    if (orgStatus === OrganizationDriverStatus.PENDING_COMPLIANCE) return 'WAIT_FOR_VERIFICATION';
    if (orgStatus === OrganizationDriverStatus.ACTIVE) return 'ACTIVE';
    if (orgStatus === OrganizationDriverStatus.SUSPENDED) return 'SUSPENDED';
    return 'UNKNOWN';
  }

  private requiredDocumentTypes(driver: { dob?: Date | null }): KycDocumentType[] {
    return [...BASE_MANDATORY_DOCUMENT_TYPES];
  }

  private missingRequiredDocumentTypes(driver: { dob?: Date | null }, docs: Array<{ documentType: KycDocumentType }>) {
    const uploadedDocTypes = new Set(docs.map((d) => d.documentType));
    return this.requiredDocumentTypes(driver).filter((t) => !uploadedDocTypes.has(t));
  }

  private validateDocumentPayload(body: UpsertDriverDocumentDto, primaryFileUrl: string | null) {
    const docType = body.documentType;
    const documentNumber = body.documentNumber?.replace(/\s|-/g, '').toUpperCase();

    if (!primaryFileUrl) {
      throw new BadRequestException({ message: 'Upload a document file before saving.', error_code: 'document_file_required' });
    }

    if (docType === KycDocumentType.DRIVING_LICENSE) {
      if (!documentNumber || !/^[A-Z]{2}\d{2}[A-Z0-9]{1,13}$/.test(documentNumber)) {
        throw new BadRequestException({ message: 'Enter a valid driving license number.', error_code: 'invalid_driving_license_number' });
      }
      if (!body.expiryDate) {
        throw new BadRequestException({ message: 'Driving license expiry date is required.', error_code: 'driving_license_expiry_required' });
      }
    }

    if (docType === KycDocumentType.AADHAAR && documentNumber && !/^\d{12}$/.test(documentNumber)) {
      throw new BadRequestException({ message: 'Aadhaar number must be 12 digits.', error_code: 'invalid_aadhaar_number' });
    }

    if (docType === KycDocumentType.PAN_CARD && documentNumber && !/^[A-Z]{5}\d{4}[A-Z]$/.test(documentNumber)) {
      throw new BadRequestException({ message: 'Enter a valid PAN number.', error_code: 'invalid_pan_number' });
    }
  }

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return `XXXX${accountNumber.slice(-4)}`;
  }

  private safeDocument(doc: any) {
    const meta = (doc.metadataJson ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      documentType: doc.documentType,
      documentNo: doc.documentNo ? this.maskDocumentNo(doc.documentType, doc.documentNo) : null,
      status: doc.status,
      expiresAt: doc.expiresAt ?? null,
      rejectionReason: doc.rejectionReason ?? null,
      reviewedAt: doc.reviewedAt ?? null,
      frontFileId: meta.frontFileId ?? doc.documentUrl ?? null,
      backFileId: meta.backFileId ?? null,
      issueDate: meta.issueDate ?? null,
      issuingAuthority: meta.issuingAuthority ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private maskDocumentNo(docType: KycDocumentType, documentNo: string): string {
    if (docType === KycDocumentType.AADHAAR && documentNo.replace(/[-\s]/g, '').length === 12) {
      const digits = documentNo.replace(/[-\s]/g, '');
      return `XXXX-XXXX-${digits.slice(-4)}`;
    }
    return documentNo;
  }
}

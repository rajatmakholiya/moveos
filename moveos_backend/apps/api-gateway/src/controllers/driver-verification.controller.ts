import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import { DocumentStatus, KycDocumentType, KycEntityType, KycStatus, OrganizationDriverStatus } from '@prisma/client';
import { ApproveDocumentDto, ApproveDriverDto, RejectDocumentDto, RejectDriverDto } from '../dto/driver-verification.dto';

const MANDATORY_PROFILE_FIELDS = ['name', 'dob', 'gender', 'currentAddressJson', 'permanentAddressJson', 'emergencyContactName', 'emergencyContactPhone', 'profilePhotoFileId'] as const;
const BASE_MANDATORY_DOC_TYPES: KycDocumentType[] = [KycDocumentType.DRIVING_LICENSE];
const OPTIONAL_REVIEW_DOC_TYPES: KycDocumentType[] = [KycDocumentType.AADHAAR, KycDocumentType.PAN_CARD];

@Controller('super-admin/drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class DriverVerificationController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /super-admin/drivers/verifications ────────────────────────────────

  @Get('verifications')
  async listVerifications(
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const targetStatuses = status
      ? [status as OrganizationDriverStatus]
      : [OrganizationDriverStatus.PENDING_COMPLIANCE, OrganizationDriverStatus.ACTIVE, OrganizationDriverStatus.SUSPENDED];

    const where: any = { status: { in: targetStatuses } };
    if (organizationId) where.organizationId = organizationId;

    const [total, orgDrivers] = await Promise.all([
      this.prisma.organizationDriver.count({ where }),
      this.prisma.organizationDriver.findMany({
        where,
        skip,
        take,
        orderBy: { onboardingSubmittedAt: 'desc' },
        include: {
          organization: { select: { id: true, legalName: true, tradeName: true } },
          driver: { include: { user: { select: { id: true, phone: true, email: true, name: true } } } },
        },
      }),
    ]);

    // Filter by search after fetch (name/phone contains)
    let filtered = orgDrivers;
    if (search) {
      const q = search.toLowerCase();
      filtered = orgDrivers.filter((od) =>
        od.driver.name.toLowerCase().includes(q) ||
        od.driver.user.phone.includes(q) ||
        (od.driver.user.email ?? '').toLowerCase().includes(q),
      );
    }

    // Fetch doc summaries in parallel
    const items = await Promise.all(filtered.map(async (od) => {
      const docs = await this.prisma.kycRecord.findMany({
        where: { entityType: KycEntityType.DRIVER, entityId: od.driverId },
        select: { documentType: true, status: true },
      });
      const total = docs.length;
      const approved = docs.filter((d) => d.status === DocumentStatus.APPROVED).length;
      const pending = docs.filter((d) => d.status === DocumentStatus.PENDING).length;
      const rejected = docs.filter((d) => d.status === DocumentStatus.REJECTED).length;
      const uploadedTypes = new Set(docs.map((d) => d.documentType));
      const missingMandatory = this.requiredDocTypes(od.driver).filter((t) => !uploadedTypes.has(t));

      return {
        organizationDriverId: od.id,
        driverId: od.driverId,
        userId: od.driver.userId,
        organizationId: od.organizationId,
        organizationName: od.organization.tradeName ?? od.organization.legalName,
        fullName: od.driver.name,
        phone: od.driver.user.phone,
        status: od.status,
        onboardingSubmittedAt: od.onboardingSubmittedAt,
        activatedAt: od.activatedAt,
        documentSummary: { total, approved, pending, rejected, missingMandatory },
      };
    }));

    return {
      status: 'ok',
      data: {
        items,
        pagination: { page: Number(page), limit: take, total },
      },
    };
  }

  // ─── GET /super-admin/drivers/:driverId/verification ──────────────────────

  @Get(':driverId/verification')
  async getVerificationDetail(@Param('driverId') driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { id: true, phone: true, email: true, name: true, status: true } } },
    });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findFirst({
      where: { driverId, status: { notIn: [OrganizationDriverStatus.REMOVED] } },
      include: { organization: { select: { id: true, legalName: true, tradeName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
      orderBy: { createdAt: 'asc' },
    });

    const missingRequiredFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.fieldFilled(driver, f));
    const uploadedTypes = new Set(docs.map((d) => d.documentType));
    const requiredDocTypes = this.requiredDocTypes(driver);
    const missingRequiredDocuments = requiredDocTypes.filter((t) => !uploadedTypes.has(t));

    const mandatoryDocsApproved = requiredDocTypes.every((t) => this.documentTypeApproved(docs, t));
    const optionalDocsNotApproved = this.submittedOptionalDocsNotApproved(docs);
    const canApproveProfile = missingRequiredFields.length === 0 && missingRequiredDocuments.length === 0 && mandatoryDocsApproved && optionalDocsNotApproved.length === 0;

    const blockReasons: string[] = [];
    if (missingRequiredFields.length > 0) blockReasons.push(`Missing profile fields: ${missingRequiredFields.join(', ')}`);
    requiredDocTypes.forEach((t) => {
      const typeDocs = docs.filter((d) => d.documentType === t);
      if (typeDocs.length === 0) blockReasons.push(`${t} not uploaded`);
      else if (!this.documentTypeApproved(docs, t) && typeDocs.some((doc) => doc.status === DocumentStatus.PENDING)) blockReasons.push(`${t} pending review`);
      else if (!this.documentTypeApproved(docs, t)) blockReasons.push(`${t} not approved`);
    });
    optionalDocsNotApproved.forEach((doc) => {
      blockReasons.push(`${doc.documentType} ${doc.status === DocumentStatus.PENDING ? 'pending review' : 'not approved'}`);
    });
    const dlDoc = this.bestDocumentForType(docs, KycDocumentType.DRIVING_LICENSE);
    if (dlDoc?.expiresAt && dlDoc.expiresAt.getTime() < Date.now()) blockReasons.push('Driving license is expired');

    return {
      status: 'ok',
      data: {
        driver: {
          id: driver.id,
          fullName: driver.name,
          phone: driver.user.phone,
          email: driver.user.email ?? null,
          dob: driver.dob?.toISOString().split('T')[0] ?? null,
          gender: driver.gender ?? null,
          currentAddress: driver.currentAddressJson ?? null,
          permanentAddress: driver.permanentAddressJson ?? null,
          emergencyContactName: driver.emergencyContactName ?? null,
          emergencyContactPhone: driver.emergencyContactPhone ?? null,
          bloodGroup: driver.bloodGroup ?? null,
          preferredLanguage: driver.preferredLanguage ?? null,
          profilePhotoFileId: driver.profilePhotoFileId ?? null,
          kycStatus: driver.kycStatus,
          complianceStatus: driver.complianceStatus,
        },
        organizationDriver: orgDriver ? {
          id: orgDriver.id,
          organizationId: orgDriver.organizationId,
          organizationName: orgDriver.organization.tradeName ?? orgDriver.organization.legalName,
          status: orgDriver.status,
          onboardingSubmittedAt: orgDriver.onboardingSubmittedAt,
          activatedAt: orgDriver.activatedAt,
          approvedBySuperAdminId: orgDriver.approvedBySuperAdminId,
          complianceApprovedAt: orgDriver.complianceApprovedAt,
          complianceRejectedAt: orgDriver.complianceRejectedAt,
          complianceRejectionReason: orgDriver.complianceRejectionReason,
        } : null,
        documents: docs.map((d) => this.safeDocument(d)),
        missingRequiredFields,
        missingRequiredDocuments,
        canApproveProfile,
        blockReasons,
      },
    };
  }

  // ─── POST /super-admin/drivers/:driverId/documents/:kycRecordId/approve ───

  @Post(':driverId/documents/:kycRecordId/approve')
  async approveDocument(
    @Req() req: any,
    @Param('driverId') driverId: string,
    @Param('kycRecordId') kycRecordId: string,
    @Body() body: ApproveDocumentDto,
  ) {
    const doc = await this.requireDriverDoc(driverId, kycRecordId);

    if (doc.status === DocumentStatus.APPROVED) {
      throw new BadRequestException({ message: 'Document is already approved', error_code: 'document_already_approved' });
    }

    const updated = await this.prisma.kycRecord.update({
      where: { id: kycRecordId },
      data: {
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: req.user.sub,
        rejectionReason: null,
      },
    });

    await this.writeAuditEvent(req.user.sub, driverId, null, kycRecordId, 'driver_document.approved', { documentType: doc.documentType, remarks: body.remarks });

    return { status: 'ok', data: { document: this.safeDocument(updated) } };
  }

  // ─── POST /super-admin/drivers/:driverId/documents/:kycRecordId/reject ────

  @Post(':driverId/documents/:kycRecordId/reject')
  async rejectDocument(
    @Req() req: any,
    @Param('driverId') driverId: string,
    @Param('kycRecordId') kycRecordId: string,
    @Body() body: RejectDocumentDto,
  ) {
    const doc = await this.requireDriverDoc(driverId, kycRecordId);

    if (doc.status === DocumentStatus.APPROVED) {
      throw new BadRequestException({ message: 'Approved documents cannot be rejected', error_code: 'document_already_approved' });
    }

    const updated = await this.prisma.kycRecord.update({
      where: { id: kycRecordId },
      data: {
        status: DocumentStatus.REJECTED,
        rejectionReason: body.reason,
        reviewedAt: new Date(),
        reviewedById: req.user.sub,
      },
    });

    await this.writeAuditEvent(req.user.sub, driverId, null, kycRecordId, 'driver_document.rejected', { documentType: doc.documentType, reason: body.reason, remarks: body.remarks });

    return { status: 'ok', data: { document: this.safeDocument(updated) } };
  }

  // ─── POST /super-admin/drivers/:driverId/approve ──────────────────────────

  @Post(':driverId/approve')
  async approveDriver(@Req() req: any, @Param('driverId') driverId: string, @Body() body: ApproveDriverDto) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findUnique({ where: { id: body.organizationDriverId } });
    if (!orgDriver || orgDriver.driverId !== driverId) {
      throw new NotFoundException({ message: 'Organization driver mapping not found', error_code: 'org_driver_not_found' });
    }
    if (orgDriver.status !== OrganizationDriverStatus.PENDING_COMPLIANCE) {
      throw new BadRequestException({ message: `Driver is not in PENDING_COMPLIANCE status (current: ${orgDriver.status})`, error_code: 'invalid_status_for_approval' });
    }

    // Validate mandatory profile fields
    const missingFields = MANDATORY_PROFILE_FIELDS.filter((f) => !this.fieldFilled(driver, f));
    if (missingFields.length > 0) {
      throw new BadRequestException({
        message: `Missing mandatory profile fields: ${missingFields.join(', ')}`,
        error_code: 'missing_profile_fields',
        details: { missingFields },
      });
    }

    // Validate mandatory documents are approved
    const docs = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
    });
    const uploadedTypes = new Set(docs.map((d) => d.documentType));
    const requiredDocTypes = this.requiredDocTypes(driver);
    const missingDocs = requiredDocTypes.filter((t) => !uploadedTypes.has(t));
    if (missingDocs.length > 0) {
      throw new BadRequestException({ message: `Missing mandatory documents: ${missingDocs.join(', ')}`, error_code: 'missing_required_documents', details: { missingDocs } });
    }

    const notApproved = requiredDocTypes.filter((t) => {
      return !this.documentTypeApproved(docs, t);
    });
    if (notApproved.length > 0) {
      const statuses = notApproved.map((t) => {
        const doc = this.bestDocumentForType(docs, t);
        return `${t}: ${doc?.status ?? 'MISSING'}`;
      });
      throw new BadRequestException({ message: `Mandatory documents not yet approved: ${statuses.join(', ')}`, error_code: 'mandatory_docs_not_approved', details: { notApproved } });
    }
    const optionalDocsNotApproved = this.submittedOptionalDocsNotApproved(docs);
    if (optionalDocsNotApproved.length > 0) {
      throw new BadRequestException({
        message: `Submitted optional documents not yet approved: ${optionalDocsNotApproved.map((d) => `${d.documentType}: ${d.status}`).join(', ')}`,
        error_code: 'optional_docs_not_approved',
        details: { notApproved: optionalDocsNotApproved.map((d) => d.documentType) },
      });
    }

    // Validate DL not expired
    const dlDoc = this.bestDocumentForType(docs, KycDocumentType.DRIVING_LICENSE);
    if (dlDoc?.expiresAt && dlDoc.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ message: 'Driving license is expired', error_code: 'driving_license_expired' });
    }

    const now = new Date();
    const updated = await this.prisma.organizationDriver.update({
      where: { id: orgDriver.id },
      data: {
        status: OrganizationDriverStatus.ACTIVE,
        activatedAt: now,
        approvedBySuperAdminId: req.user.sub,
        complianceApprovedAt: now,
        complianceRejectedAt: null,
        complianceRejectionReason: null,
      },
    });
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { kycStatus: KycStatus.APPROVED },
    });

    await this.writeAuditEvent(req.user.sub, driverId, orgDriver.organizationId, null, 'driver.activated', {
      organizationDriverId: orgDriver.id,
      previousStatus: OrganizationDriverStatus.PENDING_COMPLIANCE,
      newStatus: OrganizationDriverStatus.ACTIVE,
      remarks: body.remarks,
    });

    return {
      status: 'ok',
      data: {
        organizationDriverId: updated.id,
        status: updated.status,
        activatedAt: updated.activatedAt,
        message: 'Driver has been activated successfully.',
      },
    };
  }

  // ─── POST /super-admin/drivers/:driverId/reject ───────────────────────────

  @Post(':driverId/reject')
  async rejectDriver(@Req() req: any, @Param('driverId') driverId: string, @Body() body: RejectDriverDto) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const orgDriver = await this.prisma.organizationDriver.findUnique({ where: { id: body.organizationDriverId } });
    if (!orgDriver || orgDriver.driverId !== driverId) {
      throw new NotFoundException({ message: 'Organization driver mapping not found', error_code: 'org_driver_not_found' });
    }
    if (orgDriver.status !== OrganizationDriverStatus.PENDING_COMPLIANCE) {
      throw new BadRequestException({ message: `Driver is not in PENDING_COMPLIANCE status (current: ${orgDriver.status})`, error_code: 'invalid_status_for_rejection' });
    }

    // Keep as PENDING_COMPLIANCE — store rejection info in compliance fields so driver can resubmit.
    // OrganizationDriverStatus enum does not have REJECTED, so we use compliance fields for rejection data.
    const updated = await this.prisma.organizationDriver.update({
      where: { id: orgDriver.id },
      data: {
        complianceRejectedAt: new Date(),
        complianceRejectionReason: body.reason,
      },
    });

    await this.writeAuditEvent(req.user.sub, driverId, orgDriver.organizationId, null, 'driver.compliance_rejected', {
      organizationDriverId: orgDriver.id,
      reason: body.reason,
      remarks: body.remarks,
    });

    return {
      status: 'ok',
      data: {
        organizationDriverId: updated.id,
        status: updated.status,
        complianceRejectedAt: updated.complianceRejectedAt,
        complianceRejectionReason: updated.complianceRejectionReason,
        nextStep: 'RESUBMIT_REQUIRED',
        message: 'Driver profile has been sent back for resubmission.',
      },
    };
  }

  // ─── GET /super-admin/drivers/:driverId/verification-history ──────────────

  @Get(':driverId/verification-history')
  async getVerificationHistory(@Param('driverId') driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, userId: true } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const events = await this.prisma.auditEvent.findMany({
      where: {
        targetType: 'DriverVerification',
        targetId: driverId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      status: 'ok',
      data: {
        history: events.map((e) => ({
          id: e.id,
          action: e.action,
          performedByUserId: e.actorUserId,
          reason: e.reason ?? null,
          details: e.afterJson ?? null,
          createdAt: e.createdAt,
        })),
      },
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async requireDriverDoc(driverId: string, kycRecordId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
    if (!driver) throw new NotFoundException({ message: 'Driver not found', error_code: 'driver_not_found' });

    const doc = await this.prisma.kycRecord.findUnique({ where: { id: kycRecordId } });
    if (!doc || doc.entityType !== KycEntityType.DRIVER || doc.entityId !== driverId) {
      throw new NotFoundException({ message: 'Document not found or does not belong to this driver', error_code: 'document_not_found' });
    }
    return doc;
  }

  private async writeAuditEvent(
    actorUserId: string,
    driverId: string,
    organizationId: string | null,
    kycRecordId: string | null,
    action: string,
    details: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId,
        organizationId: organizationId ?? undefined,
        targetType: 'DriverVerification',
        targetId: driverId,
        action,
        reason: typeof details.reason === 'string' ? details.reason : undefined,
        afterJson: { ...details, kycRecordId } as any,
      },
    });
  }

  private fieldFilled(driver: any, field: string): boolean {
    const value = driver[field];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  private requiredDocTypes(driver: { dob?: Date | null }): KycDocumentType[] {
    return [...BASE_MANDATORY_DOC_TYPES];
  }

  private submittedOptionalDocsNotApproved(docs: Array<{ documentType: KycDocumentType | null; status: DocumentStatus }>) {
    return OPTIONAL_REVIEW_DOC_TYPES.flatMap((documentType) => {
      const typeDocs = docs.filter((doc) => doc.documentType === documentType);
      if (typeDocs.length === 0 || typeDocs.some((doc) => doc.status === DocumentStatus.APPROVED)) return [];
      return [typeDocs[0]];
    });
  }

  private documentTypeApproved(docs: Array<{ documentType: KycDocumentType | null; status: DocumentStatus }>, documentType: KycDocumentType) {
    return docs.some((doc) => doc.documentType === documentType && doc.status === DocumentStatus.APPROVED);
  }

  private bestDocumentForType<T extends { documentType: KycDocumentType | null; status: DocumentStatus }>(docs: T[], documentType: KycDocumentType) {
    return docs.find((doc) => doc.documentType === documentType && doc.status === DocumentStatus.APPROVED)
      ?? docs.find((doc) => doc.documentType === documentType);
  }

  private safeDocument(doc: any) {
    const meta = (doc.metadataJson ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      documentType: doc.documentType,
      documentNumberMasked: doc.documentNo ? this.maskDocumentNo(doc.documentType, doc.documentNo) : null,
      status: doc.status,
      expiresAt: doc.expiresAt ?? null,
      rejectionReason: doc.rejectionReason ?? null,
      reviewedAt: doc.reviewedAt ?? null,
      reviewedById: doc.reviewedById ?? null,
      frontFileId: meta.frontFileId ?? doc.documentUrl ?? null,
      backFileId: meta.backFileId ?? null,
      metadata: {
        issueDate: meta.issueDate ?? null,
        issuingAuthority: meta.issuingAuthority ?? null,
        accountHolderName: meta.accountHolderName ?? null,
        bankName: meta.bankName ?? null,
        ifscCode: meta.ifscCode ?? null,
      },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private maskDocumentNo(docType: string, documentNo: string): string {
    if (docType === 'AADHAAR') {
      const digits = documentNo.replace(/[-\s]/g, '');
      if (digits.length === 12) return `XXXX-XXXX-${digits.slice(-4)}`;
    }
    if (documentNo.length > 8) {
      return `${documentNo.slice(0, 4)}${'*'.repeat(documentNo.length - 8)}${documentNo.slice(-4)}`;
    }
    return documentNo;
  }
}

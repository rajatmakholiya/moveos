import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@common/index';
import { FileService } from '@common/index';
import {
  AccountType,
  AssignmentStatus,
  ComplianceStatus,
  DocumentStatus,
  DriverStatus,
  KycDocumentType,
  KycEntityType,
  KycStatus,
  OrganizationDriverStatus,
  OrganizationStatus,
  VehicleStatus,
  WalletEntryType,
} from '@prisma/client';
import { RedisService } from '@common/index';
import { CreateVehicleDto, SubmitDriverKycDto } from './dto/driver.dto';

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly fileService: FileService,
  ) {}

  async goOnline(driverId: string) {
    const operational = await this.getOperationalVehicle(driverId);
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.ONLINE },
    });
    await this.redis.setDriverState(driverId, DriverStatus.ONLINE);
    return { driverId, status: driver.status, online: true, onlineSince: new Date().toISOString(), vehicle: operational.vehicle };
  }

  async goOffline(driverId: string) {
    await this.ensureDriverExists(driverId);
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.OFFLINE },
    });
    await this.redis.setDriverState(driverId, DriverStatus.OFFLINE);
    await this.redis.setActiveRide(driverId, null);
    return { driverId, status: driver.status, online: false };
  }

  async getProfile(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        vehicles: { include: { vehicle: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
      orderBy: { createdAt: 'desc' },
    });
    return { ...driver, kycRecords };
  }

  async getComplianceStatus(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { vehicles: { include: { vehicle: true } } },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const activeAssignment = driver.vehicles.find((assignment) => assignment.active);
    const activeVehicle = activeAssignment?.vehicle;
    const driverClear = driver.kycStatus === KycStatus.APPROVED && driver.complianceStatus === ComplianceStatus.CLEAR;
    const vehicleClear = Boolean(activeVehicle && activeVehicle.status === VehicleStatus.ACTIVE && activeVehicle.complianceStatus === ComplianceStatus.CLEAR);
    return {
      compliance: {
        driverId,
        profile: driver.kycStatus === KycStatus.APPROVED ? 'VERIFIED' : driver.kycStatus,
        license: driver.kycStatus === KycStatus.APPROVED ? 'VERIFIED' : 'PENDING',
        vehicleRc: vehicleClear ? 'VERIFIED' : activeVehicle ? activeVehicle.status : 'MISSING',
        insurance: vehicleClear ? 'VERIFIED' : activeVehicle ? activeVehicle.complianceStatus : 'MISSING',
        permit: vehicleClear ? 'VERIFIED' : activeVehicle ? activeVehicle.complianceStatus : 'MISSING',
        activeVehicleId: activeVehicle?.id,
        activeVehiclePlate: activeVehicle?.plate,
        canAcceptBookings: driverClear && vehicleClear,
      },
    };
  }

  async getVehicles(driverId: string) {
    await this.ensureDriverExists(driverId);
    const selectedContext = await this.getSelectedOperatingContext(driverId);
    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: {
        driverId,
        status: { not: AssignmentStatus.ENDED },
      },
      include: { vehicle: { include: { documents: true } } },
      orderBy: [{ active: 'desc' }, { id: 'asc' }],
    });
    return {
      vehicles: assignments.map((assignment) => ({
        ...assignment,
        ownershipContext: assignment.organizationId ? `ORG:${assignment.organizationId}` : 'INDIVIDUAL',
      })),
      selectedContext: selectedContext?.id ?? null,
    };
  }

  async getOperatingContexts(driverId: string) {
    const driver = await this.ensureDriverExists(driverId);
    const individualAssignments = await this.prisma.driverVehicleAssignment.findMany({
      where: { driverId, organizationId: null, status: { not: AssignmentStatus.ENDED } },
      include: { vehicle: true },
    });
    const organizationLinks = await this.prisma.organizationDriver.findMany({
      where: { driverId, status: { notIn: [OrganizationDriverStatus.REMOVED, OrganizationDriverStatus.SUSPENDED] } },
      orderBy: { createdAt: 'asc' },
    });
    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: organizationLinks.map((link) => link.organizationId) } },
    });
    const orgAssignments = await this.prisma.driverVehicleAssignment.findMany({
      where: {
        driverId,
        organizationId: { in: organizationLinks.map((link) => link.organizationId) },
        status: { not: AssignmentStatus.ENDED },
      },
      include: { vehicle: true },
    });

    const contexts = [
      {
        id: 'INDIVIDUAL',
        type: 'INDIVIDUAL',
        label: 'Drive independently',
        activeVehicleCount: individualAssignments.length,
        canOperate: individualAssignments.some((assignment) => this.isDriverAndVehicleClear(driver, assignment.vehicle)),
        blockedReasons: individualAssignments.length
          ? []
          : [{ code: 'NO_INDIVIDUAL_VEHICLE', message: 'No individual vehicle is assigned', owner: 'DRIVER' }],
      },
      ...organizationLinks.map((link) => {
        const organization = organizations.find((item) => item.id === link.organizationId);
        const assignments = orgAssignments.filter((assignment) => assignment.organizationId === link.organizationId);
        const orgActive = organization?.status === OrganizationStatus.ACTIVE;
        return {
          id: `ORG:${link.organizationId}`,
          type: 'ORGANIZATION',
          organizationId: link.organizationId,
          label: organization?.tradeName ?? organization?.legalName ?? 'Organization',
          status: link.status,
          organizationStatus: organization?.status,
          activeVehicleCount: assignments.length,
          canOperate: orgActive && link.status === OrganizationDriverStatus.ACTIVE && assignments.some((assignment) => this.isDriverAndVehicleClear(driver, assignment.vehicle)),
          blockedReasons: this.buildContextBlockedReasons(orgActive, link.status, assignments.length),
        };
      }),
    ];
    const selectedContext = await this.getSelectedOperatingContext(driverId);
    return { contexts, selectedContext: selectedContext?.id ?? null };
  }

  async selectOperatingContext(driverId: string, contextId: string) {
    await this.ensureDriverExists(driverId);
    if (contextId !== 'INDIVIDUAL' && !contextId.startsWith('ORG:')) {
      throw new BadRequestException({ message: 'Invalid operating context', error_code: 'invalid_operating_context' });
    }
    if (contextId.startsWith('ORG:')) {
      const organizationId = contextId.slice(4);
      const link = await this.prisma.organizationDriver.findUnique({
        where: { organizationId_driverId: { organizationId, driverId } },
      });
      if (!link || link.status === OrganizationDriverStatus.REMOVED || link.status === OrganizationDriverStatus.SUSPENDED) {
        throw new ForbiddenException({ message: 'Driver is not active in this organization', error_code: 'org_driver_required' });
      }
    }
    await this.redis.getClient().set(`driver:${driverId}:operatingContext`, contextId, 'EX', 7 * 24 * 60 * 60);
    return { selectedContext: contextId };
  }

  async createVehicle(driverId: string, dto: CreateVehicleDto) {
    await this.ensureDriverExists(driverId);
    const plate = dto.plate.trim().toUpperCase().replace(/\s+/g, '');
    if (!plate) {
      throw new BadRequestException('Vehicle plate is required');
    }

    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: { plate },
      include: { assignments: true },
    });
    const assignedElsewhere = existingVehicle?.assignments.some((assignment) => assignment.driverId !== driverId);
    if (assignedElsewhere) {
      throw new ConflictException({
        message: 'Vehicle is already linked to another driver',
        error_code: 'vehicle_already_assigned',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.upsert({
        where: { plate },
        create: {
          plate,
          type: dto.type,
          status: VehicleStatus.INACTIVE,
        },
        update: { type: dto.type },
      });
      const assignment = await tx.driverVehicleAssignment.upsert({
        where: { driverId_vehicleId: { driverId, vehicleId: vehicle.id } },
        create: { driverId, vehicleId: vehicle.id, active: false },
        update: {},
      });
      return { vehicle, assignment };
    });
    return result;
  }

  async activateVehicle(driverId: string, vehicleId?: string) {
    await this.ensureDriverExists(driverId);
    const target = vehicleId
      ? await this.prisma.driverVehicleAssignment.findUnique({
          where: { driverId_vehicleId: { driverId, vehicleId } },
          include: { vehicle: true, driver: true },
        })
      : await this.prisma.driverVehicleAssignment.findFirst({
          where: { driverId },
          include: { vehicle: true, driver: true },
          orderBy: { id: 'asc' },
        });

    if (!target) {
      throw new NotFoundException('No vehicle assignment found for this driver');
    }
    this.assertDriverAndVehicleCompliant(target.driver, target.vehicle);

    await this.prisma.$transaction([
      this.prisma.driverVehicleAssignment.updateMany({
        where: { driverId },
        data: { active: false },
      }),
      this.prisma.driverVehicleAssignment.update({
        where: { id: target.id },
        data: { active: true },
      }),
    ]);

    return { vehicle: target.vehicle, active: true };
  }

  async getOperationalVehicle(driverId: string, requestedVehicleId?: string) {
    const selectedContext = await this.getSelectedOperatingContext(driverId);
    const assignment = requestedVehicleId
      ? await this.prisma.driverVehicleAssignment.findUnique({
          where: { driverId_vehicleId: { driverId, vehicleId: requestedVehicleId } },
          include: { driver: true, vehicle: true },
        })
      : await this.prisma.driverVehicleAssignment.findFirst({
          where: {
            driverId,
            active: true,
            ...(selectedContext?.type === 'INDIVIDUAL' ? { organizationId: null } : {}),
            ...(selectedContext?.type === 'ORGANIZATION' ? { organizationId: selectedContext.organizationId } : {}),
          },
          include: { driver: true, vehicle: true },
        });
    if (!assignment) {
      throw new ForbiddenException({
        message: requestedVehicleId ? 'Vehicle is not assigned to this driver' : 'No active vehicle assigned to this driver',
        error_code: 'vehicle_assignment_required',
      });
    }
    await this.assertAssignmentOperational(assignment);
    return { vehicle: assignment.vehicle, assignmentId: assignment.id };
  }

  requestVehicleDocumentUploadUrl(vehicleId: string, type: string, filename?: string) {
    return this.fileService.createUploadSlot({ scope: 'vehicle', ownerId: vehicleId, documentType: type, filename });
  }

  requestDocumentUploadUrl(driverId: string, type: string, filename?: string) {
    return this.fileService.createUploadSlot({ scope: 'driver', ownerId: driverId, documentType: type, filename });
  }

  async createVehicleDocumentMetadata(driverId: string, vehicleId: string, type: string, url: string) {
    await this.ensureDriverExists(driverId);
    const assignment = await this.prisma.driverVehicleAssignment.findUnique({
      where: { driverId_vehicleId: { driverId, vehicleId } },
      include: { vehicle: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Vehicle is not assigned to this driver');
    }
    const document = await this.prisma.vehicleDocument.create({
      data: { vehicleId, type, url, status: DocumentStatus.PENDING },
    });
    return { document };
  }

  async getEarningsSummary(driverId: string) {
    await this.ensureDriverExists(driverId);

    // Window starts: IST day boundary, rolling 7 and 30 days
    const now = new Date();
    const istOffsetMs = 5.5 * 3_600_000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istMidnightUtc = new Date(
      Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffsetMs,
    );
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getTime() - 30 * 86_400_000);

    const netSince = async (since?: Date) => {
      const base = {
        accountId: driverId,
        accountType: AccountType.DRIVER,
        ...(since ? { createdAt: { gte: since } } : {}),
      };
      const [credit, debit] = await Promise.all([
        this.prisma.walletLedger.aggregate({ where: { ...base, entryType: WalletEntryType.CREDIT }, _sum: { amount: true } }),
        this.prisma.walletLedger.aggregate({ where: { ...base, entryType: WalletEntryType.DEBIT }, _sum: { amount: true } }),
      ]);
      return Number(credit._sum.amount ?? 0) - Number(debit._sum.amount ?? 0);
    };

    const [todayPaise, weekPaise, monthPaise, totalPaise, platformFee, pendingCash] = await Promise.all([
      netSince(istMidnightUtc),
      netSince(weekStart),
      netSince(monthStart),
      netSince(),
      this.prisma.walletLedger.aggregate({
        where: { accountId: driverId, accountType: AccountType.DRIVER, refType: 'PLATFORM_FEE_CASH' },
        _sum: { amount: true },
      }),
      // Cash fares on this driver's trips still waiting to be collected
      this.prisma.seatBooking.aggregate({
        where: {
          trip: { driverId },
          paymentMethod: 'CASH',
          paymentStatus: 'PENDING',
          status: 'CONFIRMED',
        },
        _sum: { totalFare: true },
      }),
    ]);

    return {
      earnings: {
        driverId,
        todayPaise,
        weekPaise,
        monthPaise,
        totalPaise,
        pendingCashPaise: Number(pendingCash._sum.totalFare ?? 0),
        platformFeePaise: Number(platformFee._sum.amount ?? 0),
      },
    };
  }

  async getWalletLedger(driverId: string) {
    await this.ensureDriverExists(driverId);
    const entries = await this.prisma.walletLedger.findMany({
      where: { accountId: driverId, accountType: AccountType.DRIVER },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        amountPaise: Number(entry.amount),
        entryType: entry.entryType,
        refType: entry.refType,
        refId: entry.refId,
        createdAt: entry.createdAt,
      })),
    };
  }

  async getWalletBalance(driverId: string) {
    await this.ensureDriverExists(driverId);
    const credit = await this.prisma.walletLedger.aggregate({
      where: { accountId: driverId, accountType: AccountType.DRIVER, entryType: WalletEntryType.CREDIT },
      _sum: { amount: true },
    });
    const debit = await this.prisma.walletLedger.aggregate({
      where: { accountId: driverId, accountType: AccountType.DRIVER, entryType: WalletEntryType.DEBIT },
      _sum: { amount: true },
    });
    const balance = Number(credit._sum.amount ?? 0) - Number(debit._sum.amount ?? 0);
    return { wallet: { driverId, balance } };
  }

  async createDocumentMetadata(driverId: string, type: string, url: string) {
    await this.ensureDriverExists(driverId);
    const document = await this.prisma.driverDocument.create({
      data: { driverId, type, url, status: DocumentStatus.PENDING },
    });
    return { document };
  }

  async submitKyc(driverId: string, dto: SubmitDriverKycDto) {
    await this.ensureDriverExists(driverId);
    this.assertKycDocumentType(dto.documentType);
    if (!dto.documentUrl && !dto.fileUuid) {
      throw new BadRequestException({
        message: 'documentUrl or fileUuid is required',
        error_code: 'kyc_document_reference_required',
      });
    }

    const existingDocument = await this.prisma.kycRecord.findFirst({
      where: {
        entityType: KycEntityType.DRIVER,
        entityId: driverId,
        documentType: dto.documentType,
      },
    });
    if (existingDocument) {
      throw new ConflictException({
        message: 'This KYC document has already been submitted',
        error_code: 'kyc_document_already_submitted',
      });
    }

    const kycRecord = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.DRIVER,
        entityId: driverId,
        documentType: dto.documentType,
        documentUrl: dto.documentUrl ?? `urn:moveos:file:${dto.fileUuid}`,
        documentNo: dto.documentNo,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        status: DocumentStatus.PENDING,
        metadataJson: {
          ...(dto.metadataJson ?? {}),
          ...(dto.fileUuid ? { fileUuid: dto.fileUuid } : {}),
          ...(dto.consentGiven !== undefined || dto.consentText
            ? { consent: { given: Boolean(dto.consentGiven), text: dto.consentText } }
            : {}),
        },
      },
    });
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { kycStatus: KycStatus.PENDING },
    });
    return { kycRecord };
  }

  private async ensureDriverExists(driverId: string) {
    const existing = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (existing) return existing;
    // Bootstrap placeholder user/driver for local development
    const tx = await this.prisma.$transaction(async (prisma:any) => {
      const user = await prisma.user.upsert({
        where: { id: driverId },
        create: {
          id: driverId,
          phone: `+100000${driverId.slice(-6)}`,
          role: 'DRIVER',
        },
        update: {},
      });
      return prisma.driver.create({
        data: {
          id: driverId,
          userId: user.id,
          name: `Driver ${driverId}`,
        },
      });
    });
    return tx;
  }

  private assertKycDocumentType(documentType: unknown): asserts documentType is KycDocumentType {
    if (!Object.values(KycDocumentType).includes(documentType as KycDocumentType)) {
      throw new BadRequestException({
        message: 'Invalid KYC document type',
        error_code: 'invalid_kyc_document_type',
      });
    }
  }

  private assertDriverAndVehicleCompliant(driver: any, vehicle: any) {
    if (driver.kycStatus !== KycStatus.APPROVED || driver.complianceStatus !== ComplianceStatus.CLEAR) {
      throw new ForbiddenException({
        message: 'Driver KYC or compliance is not approved',
        error_code: 'driver_compliance_required',
        compliance: {
          canOperate: false,
          blockedReasons: [{ code: 'DRIVER_KYC_NOT_APPROVED', message: 'Complete and pass KYC verification before going online', owner: 'DRIVER' }],
          nextActions: [{ code: 'COMPLETE_KYC', label: 'Complete your KYC verification' }],
        },
      });
    }
    if (vehicle.status !== VehicleStatus.ACTIVE || vehicle.complianceStatus !== ComplianceStatus.CLEAR) {
      throw new ForbiddenException({
        message: 'Vehicle KYC or compliance is not approved',
        error_code: 'vehicle_compliance_required',
        compliance: {
          canOperate: false,
          blockedReasons: [{ code: 'VEHICLE_NOT_APPROVED', message: 'Vehicle documents are not approved', owner: 'DRIVER' }],
          nextActions: [{ code: 'UPLOAD_VEHICLE_DOCUMENTS', label: 'Upload and get vehicle documents approved' }],
        },
      });
    }
    this.assertVehicleDocumentsNotExpired(vehicle);
  }

  /**
   * Hard expiry gate — a vehicle whose insurance/fitness/permit/pollution has
   * lapsed cannot operate even if its documents were once APPROVED. Each
   * failure names exactly what expired and how to fix it.
   */
  private assertVehicleDocumentsNotExpired(vehicle: any) {
    const now = Date.now();
    const expiries: Array<{ field: string; code: string; label: string; docLabel: string }> = [
      { field: 'insuranceValidTill', code: 'INSURANCE_EXPIRED', label: 'Renew and upload vehicle insurance', docLabel: 'Vehicle insurance' },
      { field: 'fitnessValidTill', code: 'FITNESS_EXPIRED', label: 'Renew and upload the fitness certificate', docLabel: 'Fitness certificate' },
      { field: 'permitValidTill', code: 'PERMIT_EXPIRED', label: 'Renew and upload the commercial permit', docLabel: 'Commercial permit' },
      { field: 'pollutionValidTill', code: 'POLLUTION_EXPIRED', label: 'Renew and upload the pollution certificate', docLabel: 'Pollution certificate' },
    ];
    const expired = expiries.filter(({ field }) => {
      const value = vehicle[field];
      return value instanceof Date && value.getTime() < now;
    });
    if (expired.length > 0) {
      throw new ForbiddenException({
        message: `${expired.map((e) => e.docLabel).join(', ')} expired — renew before going online`,
        error_code: 'vehicle_document_expired',
        compliance: {
          canOperate: false,
          blockedReasons: expired.map((e) => ({ code: e.code, message: `${e.docLabel} has expired`, owner: 'DRIVER' })),
          nextActions: expired.map((e) => ({ code: `RENEW_${e.code}`, label: e.label })),
        },
      });
    }
  }

  private async assertAssignmentOperational(assignment: any) {
    this.assertDriverAndVehicleCompliant(assignment.driver, assignment.vehicle);
    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'Driver vehicle assignment is not active',
        error_code: 'assignment_compliance_required',
        compliance: this.blockedCompliance('ASSIGNMENT_NOT_ACTIVE', 'Assignment is not active', 'ORGANIZATION'),
      });
    }
    const now = Date.now();
    if (assignment.startsAt && assignment.startsAt.getTime() > now) {
      throw new ForbiddenException({
        message: 'Assignment has not started',
        error_code: 'assignment_window_not_started',
        compliance: this.blockedCompliance('ASSIGNMENT_NOT_STARTED', 'Assignment has not started', 'ORGANIZATION'),
      });
    }
    if (assignment.endsAt && assignment.endsAt.getTime() < now) {
      throw new ForbiddenException({
        message: 'Assignment has expired',
        error_code: 'assignment_expired',
        compliance: this.blockedCompliance('ASSIGNMENT_EXPIRED', 'Assignment has expired', 'ORGANIZATION'),
      });
    }
    if (!assignment.organizationId) {
      return;
    }
    const [organization, link] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: assignment.organizationId } }),
      this.prisma.organizationDriver.findUnique({
        where: { organizationId_driverId: { organizationId: assignment.organizationId, driverId: assignment.driverId } },
      }),
    ]);
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'Organization is not active',
        error_code: 'organization_compliance_required',
        compliance: this.blockedCompliance('ORGANIZATION_NOT_ACTIVE', 'Organization is not active', 'ORGANIZATION'),
      });
    }
    if (!link || link.status !== OrganizationDriverStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'Driver is not active in this organization',
        error_code: 'org_driver_compliance_required',
        compliance: this.blockedCompliance('ORG_DRIVER_NOT_ACTIVE', 'Driver is not active in this organization', 'ORGANIZATION'),
      });
    }
  }

  private async getSelectedOperatingContext(driverId: string): Promise<
    | { id: 'INDIVIDUAL'; type: 'INDIVIDUAL' }
    | { id: string; type: 'ORGANIZATION'; organizationId: string }
    | null
  > {
    const contextId = await this.redis.getClient().get(`driver:${driverId}:operatingContext`);
    if (!contextId) return null;
    if (contextId === 'INDIVIDUAL') return { id: 'INDIVIDUAL', type: 'INDIVIDUAL' };
    if (contextId.startsWith('ORG:')) {
      return { id: contextId, type: 'ORGANIZATION', organizationId: contextId.slice(4) };
    }
    return null;
  }

  private isDriverAndVehicleClear(driver: any, vehicle: any) {
    return (
      driver.kycStatus === KycStatus.APPROVED &&
      driver.complianceStatus === ComplianceStatus.CLEAR &&
      vehicle.status === VehicleStatus.ACTIVE &&
      vehicle.complianceStatus === ComplianceStatus.CLEAR
    );
  }

  private buildContextBlockedReasons(orgActive: boolean, orgDriverStatus: OrganizationDriverStatus, assignmentCount: number) {
    const reasons: Array<{ code: string; message: string; owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM' }> = [];
    if (!orgActive) {
      reasons.push({ code: 'ORGANIZATION_NOT_ACTIVE', message: 'Organization is not active', owner: 'ORGANIZATION' });
    }
    if (orgDriverStatus !== OrganizationDriverStatus.ACTIVE) {
      reasons.push({ code: 'ORG_DRIVER_NOT_ACTIVE', message: 'Driver is not active in this organization', owner: 'ORGANIZATION' });
    }
    if (assignmentCount === 0) {
      reasons.push({ code: 'NO_ORG_VEHICLE', message: 'No organization vehicle is assigned', owner: 'ORGANIZATION' });
    }
    return reasons;
  }

  private blockedCompliance(code: string, message: string, owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM') {
    return {
      canOperate: false,
      blockedReasons: [{ code, message, owner }],
      nextActions: [],
    };
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import { SchedulingServiceClient } from '../clients/scheduling-service.client';
import {
  AssignmentStatus,
  BookingStatus,
  DocumentStatus,
  KycEntityType,
  KycDocumentType,
  OrganizationDriverStatus,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  OrganizationStatus,
  PaymentMethod,
  PaymentStatus,
  TripStatus,
  VehicleStatus,
  VehicleDocumentStatus,
  DriverStatus,
  KycStatus,
  ComplianceStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import {
  ApproveDriverComplianceDto,
  CancelDriverInvitationDto,
  CreateAdminOrganizationDto,
  CreateOrganizationAssignmentDto,
  CreateOrganizationDriverDto,
  CreateOrganizationScheduledTripDto,
  CreateOrganizationInvitationDto,
  CreateOrganizationVehicleDto,
  AssignVehicleDriverDto,
  OrganizationDocumentDto,
  ReviewDocumentDto,
  ReviewKycDto,
  SubmitVehicleKycDto,
  SubmitKycDto,
  UpdateDocumentDetailsDto,
  UpdateOrganizationDriverDto,
  UpdateMemberRoleDto,
  UpdateOrganizationAssignmentDto,
  UpdateOrganizationDetailsDto,
  UpdateOrganizationStatusDto,
  UpdateOrganizationVehicleDto,
  VehicleDocumentUploadDto,
} from '../dto/organizations.dto';

type VehicleDocumentSummary = Array<{ status?: DocumentStatus | string | null }>;
const REQUIRED_VEHICLE_DOCUMENT_TYPES = ['RC', 'INSURANCE', 'POLLUTION_CERTIFICATE', 'FITNESS_CERTIFICATE', 'PERMIT'] as const;

export function summarizeVehicleDocumentStatus(documents: VehicleDocumentSummary): 'MISSING' | DocumentStatus {
  if (!documents.length) return 'MISSING';
  if (documents.some((document) => document.status === DocumentStatus.REJECTED)) return DocumentStatus.REJECTED;
  if (documents.some((document) => document.status === DocumentStatus.EXPIRED)) return DocumentStatus.EXPIRED;
  if (documents.some((document) => document.status === DocumentStatus.PENDING || !document.status)) return DocumentStatus.PENDING;
  return DocumentStatus.APPROVED;
}

export function summarizeVehicleKycStatus(kycRecords: VehicleDocumentSummary): 'MISSING' | DocumentStatus {
  return summarizeVehicleDocumentStatus(kycRecords);
}

export function hasRequiredVehicleDocuments(documents: Array<{ type: string }>): boolean {
  const uploaded = new Set(documents.map((document) => document.type));
  return REQUIRED_VEHICLE_DOCUMENT_TYPES.every((type) => uploaded.has(type));
}

function hasApprovedRequiredVehicleDocuments(documents: Array<{ type: string; status?: DocumentStatus | string | null }>): boolean {
  return REQUIRED_VEHICLE_DOCUMENT_TYPES.every((type) =>
    documents.some((document) => document.type === type && document.status === DocumentStatus.APPROVED),
  );
}

export function buildOrganizationKycVisibilityWhere(organizationId: string, driverIds: string[], vehicleIds: string[]) {
  return {
    OR: [
      { entityType: KycEntityType.ORGANIZATION, entityId: organizationId },
      ...(driverIds.length ? [{ entityType: KycEntityType.DRIVER, entityId: { in: driverIds } }] : []),
      ...(vehicleIds.length ? [{ entityType: KycEntityType.VEHICLE, entityId: { in: vehicleIds } }] : []),
    ],
  };
}

@Controller()
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingClient: SchedulingServiceClient,
  ) {}

  private readonly orgOperatorRoles: OrganizationMemberRole[] = [
    OrganizationMemberRole.OWNER,
    OrganizationMemberRole.ADMIN,
    OrganizationMemberRole.FLEET_MANAGER,
  ];

  // ─── SUPER_ADMIN: Create organization directly ───────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('admin/organizations')
  async adminCreateOrganization(@Req() req: any, @Body() body: CreateAdminOrganizationDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          legalName: body.legalName,
          tradeName: body.tradeName,
          primaryPhone: body.ownerPhone,
          primaryEmail: body.ownerEmail,
          gstin: body.gstin,
          pan: body.pan,
          taxId: body.taxId,
          registrationNo: body.registrationNo,
          planTier: body.planTier ?? 'SOLO',
          status: OrganizationStatus.DRAFT,
          createdById: req.user?.sub,
          metadataJson: { ownerName: body.ownerName },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: req.user?.sub,
          organizationId: organization.id,
          targetType: 'Organization',
          targetId: organization.id,
          action: 'organization.created_by_admin',
          afterJson: organization as any,
          ipAddress: req.ip,
        },
      });
      return { organization };
    });
    return { status: 'ok', data: result };
  }

  // ─── SUPER_ADMIN: List all organizations ─────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/organizations')
  async listOrganizations(@Query('status') status?: OrganizationStatus, @Query('planTier') planTier?: string) {
    const organizations = await this.prisma.organization.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(planTier ? { planTier: planTier as any } : {}),
      },
      include: {
        members: { where: { role: OrganizationMemberRole.OWNER } },
        _count: { select: { drivers: true, vehicles: true, documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { organizations } };
  }

  // ─── SUPER_ADMIN: Get single organization (full details) ─────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/vehicles')
  async adminListVehicles(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: VehicleStatus,
    @Query('documentStatus') documentStatus?: VehicleDocumentStatus | DocumentStatus | 'MISSING',
    @Query('type') type?: string,
  ) {
    const orgVehicles = await this.prisma.organizationVehicle.findMany({
      where: {
        endedAt: null,
        ...(organizationId ? { organizationId } : {}),
        vehicle: {
          ...(status ? { status } : {}),
          ...(type ? { OR: [{ type }, { vehicleType: type }] } : {}),
        },
      },
      include: {
        organization: { select: { id: true, legalName: true, tradeName: true } },
        vehicle: {
          include: {
            documents: true,
            assignments: {
              include: { driver: { include: { user: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const vehicleIds = orgVehicles.map((link) => link.vehicleId);
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.VEHICLE, entityId: { in: vehicleIds } },
      orderBy: { createdAt: 'desc' },
    });
    const vehicles = orgVehicles
      .map((link) => this.toAdminVehicleRow(link, kycRecords.filter((record) => record.entityId === link.vehicleId)))
      .filter((row) => !documentStatus || row.documentStatus === documentStatus);
    return { status: 'ok', data: { vehicles } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/vehicles/:vehicleId')
  async adminGetVehicle(@Param('vehicleId') vehicleId: string, @Query('organizationId') organizationId?: string) {
    const ownership = await this.prisma.organizationVehicle.findFirst({
      where: { vehicleId, endedAt: null, ...(organizationId ? { organizationId } : {}) },
      include: {
        organization: { select: { id: true, legalName: true, tradeName: true } },
        vehicle: {
          include: {
            documents: true,
            assignments: {
              include: { driver: { include: { user: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!ownership) throw new NotFoundException('Vehicle not found');
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.VEHICLE, entityId: vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { vehicle: this.toAdminVehicleRow(ownership, kycRecords), ownership, kycRecords } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/organizations/:organizationId')
  async adminGetOrganization(@Param('organizationId') organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: true,
        drivers: { include: { driver: { include: { user: true } } } },
        vehicles: { include: { vehicle: { include: { documents: true } } } },
        documents: true,
        auditEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const driverIds = organization.drivers.map((link) => link.driverId);
    const vehicleIds = organization.vehicles.map((ownership) => ownership.vehicleId);
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: buildOrganizationKycVisibilityWhere(organizationId, driverIds, vehicleIds),
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { organization, kycRecords } };
  }

  // ─── SUPER_ADMIN: Approve / reject / suspend organization ────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('admin/organizations/:organizationId/status')
  async updateOrganizationStatus(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationStatusDto,
  ) {
    const before = await this.requireOrganization(organizationId);
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        status: body.status,
        rejectionReason: body.reason ?? undefined,
        reviewedAt: new Date(),
        reviewedById: req.user?.sub,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: req.user?.sub,
        organizationId,
        targetType: 'Organization',
        targetId: organizationId,
        action: `organization.status.${body.status.toLowerCase()}`,
        beforeJson: before as any,
        afterJson: organization as any,
        reason: body.reason,
        ipAddress: req.ip,
      },
    });
    return { status: 'ok', data: { organization } };
  }

  // ─── SUPER_ADMIN: Review org document ────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Patch('admin/organizations/:organizationId/documents/:documentId/review')
  async reviewOrgDocument(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: ReviewDocumentDto,
  ) {
    await this.requireOrganization(organizationId);
    const document = await this.prisma.organizationDocument.update({
      where: { id: documentId },
      data: {
        status: body.status as DocumentStatus,
        reviewedAt: new Date(),
        reviewedById: req.user?.sub,
        rejectionNote: body.rejectionNote,
      },
    });
    await this.audit(organizationId, req.user?.sub, `org_document.${body.status.toLowerCase()}`, 'OrganizationDocument', documentId, document);
    return { status: 'ok', data: { document } };
  }

  // ─── SUPER_ADMIN: Approve/suspend driver in org ───────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Patch('admin/organizations/:organizationId/drivers/:driverId/compliance')
  async reviewOrgDriver(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('driverId') driverId: string,
    @Body() body: ApproveDriverComplianceDto,
  ) {
    await this.requireOrganization(organizationId);
    const link = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId } },
    });
    if (!link) throw new NotFoundException('Driver not in this organization');

    const updatedLink = await this.prisma.organizationDriver.update({
      where: { organizationId_driverId: { organizationId, driverId } },
      data: { status: body.status as OrganizationDriverStatus },
    });
    await this.audit(organizationId, req.user?.sub, `org_driver.compliance.${body.status.toLowerCase()}`, 'OrganizationDriver', link.id, updatedLink);
    return { status: 'ok', data: { link: updatedLink } };
  }

  // ─── SUPER_ADMIN: List all drivers globally ──────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/drivers')
  async listAllDrivers(
    @Query('search') search?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('driverStatus') driverStatus?: string,
    @Query('orgLinkStatus') orgLinkStatus?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { user: { phone: { contains: search } } }] }
          : {}),
        ...(kycStatus ? { kycStatus: kycStatus as KycStatus } : {}),
        ...(driverStatus ? { status: driverStatus as DriverStatus } : {}),
        ...(organizationId ? { organizationLinks: { some: { organizationId } } } : {}),
        ...(orgLinkStatus ? { organizationLinks: { some: { status: orgLinkStatus as OrganizationDriverStatus } } } : {}),
      },
      include: {
        user: { select: { id: true, phone: true, email: true, name: true, createdAt: true } },
        organizationLinks: {
          include: { organization: { select: { id: true, legalName: true, tradeName: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        _count: {
          select: {
            vehicles: { where: { status: AssignmentStatus.ACTIVE } },
            scheduledTrips: { where: { status: { in: [TripStatus.OPEN, TripStatus.DEPARTED] } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { status: 'ok', data: { drivers } };
  }

  // ─── SUPER_ADMIN: Approve/reject independent driver KYC ─────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('admin/drivers/:driverId/compliance')
  async reviewIndependentDriverCompliance(
    @Req() req: any,
    @Param('driverId') driverId: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; reason?: string },
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (body.status !== 'APPROVED' && body.status !== 'REJECTED') {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    if (body.status === 'APPROVED') {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { kycStatus: KycStatus.APPROVED, complianceStatus: ComplianceStatus.CLEAR },
      });
      await this.prisma.driverVehicleAssignment.updateMany({
        where: { driverId, status: AssignmentStatus.PENDING_COMPLIANCE, organizationId: null },
        data: { status: AssignmentStatus.ACTIVE, active: true },
      });
    } else {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { kycStatus: KycStatus.REJECTED },
      });
    }

    return { status: 'ok', data: { driverId, approvalStatus: body.status } };
  }

  // ─── SUPER_ADMIN: List all bookings globally ─────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/bookings')
  async listAllBookings(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tripStatus') tripStatus?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('routeId') routeId?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('tripId') tripId?: string,
  ) {
    const departureTo = dateTo ? new Date(dateTo) : undefined;
    if (departureTo) departureTo.setDate(departureTo.getDate() + 1);

    const bookings = await this.prisma.seatBooking.findMany({
      where: {
        ...(tripId ? { tripId } : {}),
        ...(tripStatus || routeId || driverId || vehicleId || organizationId || dateFrom || departureTo
          ? {
              trip: {
                ...(tripStatus ? { status: tripStatus as TripStatus } : {}),
                ...(routeId ? { routeId } : {}),
                ...(driverId ? { driverId } : {}),
                ...(vehicleId ? { vehicleId } : {}),
                ...(dateFrom || departureTo
                  ? {
                      departureAt: {
                        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                        ...(departureTo ? { lt: departureTo } : {}),
                      },
                    }
                  : {}),
                ...(organizationId
                  ? {
                      OR: [
                        { driver: { organizationLinks: { some: { organizationId } } } },
                        { vehicle: { organizationLinks: { some: { organizationId } } } },
                      ],
                    }
                  : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { passengerName: { contains: search, mode: 'insensitive' } },
                { passengerPhone: { contains: search } },
                { id: { contains: search } },
              ],
            }
          : {}),
        ...(status ? { status: status as BookingStatus } : {}),
        ...(paymentStatus ? { paymentStatus: paymentStatus as PaymentStatus } : {}),
        ...(paymentMethod ? { paymentMethod: paymentMethod as PaymentMethod } : {}),
      },
      include: {
        trip: {
          include: {
            route: { select: { id: true, name: true, originLabel: true, destinationLabel: true } },
            driver: {
              include: {
                user: { select: { id: true, phone: true, name: true } },
                organizationLinks: {
                  select: {
                    organization: { select: { id: true, legalName: true, tradeName: true } },
                  },
                  take: 1,
                },
              },
            },
            vehicle: {
              select: {
                id: true,
                plate: true,
                type: true,
                organizationLinks: {
                  select: {
                    organization: { select: { id: true, legalName: true, tradeName: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const withOrganization = bookings.map((booking) => {
      const organization =
        booking.trip.vehicle?.organizationLinks[0]?.organization ??
        booking.trip.driver.organizationLinks[0]?.organization ??
        null;
      const { organizationLinks: driverOrgLinks, ...driver } = booking.trip.driver;
      const vehicle = booking.trip.vehicle
        ? (({ organizationLinks: vehicleOrgLinks, ...rest }) => rest)(booking.trip.vehicle)
        : null;

      return {
        ...booking,
        organization,
        trip: {
          ...booking.trip,
          driver,
          vehicle,
        },
      };
    });
    return { status: 'ok', data: { bookings: withOrganization, total: withOrganization.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/bookings/:bookingId')
  async getAdminBooking(@Param('bookingId') bookingId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: {
        trip: {
          include: {
            route: true,
            driver: { include: { user: { select: { id: true, phone: true, name: true, email: true } } } },
            vehicle: true,
            bookings: { select: { id: true, seatType: true, status: true, passengerName: true, totalFare: true } },
          },
        },
        invoice: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return { status: 'ok', data: { booking } };
  }

  // ─── SUPER_ADMIN: List all registered passengers ──────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/passengers')
  async listPassengers(@Query('search') search?: string) {
    const passengers = await this.prisma.passenger.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { user: { phone: { contains: search } } },
            ],
          }
        : undefined,
      include: {
        user: { select: { id: true, phone: true, name: true, email: true, status: true, createdAt: true } },
        bookings: {
          select: {
            id: true,
            status: true,
            totalFare: true,
            createdAt: true,
          },
        },
      },
      orderBy: { user: { createdAt: 'desc' } },
      take: 500,
    });

    const rows = passengers.map((p) => {
      const bks = p.bookings;
      const sorted = [...bks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        id: p.id,
        userId: p.userId,
        name: p.name ?? p.user.name ?? '',
        phone: p.user.phone,
        email: p.user.email,
        userStatus: p.user.status,
        registeredAt: p.user.createdAt,
        totalBookings: bks.length,
        completedBookings: bks.filter((b) => b.status === 'COMPLETED').length,
        cancelledBookings: bks.filter((b) => b.status === 'CANCELLED').length,
        confirmedBookings: bks.filter((b) => b.status === 'CONFIRMED').length,
        totalSpendPaise: bks
          .filter((b) => b.status !== 'CANCELLED')
          .reduce((sum: number, b) => sum + b.totalFare, 0),
        firstBookingAt: sorted[0]?.createdAt ?? null,
        lastBookingAt: sorted[sorted.length - 1]?.createdAt ?? null,
      };
    });

    return { status: 'ok', data: { passengers: rows, total: rows.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/passengers/:passengerId')
  async getPassengerDetail(@Param('passengerId') passengerId: string) {
    const passenger = await this.prisma.passenger.findUnique({
      where: { id: passengerId },
      include: {
        user: { select: { id: true, phone: true, name: true, email: true, status: true, createdAt: true } },
        bookings: {
          include: {
            trip: {
              include: {
                route: { select: { id: true, name: true, originLabel: true, destinationLabel: true } },
                driver: { select: { id: true, name: true, user: { select: { phone: true } } } },
                vehicle: { select: { id: true, plate: true, type: true } },
              },
            },
            invoice: { select: { id: true, invoiceNo: true, pdfUrl: true, issuedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!passenger) throw new NotFoundException('Passenger not found');

    return {
      status: 'ok',
      data: {
        passenger: {
          id: passenger.id,
          userId: passenger.userId,
          name: passenger.name ?? passenger.user.name ?? '',
          phone: passenger.user.phone,
          email: passenger.user.email,
          userStatus: passenger.user.status,
          registeredAt: passenger.user.createdAt,
        },
        bookings: passenger.bookings,
      },
    };
  }

  // ─── KYC: Submit KYC document (org member or SUPER_ADMIN) ────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/kyc')
  async submitOrgKyc(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Body() body: SubmitKycDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const kycRecord = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.ORGANIZATION,
        entityId: organizationId,
        documentType: body.documentType,
        documentUrl: body.documentUrl,
        documentNo: body.documentNo,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadataJson: body.metadataJson as any,
      },
    });
    await this.audit(organizationId, req.user?.sub, 'org.kyc.submitted', 'KycRecord', kycRecord.id, kycRecord);
    return { status: 'ok', data: { kycRecord } };
  }

  // ─── KYC: Review KYC record (SUPER_ADMIN only) ───────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Patch('admin/kyc/:kycId/review')
  async reviewKyc(@Req() req: any, @Param('kycId') kycId: string, @Body() body: ReviewKycDto) {
    const kycRecord = await this.prisma.kycRecord.update({
      where: { id: kycId },
      data: {
        status: body.status as DocumentStatus,
        reviewedAt: new Date(),
        reviewedById: req.user?.sub,
        rejectionReason: body.rejectionReason,
      },
    });
    if (kycRecord.entityType === KycEntityType.ORGANIZATION) {
      await this.audit(kycRecord.entityId, req.user?.sub, `kyc.${body.status.toLowerCase()}`, 'KycRecord', kycId, kycRecord);
    }
    return { status: 'ok', data: { kycRecord } };
  }

  // ─── KYC: List KYC for org (SUPER_ADMIN or org member) ──────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/kyc')
  async listOrgKyc(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.ORGANIZATION, entityId: organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { kycRecords } };
  }

  // ─── Org: My memberships ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/me')
  async myOrganizations(@Req() req: any) {
    const userId = req.user?.sub;
    const driverId: string | undefined = req.user?.driverId;

    // Admin/owner memberships via OrganizationMember
    const memberRecords = await this.prisma.organizationMember.findMany({
      where: { userId, status: { not: OrganizationMemberStatus.REMOVED } },
      orderBy: { createdAt: 'asc' },
    });

    // Driver fleet memberships via OrganizationDriver
    const driverLinks = driverId
      ? await this.prisma.organizationDriver.findMany({
          where: { driverId, status: { not: OrganizationDriverStatus.REMOVED } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const allOrgIds = [
      ...memberRecords.map((m) => m.organizationId),
      ...driverLinks.map((d) => d.organizationId),
    ];
    const uniqueOrgIds = [...new Set(allOrgIds)];

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: uniqueOrgIds } },
      include: { _count: { select: { drivers: true, vehicles: true } } },
      orderBy: { legalName: 'asc' },
    });

    // memberships: member-role records + driver-role records (normalised to same shape)
    const memberships = [
      ...memberRecords,
      ...driverLinks.map((d) => ({
        organizationId: d.organizationId,
        role: 'DRIVER',
        status: d.status as string,
      })),
    ];

    return { status: 'ok', data: { organizations, memberships } };
  }

  // ─── Org: Get single organization (org member) ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId')
  async getOrganization(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: true,
        drivers: { include: { driver: { include: { user: true } } } },
        vehicles: { include: { vehicle: true } },
        documents: true,
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return { status: 'ok', data: { organization } };
  }

  // ─── Org: Update org details (OWNER/ADMIN member or SUPER_ADMIN) ─────────

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:organizationId')
  async updateOrganization(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationDetailsDto,
  ) {
    const membership = await this.requireOrgOrAdminAccess(req.user, organizationId);
    if (membership && membership.role !== OrganizationMemberRole.OWNER && membership.role !== OrganizationMemberRole.ADMIN) {
      throw new ForbiddenException('OWNER or ADMIN role required to update org details');
    }
    const before = await this.requireOrganization(organizationId);
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        legalName: body.legalName ?? undefined,
        tradeName: body.tradeName ?? undefined,
        gstin: body.gstin ?? undefined,
        pan: body.pan ?? undefined,
        taxId: body.taxId ?? undefined,
        registrationNo: body.registrationNo ?? undefined,
        primaryPhone: body.primaryPhone ?? undefined,
        primaryEmail: body.primaryEmail ?? undefined,
        addressJson: body.addressJson as any,
        operatingRegions: body.operatingRegions as any,
        planTier: body.planTier ?? undefined,
      },
    });
    await this.audit(organizationId, req.user?.sub, 'organization.details_updated', 'Organization', organizationId, { before, after: organization });
    return { status: 'ok', data: { organization } };
  }

  // ─── Org: List members ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/members')
  async listMembers(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId, status: { not: OrganizationMemberStatus.REMOVED } },
      orderBy: { createdAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, phone: true, name: true, email: true, role: true },
    });
    return { status: 'ok', data: { members, users } };
  }

  // ─── Org: Update member role/status ─────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:organizationId/members/:memberId')
  async updateMember(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    const callerMembership = await this.requireOrgOrAdminAccess(req.user, organizationId);
    if (callerMembership && callerMembership.role !== OrganizationMemberRole.OWNER && req.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('OWNER role required to manage members');
    }
    const member = await this.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === OrganizationMemberRole.OWNER && body.status === OrganizationMemberStatus.REMOVED) {
      throw new BadRequestException({ message: 'Cannot remove the owner', error_code: 'owner_protected' });
    }
    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        role: body.role ?? undefined,
        status: body.status ?? undefined,
      },
    });
    await this.audit(organizationId, req.user?.sub, 'org_member.updated', 'OrganizationMember', memberId, updated);
    return { status: 'ok', data: { member: updated } };
  }

  // ─── Org: Audit log ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/audit-log')
  async orgAuditLog(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const take = Math.min(parseInt(limit ?? '50', 10), 100);
    const events = await this.prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { status: 'ok', data: { events, nextCursor: events.length === take ? events[events.length - 1].id : null } };
  }

  // ─── Org: List drivers ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/drivers')
  async listOrganizationDrivers(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const links = await this.prisma.organizationDriver.findMany({
      where: { organizationId },
      include: { driver: { include: { user: true, documents: true, vehicles: { include: { vehicle: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const driverKyc = await this.prisma.kycRecord.findMany({
      where: { entityType: 'DRIVER', entityId: { in: links.map((l) => l.driverId) } },
    });
    return { status: 'ok', data: { links, driverKyc } };
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/drivers/:driverId')
  async getOrganizationDriver(@Req() req: any, @Param('organizationId') organizationId: string, @Param('driverId') driverId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    await this.requireOrgDriver(organizationId, driverId);
    const link = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId } },
      include: {
        driver: {
          include: {
            user: true,
            documents: true,
            vehicles: {
              where: { organizationId },
              include: { vehicle: { include: { documents: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
    });
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { link, kycRecords } };
  }

  // ─── Org: Create driver profile ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/drivers')
  async createOrganizationDriver(@Req() req: any, @Param('organizationId') organizationId: string, @Body() body: CreateOrganizationDriverDto) {
    const membership = await this.requireOrgAccess(req.user?.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role)) {
      throw new ForbiddenException('OWNER, ADMIN, or FLEET_MANAGER role required to add drivers');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { phone: body.phone },
        update: {
          name: body.name,
          email: body.email ?? undefined,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
        },
        create: {
          phone: body.phone,
          name: body.name,
          email: body.email,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
        },
      });
      const driver = await tx.driver.upsert({
        where: { userId: user.id },
        update: { name: body.name },
        create: {
          userId: user.id,
          name: body.name,
          status: DriverStatus.OFFLINE,
          kycStatus: KycStatus.PENDING,
          complianceStatus: ComplianceStatus.CLEAR,
        },
      });
      const link = await tx.organizationDriver.upsert({
        where: { organizationId_driverId: { organizationId, driverId: driver.id } },
        update: {
          status: OrganizationDriverStatus.PENDING_COMPLIANCE,
          invitedById: req.user?.sub,
          metadataJson: { source: 'org_admin_created' },
        },
        create: {
          organizationId,
          driverId: driver.id,
          status: OrganizationDriverStatus.PENDING_COMPLIANCE,
          invitedById: req.user?.sub,
          metadataJson: { source: 'org_admin_created' },
        },
      });
      return { user, driver, link };
    });
    await this.audit(organizationId, req.user?.sub, 'organization.driver.created', 'Driver', result.driver.id, result);
    return { status: 'ok', data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:organizationId/drivers/:driverId')
  async updateOrganizationDriver(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('driverId') driverId: string,
    @Body() body: UpdateOrganizationDriverDto,
  ) {
    const membership = await this.requireOrgAccess(req.user?.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role) && membership.role !== OrganizationMemberRole.COMPLIANCE_MANAGER) {
      throw new ForbiddenException('Organization operator role required to update drivers');
    }
    await this.requireOrgDriver(organizationId, driverId);
    const before = await this.prisma.driver.findUnique({ where: { id: driverId }, include: { user: true } });
    if (!before) throw new NotFoundException('Driver not found');
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        name: body.name ?? undefined,
        status: body.status ?? undefined,
        kycStatus: body.kycStatus ?? undefined,
        complianceStatus: body.complianceStatus ?? undefined,
        user: {
          update: {
            name: body.name ?? undefined,
            email: body.email ?? undefined,
          },
        },
      },
      include: { user: true, documents: true, vehicles: { where: { organizationId }, include: { vehicle: true } } },
    });
    await this.audit(organizationId, req.user?.sub, 'organization.driver.updated', 'Driver', driverId, { before, after: driver });
    return { status: 'ok', data: { driver } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/drivers/:driverId/documents')
  async createDriverDocument(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('driverId') driverId: string,
    @Body() body: OrganizationDocumentDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    await this.requireOrgDriver(organizationId, driverId);
    const document = await this.prisma.driverDocument.create({
      data: {
        driverId,
        type: body.type,
        url: body.url ?? `https://signed-upload.example/organizations/${organizationId}/drivers/${driverId}/${body.type}`,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });
    await this.audit(organizationId, req.user?.sub, 'organization.driver.document_uploaded', 'DriverDocument', document.id, document);
    return { status: 'ok', data: { document } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/drivers/:driverId/kyc')
  async submitDriverKyc(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('driverId') driverId: string,
    @Body() body: SubmitKycDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    await this.requireOrgDriver(organizationId, driverId);
    const existing = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.DRIVER, entityId: driverId, documentType: body.documentType },
    });
    if (existing) {
      throw new ConflictException({
        message: 'This driver KYC document has already been submitted',
        error_code: 'driver_kyc_document_already_submitted',
      });
    }
    const kycRecord = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.DRIVER,
        entityId: driverId,
        documentType: body.documentType,
        documentUrl: body.documentUrl,
        documentNo: body.documentNo,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadataJson: body.metadataJson as any,
      },
    });
    await this.audit(organizationId, req.user?.sub, 'driver.kyc.submitted', 'KycRecord', kycRecord.id, kycRecord);
    return { status: 'ok', data: { kycRecord } };
  }

  // ─── Org: Invite member ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/invitations')
  async createInvitation(@Req() req: any, @Param('organizationId') organizationId: string, @Body() body: CreateOrganizationInvitationDto) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const existing = await this.prisma.organizationInvitation.findFirst({
      where: { organizationId, phone: body.phone, status: 'INVITED' },
      orderBy: { createdAt: 'desc' },
    });

    const inviteToken = randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = existing
      ? await this.prisma.organizationInvitation.update({
          where: { id: existing.id },
          data: { inviteTokenHash: this.hash(inviteToken), expiresAt },
        })
      : await this.prisma.organizationInvitation.create({
          data: {
            organizationId,
            phone: body.phone,
            role: body.role ?? OrganizationMemberRole.DRIVER,
            inviteTokenHash: this.hash(inviteToken),
            expiresAt,
            createdByUserId: req.user?.sub,
          },
        });

    await this.audit(organizationId, req.user?.sub, 'organization.member.invited', 'OrganizationInvitation', invitation.id, invitation);
    return { status: 'ok', data: { invitation, inviteToken, inviteUrl: `/organization-invite/${inviteToken}` } };
  }

  // ─── Org: List invitations ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/invitations')
  async listInvitations(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { invitations } };
  }

  // ─── Org: Refresh invitation link ─────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/invitations/:invitationId/refresh-link')
  async refreshInvitationLink(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundException({ message: 'Invitation not found', error_code: 'invite_not_found' });
    }
    if (invitation.status !== 'INVITED') {
      throw new ConflictException({ message: `Cannot refresh link for invitation with status '${invitation.status}'`, error_code: 'invite_not_refreshable' });
    }

    const inviteToken = randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { inviteTokenHash: this.hash(inviteToken), expiresAt },
    });

    await this.audit(organizationId, req.user?.sub, 'organization.member.invite_refreshed', 'OrganizationInvitation', invitationId, {});
    return { status: 'ok', data: { inviteToken, inviteUrl: `/organization-invite/${inviteToken}`, expiresAt } };
  }

  // ─── Org: Accept invitation (driver) ─────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @Post('organizations/invitations/:inviteToken/accept')
  async acceptInvitation(@Req() req: any, @Param('inviteToken') inviteToken: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { inviteTokenHash: this.hash(inviteToken) } });
    if (!invitation || invitation.status !== 'INVITED' || invitation.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: 'Invitation not found or expired', error_code: 'invite_invalid' });
    }
    if (req.user?.phone !== invitation.phone) {
      throw new ConflictException({ message: 'Invite phone does not match verified phone', error_code: 'invite_phone_mismatch' });
    }
    const driverId = req.user?.driverId;
    if (!driverId) {
      throw new BadRequestException({ message: 'Driver profile required', error_code: 'driver_required' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.organizationDriver.upsert({
        where: { organizationId_driverId: { organizationId: invitation.organizationId, driverId } },
        create: {
          organizationId: invitation.organizationId,
          driverId,
          status: OrganizationDriverStatus.PENDING_COMPLIANCE,
          acceptedAt: new Date(),
          startedAt: new Date(),
          invitedById: invitation.createdByUserId,
        },
        update: { status: OrganizationDriverStatus.PENDING_COMPLIANCE, acceptedAt: new Date() },
      });
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedByUserId: req.user.sub, acceptedAt: new Date() },
      });
      const latestSession = await tx.onboardingSession.findFirst({
        where: { userId: req.user.sub },
        orderBy: { createdAt: 'desc' },
      });
      if (latestSession) {
        await tx.onboardingConsent.create({
          data: {
            scope: 'organization_data_sharing',
            value: 'accepted',
            userId: req.user.sub,
            source: 'organization_invitation',
            sessionId: latestSession.id,
          },
        });
      }
      return link;
    });
    await this.audit(invitation.organizationId, req.user?.sub, 'organization.member.accepted', 'OrganizationDriver', result.id, result);
    return { status: 'ok', data: { organizationDriver: result, nextHint: 'await_compliance_clearance' } };
  }

  // ─── Org: Get invitation details (public — for invite landing page) ───────

  @Get('organizations/invitations/:inviteToken/details')
  async getInvitationDetails(@Param('inviteToken') inviteToken: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { inviteTokenHash: this.hash(inviteToken) },
    });
    if (!invitation || invitation.status !== 'INVITED' || invitation.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: 'Invitation not found or expired', error_code: 'invite_invalid' });
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { id: true, legalName: true, tradeName: true, status: true },
    });
    return { status: 'ok', data: { invitation: { id: invitation.id, phone: invitation.phone, role: invitation.role, expiresAt: invitation.expiresAt }, organization } };
  }

  // ─── Admin: Driver Invitations ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('admin/organizations/:orgId/driver-invitations')
  async createDriverInvitation(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Body() body: CreateOrganizationInvitationDto,
  ) {
    await this.requireOrgOrAdminAccess(req.user, orgId);
    const organization = await this.requireOrganization(orgId);

    const duplicate = await this.prisma.organizationInvitation.findFirst({
      where: { organizationId: orgId, phone: body.phone, status: 'INVITED', expiresAt: { gt: new Date() } },
    });
    if (duplicate) {
      throw new ConflictException({ message: 'An active invitation already exists for this phone number in this organization', error_code: 'invite_duplicate' });
    }

    const rawToken = randomBytes(24).toString('hex');
    const publicInviteRef = randomBytes(12).toString('hex');
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: orgId,
        phone: body.phone,
        role: body.role ?? OrganizationMemberRole.DRIVER,
        publicInviteRef,
        inviteTokenHash: this.hash(rawToken),
        status: 'INVITED',
        expiresAt,
        invitedName: body.name ?? null,
        invitedEmail: body.email ?? null,
        note: body.note ?? null,
        createdByUserId: req.user?.sub,
      },
    });

    await this.audit(orgId, req.user?.sub, 'driver.invitation.created', 'OrganizationInvitation', invitation.id, invitation);

    const inviteLink = this.buildInviteLink(publicInviteRef, rawToken);
    const sharePayload = this.buildDriverInvitationSharePayload(organization, inviteLink);
    return { status: 'ok', data: { invitation: this.safeInvitation(invitation), inviteLink, sharePayload } };
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/organizations/:orgId/driver-invitations')
  async listDriverInvitations(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('phone') phone?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireOrgOrAdminAccess(req.user, orgId);

    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (phone) where.phone = { contains: phone };
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { invitedName: { contains: search, mode: 'insensitive' } },
        { invitedEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, invitations] = await Promise.all([
      this.prisma.organizationInvitation.count({ where }),
      this.prisma.organizationInvitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          organizationId: true,
          phone: true,
          role: true,
          status: true,
          expiresAt: true,
          invitedName: true,
          invitedEmail: true,
          note: true,
          cancelledAt: true,
          cancellationReason: true,
          acceptedAt: true,
          acceptedByUserId: true,
          createdByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      status: 'ok',
      data: { invitations, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/driver-invitations/:id/cancel')
  async cancelDriverInvitation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CancelDriverInvitationDto,
  ) {
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException({ message: 'Invitation not found', error_code: 'invite_not_found' });
    await this.requireOrgOrAdminAccess(req.user, invitation.organizationId);
    if (invitation.status !== 'INVITED') {
      throw new ConflictException({ message: `Cannot cancel invitation with status '${invitation.status}'`, error_code: 'invite_not_cancellable' });
    }

    const updated = await this.prisma.organizationInvitation.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: body.reason ?? null },
    });

    await this.audit(invitation.organizationId, req.user?.sub, 'driver.invitation.cancelled', 'OrganizationInvitation', id, updated);
    return { status: 'ok', data: { invitation: this.safeInvitation(updated) } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/driver-invitations/:id/regenerate-link')
  async regenerateDriverInvitationLink(@Req() req: any, @Param('id') id: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { id },
      include: { organization: { select: { id: true, legalName: true, tradeName: true } } },
    });
    if (!invitation) throw new NotFoundException({ message: 'Invitation not found', error_code: 'invite_not_found' });
    await this.requireOrgOrAdminAccess(req.user, invitation.organizationId);
    if (invitation.status !== 'INVITED') {
      throw new ConflictException({ message: `Cannot regenerate link for invitation with status '${invitation.status}'`, error_code: 'invite_not_regenerable' });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new ConflictException({ message: 'Invitation has expired', error_code: 'invite_expired' });
    }

    const rawToken = randomBytes(24).toString('hex');
    // publicInviteRef is stable across regenerations — only the secret token rotates.
    // Generate one on the fly for older invitations that pre-date this field.
    const publicInviteRef = invitation.publicInviteRef ?? randomBytes(12).toString('hex');
    const updated = await this.prisma.organizationInvitation.update({
      where: { id },
      data: { inviteTokenHash: this.hash(rawToken), publicInviteRef },
    });

    await this.audit(invitation.organizationId, req.user?.sub, 'driver.invitation.link_regenerated', 'OrganizationInvitation', id, updated);

    const inviteLink = this.buildInviteLink(publicInviteRef, rawToken);
    const sharePayload = this.buildDriverInvitationSharePayload(invitation.organization, inviteLink);
    return { status: 'ok', data: { invitation: this.safeInvitation(updated), inviteLink, sharePayload } };
  }

  // ─── Org Admin: Vehicle flow scoped to authenticated organization ────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Post('organizations/me/vehicles')
  async createMyOrganizationVehicle(@Req() req: any, @Body() body: CreateOrganizationVehicleDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const result = await this.createOrganizationVehicleRecord(req.user?.sub, membership.organizationId, body);
    return { status: 'ok', data: result };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Get('organizations/me/vehicles')
  async listMyOrganizationVehicles(@Req() req: any) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const vehicles = await this.findOrganizationVehicles(membership.organizationId);
    return { status: 'ok', data: { vehicles } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Get('organizations/me/vehicles/:vehicleId')
  async getMyOrganizationVehicle(@Req() req: any, @Param('vehicleId') vehicleId: string) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const detail = await this.findOrganizationVehicleDetail(membership.organizationId, vehicleId);
    return { status: 'ok', data: detail };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Patch('organizations/me/vehicles/:vehicleId')
  async updateMyOrganizationVehicle(@Req() req: any, @Param('vehicleId') vehicleId: string, @Body() body: UpdateOrganizationVehicleDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const vehicle = await this.updateOrganizationVehicleRecord(req.user?.sub, membership.organizationId, vehicleId, body, false);
    return { status: 'ok', data: { vehicle } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Post('organizations/me/vehicles/:vehicleId/documents')
  async uploadMyVehicleDocument(@Req() req: any, @Param('vehicleId') vehicleId: string, @Body() body: VehicleDocumentUploadDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const document = await this.createOrganizationVehicleDocumentRecord(req.user?.sub, membership.organizationId, vehicleId, body);
    return { status: 'ok', data: { document } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Post('organizations/me/vehicles/:vehicleId/kyc/submit')
  async submitMyVehicleKyc(@Req() req: any, @Param('vehicleId') vehicleId: string, @Body() body: SubmitVehicleKycDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const kycRecord = await this.submitOrganizationVehicleKycRecord(req.user?.sub, membership.organizationId, vehicleId, body);
    return { status: 'ok', data: { kycRecord } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORG_ADMIN')
  @Post('organizations/me/vehicles/:vehicleId/assign-driver')
  async assignMyVehicleDriver(@Req() req: any, @Param('vehicleId') vehicleId: string, @Body() body: AssignVehicleDriverDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const assignment = await this.assignOrganizationVehicleDriver(req.user?.sub, membership.organizationId, vehicleId, body.driverId);
    return { status: 'ok', data: { assignment } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Patch('admin/vehicles/:vehicleId/kyc/review')
  async reviewVehicleKyc(@Req() req: any, @Param('vehicleId') vehicleId: string, @Body() body: ReviewKycDto) {
    const result = await this.reviewVehicleKycRecord(req.user?.sub, vehicleId, body);
    return { status: 'ok', data: result };
  }

  // ─── SUPER_ADMIN: Review individual vehicle document ─────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('admin/vehicle-documents/:documentId/review')
  async reviewVehicleDocument(@Req() req: any, @Param('documentId') documentId: string, @Body() body: ReviewDocumentDto) {
    const document = await this.prisma.vehicleDocument.update({
      where: { id: documentId },
      data: { status: body.status as DocumentStatus },
    });
    const documents = await this.prisma.vehicleDocument.findMany({ where: { vehicleId: document.vehicleId } });
    await this.prisma.vehicle.update({
      where: { id: document.vehicleId },
      data: { documentStatus: summarizeVehicleDocumentStatus(documents) as VehicleDocumentStatus },
    });
    return { status: 'ok', data: { document } };
  }

  // ─── SUPER_ADMIN: Review individual driver document ───────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('admin/driver-documents/:documentId/review')
  async reviewDriverDocument(@Req() req: any, @Param('documentId') documentId: string, @Body() body: ReviewDocumentDto) {
    const document = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: { status: body.status as DocumentStatus },
    });
    return { status: 'ok', data: { document } };
  }

  // ─── Org admin: Edit vehicle document details ─────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/me/vehicle-documents/:documentId')
  async updateMyVehicleDocument(@Req() req: any, @Param('documentId') documentId: string, @Body() body: UpdateDocumentDetailsDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const doc = await this.prisma.vehicleDocument.findUnique({
      where: { id: documentId },
      include: { vehicle: { include: { organizationLinks: { where: { organizationId: membership.organizationId } } } } },
    });
    if (!doc || !doc.vehicle?.organizationLinks?.length) {
      throw new ForbiddenException('Vehicle document not found in your organization');
    }
    const document = await this.prisma.vehicleDocument.update({
      where: { id: documentId },
      data: {
        documentNo: body.documentNo,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        url: body.url ?? undefined,
        status: DocumentStatus.PENDING,
      },
    });
    return { status: 'ok', data: { document } };
  }

  // ─── Org admin: Edit driver document details ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/me/driver-documents/:documentId')
  async updateMyDriverDocument(@Req() req: any, @Param('documentId') documentId: string, @Body() body: UpdateDocumentDetailsDto) {
    const membership = await this.requireDefaultOrgOperator(req.user);
    const doc = await this.prisma.driverDocument.findUnique({
      where: { id: documentId },
      include: { driver: { include: { organizationLinks: { where: { organizationId: membership.organizationId } } } } },
    });
    if (!doc || !doc.driver?.organizationLinks?.length) {
      throw new ForbiddenException('Driver document not found in your organization');
    }
    const document = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        documentNo: body.documentNo,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        url: body.url ?? undefined,
        status: DocumentStatus.PENDING,
      },
    });
    return { status: 'ok', data: { document } };
  }

  // ─── Org: List vehicles ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/vehicles')
  async listVehicles(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const orgVehicles = await this.prisma.organizationVehicle.findMany({
      where: { organizationId, endedAt: null },
      include: {
        vehicle: {
          include: {
            documents: true,
            assignments: {
              where: { organizationId },
              include: { driver: { include: { user: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { vehicles: orgVehicles } };
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/vehicles/:vehicleId')
  async getOrganizationVehicle(@Req() req: any, @Param('organizationId') organizationId: string, @Param('vehicleId') vehicleId: string) {
    await this.requireOrgOrAdminVehicleAccess(req.user, organizationId, vehicleId);
    const ownership = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
      include: {
        vehicle: {
          include: {
            documents: true,
            assignments: {
              where: { organizationId },
              include: { driver: { include: { user: true, documents: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
    });
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.VEHICLE, entityId: vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'ok', data: { ownership, kycRecords } };
  }

  // ─── Org: Bookings scoped to scheduled trips ─────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/bookings')
  async listOrganizationBookings(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const driverLinks = await this.prisma.organizationDriver.findMany({ where: { organizationId }, select: { driverId: true } });
    const vehicleLinks = await this.prisma.organizationVehicle.findMany({ where: { organizationId }, select: { vehicleId: true } });
    const trips = await this.prisma.scheduledTrip.findMany({
      where: {
        OR: [
          { driverId: { in: driverLinks.map((d) => d.driverId) } },
          { vehicleId: { in: vehicleLinks.map((v) => v.vehicleId) } },
        ],
      },
      include: {
        route: true,
        driver: { include: { user: true } },
        vehicle: true,
        bookings: { include: { passenger: { include: { user: true } }, invoice: true } },
      },
      orderBy: { departureAt: 'desc' },
      take: 100,
    });
    return { status: 'ok', data: { trips, bookings: trips.flatMap((trip) => trip.bookings.map((booking) => ({ ...booking, trip }))) } };
  }

  // ─── Org: Routes available for scheduling ────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/routes')
  async listOrganizationRoutes(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const routes = await this.prisma.route.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return { status: 'ok', data: { routes } };
  }

  // ─── Org: Scheduled trips ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/scheduled-trips')
  async listOrganizationScheduledTrips(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const driverLinks = await this.prisma.organizationDriver.findMany({ where: { organizationId }, select: { driverId: true } });
    const vehicleLinks = await this.prisma.organizationVehicle.findMany({ where: { organizationId }, select: { vehicleId: true } });
    const trips = await this.prisma.scheduledTrip.findMany({
      where: {
        OR: [
          { driverId: { in: driverLinks.map((d) => d.driverId) } },
          { vehicleId: { in: vehicleLinks.map((v) => v.vehicleId) } },
        ],
      },
      include: { route: true, driver: { include: { user: true } }, vehicle: true, bookings: true },
      orderBy: { departureAt: 'desc' },
      take: 100,
    });
    return { status: 'ok', data: { trips } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/scheduled-trips')
  async createOrganizationScheduledTrip(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Body() body: CreateOrganizationScheduledTripDto,
  ) {
    const membership = await this.requireOrgAccess(req.user?.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role)) {
      throw new ForbiddenException('OWNER, ADMIN, or FLEET_MANAGER role required to schedule trips');
    }
    await this.requireOrgDriver(organizationId, body.driverId);
    await this.requireOrgVehicleAccess(req.user?.sub, organizationId, body.vehicleId);
    const assignment = await this.prisma.driverVehicleAssignment.findUnique({
      where: { driverId_vehicleId: { driverId: body.driverId, vehicleId: body.vehicleId } },
    });
    if (!assignment || assignment.organizationId !== organizationId || assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException({ message: 'Active driver-vehicle assignment required before scheduling', error_code: 'active_assignment_required' });
    }

    // Schedule conflict check — runs in the gateway for reliability
    const departureAt = new Date(body.departureAt);
    const route = await this.prisma.route.findUnique({ where: { id: body.routeId } });
    if (!route) throw new BadRequestException({ message: 'Route not found', error_code: 'route_not_found' });
    const newTripEnd = new Date(departureAt.getTime() + (route.estimatedDurationMinutes ?? 24 * 60) * 60 * 1000);
    const candidates = await this.prisma.scheduledTrip.findMany({
      where: {
        OR: [{ driverId: body.driverId }, { vehicleId: body.vehicleId }],
        status: { in: [TripStatus.OPEN, TripStatus.DEPARTED] },
        departureAt: { lt: newTripEnd },
      },
      include: { route: { select: { estimatedDurationMinutes: true } } },
    });
    for (const candidate of candidates) {
      const existingEnd = new Date(candidate.departureAt.getTime() + (candidate.route?.estimatedDurationMinutes ?? 24 * 60) * 60 * 1000);
      if (existingEnd > departureAt) {
        const side = candidate.driverId === body.driverId ? 'Driver' : 'Vehicle';
        throw new ConflictException({
          message: `${side} already has an active trip overlapping this time window`,
          error_code: 'TRIP_SCHEDULE_CONFLICT',
          conflictingTripId: candidate.id,
        });
      }
    }

    const result = await this.schedulingClient.createTrip(body.driverId, {
      routeId: body.routeId,
      vehicleId: body.vehicleId,
      departureAt: body.departureAt,
      frontSeatsTotal: body.frontSeatsTotal ?? 1,
      backSeatsTotal: body.backSeatsTotal ?? 4,
      departurePoint: body.departurePoint,
      luggagePolicy: body.luggagePolicy,
      notes: body.notes,
    });
    const tripId = (result as any)?.tripId ?? (result as any)?.id ?? (result as any)?.trip?.id;
    await this.audit(organizationId, req.user?.sub, 'organization.trip.scheduled', 'ScheduledTrip', tripId ?? 'unknown', result);
    return { status: 'ok', data: result };
  }

  // ─── Org: Stub endpoints — not yet implemented ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/challans')
  async listOrganizationChallans(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    throw new HttpException(
      { statusCode: 501, errorCode: 'challan_tracking_not_implemented', message: 'Challan tracking is not yet implemented' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/clusters')
  async listOrganizationClusters(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    // Org view: open clusters (available to their fleet) + clusters already
    // assigned to one of this organization's drivers.
    const orgDrivers = await this.prisma.organizationDriver.findMany({
      where: { organizationId },
      select: { driverId: true },
    });
    const driverIds = orgDrivers.map((link) => link.driverId);
    const clusters = await (this.prisma as any).clusterGroup.findMany({
      where: {
        OR: [
          { status: 'OPEN', expiresAt: { gt: new Date() } },
          ...(driverIds.length > 0 ? [{ assignedDriverId: { in: driverIds } }] : []),
        ],
      },
      include: { requests: { select: { requestId: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { status: 'ok', data: { clusters } };
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/documents')
  async listOrganizationDocumentCenter(@Req() req: any, @Param('organizationId') organizationId: string) {
    await this.requireOrgOrAdminAccess(req.user, organizationId);
    const [driverLinks, vehicleLinks, organizationDocuments] = await Promise.all([
      this.prisma.organizationDriver.findMany({ where: { organizationId }, select: { driverId: true } }),
      this.prisma.organizationVehicle.findMany({ where: { organizationId, endedAt: null }, select: { vehicleId: true } }),
      this.prisma.organizationDocument.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const driverIds = driverLinks.map((link) => link.driverId);
    const vehicleIds = vehicleLinks.map((link) => link.vehicleId);
    const [driverDocuments, vehicleDocuments, kycRecords] = await Promise.all([
      this.prisma.driverDocument.findMany({ where: { driverId: { in: driverIds } } }),
      this.prisma.vehicleDocument.findMany({ where: { vehicleId: { in: vehicleIds } } }),
      this.prisma.kycRecord.findMany({
        where: {
          OR: [
            { entityType: KycEntityType.ORGANIZATION, entityId: organizationId },
            { entityType: KycEntityType.DRIVER, entityId: { in: driverIds } },
            { entityType: KycEntityType.VEHICLE, entityId: { in: vehicleIds } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { status: 'ok', data: { organizationDocuments, driverDocuments, vehicleDocuments, kycRecords } };
  }

  // ─── Org: Plate check ────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:organizationId/vehicles/plate-check')
  async plateCheck(@Req() req: any, @Param('organizationId') organizationId: string, @Query('plate') rawPlate?: string) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const plate = this.normalizePlate(rawPlate);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { plate } });
    return { status: 'ok', data: { plate, available: !vehicle, conflictVehicleId: vehicle?.id ?? null } };
  }

  // ─── Org: Register vehicle ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/vehicles')
  async createVehicle(@Req() req: any, @Param('organizationId') organizationId: string, @Body() body: CreateOrganizationVehicleDto) {
    const membership = await this.requireOrgAccess(req.user?.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role)) {
      throw new ForbiddenException('OWNER, ADMIN, or FLEET_MANAGER role required to add vehicles');
    }
    const result = await this.createOrganizationVehicleRecord(req.user?.sub, organizationId, body);
    return { status: 'ok', data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:organizationId/vehicles/:vehicleId')
  async updateOrganizationVehicle(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: UpdateOrganizationVehicleDto,
  ) {
    const membership = await this.requireOrgAccess(req.user?.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role) && membership.role !== OrganizationMemberRole.COMPLIANCE_MANAGER) {
      throw new ForbiddenException('Organization operator role required to update vehicles');
    }
    const vehicle = await this.updateOrganizationVehicleRecord(req.user?.sub, organizationId, vehicleId, body, false);
    return { status: 'ok', data: { vehicle } };
  }

  // ─── Org: Upload vehicle document ────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/vehicles/:vehicleId/documents')
  async createVehicleDocument(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: VehicleDocumentUploadDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const document = await this.createOrganizationVehicleDocumentRecord(req.user?.sub, organizationId, vehicleId, body);
    return { status: 'ok', data: { document } };
  }

  // ─── Org: Submit vehicle KYC ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/vehicles/:vehicleId/kyc')
  async submitVehicleKyc(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: SubmitVehicleKycDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const kycRecord = await this.submitOrganizationVehicleKycRecord(req.user?.sub, organizationId, vehicleId, body);
    return { status: 'ok', data: { kycRecord } };
  }

  // ─── Org: Create driver-vehicle assignment ────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:organizationId/assignments')
  async createAssignment(@Req() req: any, @Param('organizationId') organizationId: string, @Body() body: CreateOrganizationAssignmentDto) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const driverLink = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId: body.driverId } },
      include: { driver: true },
    });
    if (!driverLink || driverLink.status !== OrganizationDriverStatus.ACTIVE || (driverLink.driver.status !== DriverStatus.ONLINE && driverLink.driver.status !== DriverStatus.OFFLINE)) {
      throw new BadRequestException({ message: 'Driver must belong to this organization and be active', error_code: 'org_driver_not_active' });
    }
    const ownership = await this.requireOrgVehicleById(organizationId, body.vehicleId);
    if (ownership.vehicle.status !== VehicleStatus.ACTIVE || ownership.vehicle.kycStatus !== KycStatus.APPROVED) {
      throw new BadRequestException({ message: 'Vehicle must be ACTIVE with APPROVED KYC before assignment', error_code: 'vehicle_not_approved_for_assignment' });
    }
    if (body.startsAt && body.endsAt && new Date(body.startsAt).getTime() >= new Date(body.endsAt).getTime()) {
      throw new BadRequestException({ message: 'startsAt must be before endsAt', error_code: 'invalid_assignment_window' });
    }
    const driverAlreadyAssigned = await this.prisma.driverVehicleAssignment.findFirst({
      where: { organizationId, driverId: body.driverId, active: true, NOT: { vehicleId: body.vehicleId } },
      include: { vehicle: { select: { plate: true } } },
    });
    if (driverAlreadyAssigned) {
      throw new ConflictException({
        message: `Driver is already assigned to vehicle ${driverAlreadyAssigned.vehicle?.plate ?? driverAlreadyAssigned.vehicleId}. Unassign them first.`,
        error_code: 'driver_already_assigned',
      });
    }
    const vehicleAlreadyAssigned = await this.prisma.driverVehicleAssignment.findFirst({
      where: { organizationId, vehicleId: body.vehicleId, active: true, NOT: { driverId: body.driverId } },
      include: { driver: { select: { name: true } } },
    });
    if (vehicleAlreadyAssigned) {
      throw new ConflictException({
        message: `Vehicle is already assigned to driver ${vehicleAlreadyAssigned.driver?.name ?? vehicleAlreadyAssigned.driverId}. Unassign them first.`,
        error_code: 'vehicle_already_assigned',
      });
    }
    const overlapping = await this.prisma.driverVehicleAssignment.findFirst({
      where: {
        organizationId,
        vehicleId: body.vehicleId,
        status: { in: [AssignmentStatus.ACTIVE, AssignmentStatus.PENDING_COMPLIANCE] },
        endsAt: body.startsAt ? { gte: new Date(body.startsAt) } : undefined,
      },
    });
    if (overlapping && body.policy === 'SHIFT') {
      throw new ConflictException({ message: 'Overlapping assignment for this vehicle', error_code: 'assignment_overlap' });
    }
    const assignment = await this.prisma.$transaction(async (tx) => {
      await tx.driverVehicleAssignment.updateMany({
        where: {
          organizationId,
          active: true,
          OR: [{ driverId: body.driverId }, { vehicleId: body.vehicleId }],
          NOT: { driverId: body.driverId, vehicleId: body.vehicleId },
        },
        data: { active: false, status: AssignmentStatus.ENDED, endsAt: new Date() },
      });
      return tx.driverVehicleAssignment.upsert({
        where: { driverId_vehicleId: { driverId: body.driverId, vehicleId: body.vehicleId } },
        create: {
          driverId: body.driverId,
          vehicleId: body.vehicleId,
          organizationId,
          assignedByUserId: req.user?.sub,
          status: AssignmentStatus.ACTIVE,
          active: true,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          source: 'ORGANIZATION',
          policyJson: { policy: body.policy ?? 'PERMANENT' },
        },
        update: {
          organizationId,
          assignedByUserId: req.user?.sub,
          status: AssignmentStatus.ACTIVE,
          active: true,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          source: 'ORGANIZATION',
          policyJson: { policy: body.policy ?? 'PERMANENT' },
        },
      });
    });
    await this.audit(organizationId, req.user?.sub, 'driver_vehicle_assignment.created', 'DriverVehicleAssignment', assignment.id, assignment);
    return { status: 'ok', data: { assignment } };
  }

  // ─── Org: Update assignment ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:organizationId/assignments/:assignmentId')
  async updateAssignment(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: UpdateOrganizationAssignmentDto,
  ) {
    await this.requireOrgAccess(req.user?.sub, organizationId);
    const before = await this.prisma.driverVehicleAssignment.findFirst({ where: { id: assignmentId, organizationId } });
    if (!before) throw new NotFoundException('Assignment not found');
    if (body.status === AssignmentStatus.ACTIVE) {
      const [ownership, driverLink] = await Promise.all([
        this.requireOrgVehicleById(organizationId, before.vehicleId),
        this.prisma.organizationDriver.findUnique({
          where: { organizationId_driverId: { organizationId, driverId: before.driverId } },
          include: { driver: true },
        }),
      ]);
      if (ownership.vehicle.status !== VehicleStatus.ACTIVE || ownership.vehicle.kycStatus !== KycStatus.APPROVED) {
        throw new BadRequestException({ message: 'Vehicle must be ACTIVE with APPROVED KYC before assignment', error_code: 'vehicle_not_approved_for_assignment' });
      }
      if (!driverLink || driverLink.status !== OrganizationDriverStatus.ACTIVE || (driverLink.driver.status !== DriverStatus.ONLINE && driverLink.driver.status !== DriverStatus.OFFLINE)) {
        throw new BadRequestException({ message: 'Driver must belong to this organization and be active', error_code: 'org_driver_not_active' });
      }
    }
    const assignment = await this.prisma.$transaction(async (tx) => {
      if (body.status === AssignmentStatus.ACTIVE) {
        await tx.driverVehicleAssignment.updateMany({
          where: {
            organizationId,
            active: true,
            id: { not: assignmentId },
            OR: [{ driverId: before.driverId }, { vehicleId: before.vehicleId }],
          },
          data: { active: false, status: AssignmentStatus.ENDED, endsAt: new Date() },
        });
      }
      return tx.driverVehicleAssignment.update({
        where: { id: assignmentId },
        data: {
          status: body.status,
          active: body.status === AssignmentStatus.ACTIVE,
          startsAt: body.status === AssignmentStatus.ACTIVE && !before.startsAt ? new Date() : undefined,
          endsAt: body.status === AssignmentStatus.ENDED || body.status === AssignmentStatus.SUSPENDED ? new Date() : undefined,
        },
      });
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: req.user?.sub,
        organizationId,
        targetType: 'DriverVehicleAssignment',
        targetId: assignmentId,
        action: `driver_vehicle_assignment.${body.status.toLowerCase()}`,
        beforeJson: before as any,
        afterJson: assignment as any,
        reason: body.reason,
        ipAddress: req.ip,
      },
    });
    return { status: 'ok', data: { assignment } };
  }

  // ─── Driver invitation helpers ────────────────────────────────────────────

  private buildInviteLink(publicInviteRef: string, rawToken: string): string {
    const base = (process.env.PWA_BASE_URL ?? 'http://localhost:3010').replace(/\/$/, '');
    return `${base}/organization-invite?ref=${publicInviteRef}&token=${rawToken}`;
  }

  private buildDriverInvitationSharePayload(
    organization: { legalName: string; tradeName?: string | null },
    inviteLink: string,
  ) {
    const orgName = organization.tradeName ?? organization.legalName;
    const text = `You're invited to join ${orgName} as a driver on MoveOS. Open this link to verify your mobile number and complete onboarding: ${inviteLink}`;
    return { text, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`, inviteLink };
  }

  private safeInvitation(invitation: Record<string, unknown>) {
    const { inviteTokenHash: _hash, ...safe } = invitation;
    return safe;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async requireOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  private async requireOrgAccess(userId: string | undefined, organizationId: string) {
    if (!userId) throw new UnauthorizedException('Missing user');
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || membership.status !== OrganizationMemberStatus.ACTIVE) {
      throw new UnauthorizedException('Organization access required');
    }
    return membership;
  }

  private toAdminVehicleRow(link: any, kycRecords: any[]) {
    const activeAssignment = link.vehicle?.assignments?.find((assignment: any) => assignment.active && assignment.status === AssignmentStatus.ACTIVE)
      ?? link.vehicle?.assignments?.find((assignment: any) => assignment.active)
      ?? null;
    return {
      id: link.id,
      organizationId: link.organizationId,
      vehicleId: link.vehicleId,
      vehicleNumber: link.vehicle?.vehicleNumber ?? link.vehicle?.plate,
      type: link.vehicle?.vehicleType ?? link.vehicle?.type,
      capacity: link.vehicle?.totalSeats ?? this.readVehicleCapacity(link.metadataJson),
      frontSeats: link.vehicle?.frontSeats ?? null,
      backSeats: link.vehicle?.backSeats ?? null,
      luggageCapacityKg: link.vehicle?.luggageCapacityKg ?? null,
      ownerOrganization: link.organization
        ? { id: link.organization.id, name: link.organization.tradeName ?? link.organization.legalName }
        : null,
      assignedDriver: activeAssignment?.driver
        ? {
            id: activeAssignment.driver.id,
            name: activeAssignment.driver.name,
            phone: activeAssignment.driver.user?.phone,
            assignmentId: activeAssignment.id,
            assignmentStatus: activeAssignment.status,
          }
        : null,
      documentStatus: summarizeVehicleDocumentStatus(link.vehicle?.documents ?? []),
      kycStatus: kycRecords.length ? summarizeVehicleKycStatus(kycRecords) : link.vehicle?.kycStatus,
      status: link.vehicle?.status,
      complianceStatus: link.vehicle?.complianceStatus,
      ownershipType: link.ownershipType,
      createdAt: link.vehicle?.createdAt,
      organizationLinkCreatedAt: link.createdAt,
      vehicle: link.vehicle,
      documents: link.vehicle?.documents ?? [],
      kycRecords,
    };
  }

  private readVehicleCapacity(metadataJson: unknown) {
    if (!metadataJson || typeof metadataJson !== 'object') return null;
    const record = metadataJson as Record<string, unknown>;
    const capacity = record.capacity ?? record.seatingCapacity ?? record.seats;
    return typeof capacity === 'number' || typeof capacity === 'string' ? capacity : null;
  }

  private async requireDefaultOrgOperator(user: any) {
    if (!user?.sub) throw new UnauthorizedException('Missing user');
    if (user.role !== 'ORG_ADMIN') {
      throw new ForbiddenException('ORG_ADMIN role required');
    }
    const organizationId = user.defaultOrganizationId ?? user.organizationIds?.[0];
    if (!organizationId) {
      throw new ForbiddenException('Organization admin membership required');
    }
    const membership = await this.requireOrgAccess(user.sub, organizationId);
    if (!this.orgOperatorRoles.includes(membership.role)) {
      throw new ForbiddenException('OWNER, ADMIN, or FLEET_MANAGER role required');
    }
    return membership;
  }

  private vehicleCreateData(body: CreateOrganizationVehicleDto) {
    const vehicleNumber = (body.vehicleNumber ?? body.plate ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const vehicleType = (body.vehicleType ?? body.type ?? '').trim();
    if (!vehicleNumber) {
      throw new BadRequestException({ message: 'vehicleNumber is required', error_code: 'vehicle_number_required' });
    }
    if (!vehicleType) {
      throw new BadRequestException({ message: 'vehicleType is required', error_code: 'vehicle_type_required' });
    }
    if (!body.totalSeats || body.frontSeats + body.backSeats > body.totalSeats) {
      throw new BadRequestException({ message: 'Seat capacity is invalid', error_code: 'invalid_vehicle_capacity' });
    }
    return {
      plate: vehicleNumber,
      type: vehicleType,
      vehicleNumber,
      vehicleType,
      fuelType: body.fuelType,
      make: body.make,
      model: body.model,
      variant: body.variant,
      manufacturingYear: body.manufacturingYear,
      registrationDate: body.registrationDate ? new Date(body.registrationDate) : undefined,
      registrationState: body.registrationState,
      chassisNumber: body.chassisNumber,
      engineNumber: body.engineNumber,
      color: body.color,
      totalSeats: body.totalSeats,
      frontSeats: body.frontSeats,
      backSeats: body.backSeats,
      luggageCapacityKg: body.luggageCapacityKg,
      ownershipType: body.ownershipType ?? 'ORGANIZATION',
      ownerName: body.ownerName,
      ownerPhone: body.ownerPhone,
      ownerAddress: body.ownerAddress,
      commercialPermitNumber: body.commercialPermitNumber,
      permitValidFrom: body.permitValidFrom ? new Date(body.permitValidFrom) : undefined,
      permitValidTill: body.permitValidTill ? new Date(body.permitValidTill) : undefined,
      fitnessCertificateNumber: body.fitnessCertificateNumber,
      fitnessValidTill: body.fitnessValidTill ? new Date(body.fitnessValidTill) : undefined,
      pollutionCertificateNumber: body.pollutionCertificateNumber,
      pollutionValidTill: body.pollutionValidTill ? new Date(body.pollutionValidTill) : undefined,
      insurancePolicyNumber: body.insurancePolicyNumber,
      insuranceValidTill: body.insuranceValidTill ? new Date(body.insuranceValidTill) : undefined,
      status: VehicleStatus.INACTIVE,
      documentStatus: VehicleDocumentStatus.MISSING,
      kycStatus: KycStatus.NOT_SUBMITTED,
    };
  }

  private vehicleUpdateData(body: UpdateOrganizationVehicleDto, allowLifecycleFields: boolean) {
    const vehicleNumber = (body.vehicleNumber ?? body.plate)?.trim().toUpperCase().replace(/\s+/g, '');
    const vehicleType = (body.vehicleType ?? body.type)?.trim();
    const data: any = {
      ...(vehicleNumber ? { plate: vehicleNumber, vehicleNumber } : {}),
      ...(vehicleType ? { type: vehicleType, vehicleType } : {}),
      fuelType: body.fuelType,
      make: body.make,
      model: body.model,
      variant: body.variant,
      manufacturingYear: body.manufacturingYear,
      registrationDate: body.registrationDate ? new Date(body.registrationDate) : undefined,
      registrationState: body.registrationState,
      chassisNumber: body.chassisNumber,
      engineNumber: body.engineNumber,
      color: body.color,
      totalSeats: body.totalSeats,
      frontSeats: body.frontSeats,
      backSeats: body.backSeats,
      luggageCapacityKg: body.luggageCapacityKg,
      ownershipType: body.ownershipType,
      ownerName: body.ownerName,
      ownerPhone: body.ownerPhone,
      ownerAddress: body.ownerAddress,
      commercialPermitNumber: body.commercialPermitNumber,
      permitValidFrom: body.permitValidFrom ? new Date(body.permitValidFrom) : undefined,
      permitValidTill: body.permitValidTill ? new Date(body.permitValidTill) : undefined,
      fitnessCertificateNumber: body.fitnessCertificateNumber,
      fitnessValidTill: body.fitnessValidTill ? new Date(body.fitnessValidTill) : undefined,
      pollutionCertificateNumber: body.pollutionCertificateNumber,
      pollutionValidTill: body.pollutionValidTill ? new Date(body.pollutionValidTill) : undefined,
      insurancePolicyNumber: body.insurancePolicyNumber,
      insuranceValidTill: body.insuranceValidTill ? new Date(body.insuranceValidTill) : undefined,
      complianceStatus: body.complianceStatus,
    };
    if (allowLifecycleFields) {
      data.status = body.status;
      data.documentStatus = body.documentStatus;
      data.kycStatus = body.kycStatus;
    }
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    if (data.totalSeats !== undefined || data.frontSeats !== undefined || data.backSeats !== undefined) {
      const total = data.totalSeats;
      const front = data.frontSeats;
      const back = data.backSeats;
      if (total !== undefined && front !== undefined && back !== undefined && front + back > total) {
        throw new BadRequestException({ message: 'Seat capacity is invalid', error_code: 'invalid_vehicle_capacity' });
      }
    }
    return data;
  }

  private async createOrganizationVehicleRecord(actorUserId: string | undefined, organizationId: string, body: CreateOrganizationVehicleDto) {
    const data = this.vehicleCreateData(body);
    const existing = await this.prisma.vehicle.findFirst({
      where: { OR: [{ plate: data.plate }, { vehicleNumber: data.vehicleNumber }] },
    });
    if (existing) {
      throw new ConflictException({ message: 'Vehicle number already exists', error_code: 'vehicle_number_duplicate' });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data });
      const ownership = await tx.organizationVehicle.create({
        data: {
          organizationId,
          vehicleId: vehicle.id,
          ownershipType: data.ownershipType,
          status: 'ACTIVE',
        },
        include: { organization: true, vehicle: true },
      });
      return { vehicle, ownership };
    });
    await this.audit(organizationId, actorUserId, 'organization.vehicle.created', 'Vehicle', result.vehicle.id, result);
    return result;
  }

  private findOrganizationVehicles(organizationId: string) {
    return this.prisma.organizationVehicle.findMany({
      where: { organizationId, endedAt: null },
      include: {
        organization: { select: { id: true, legalName: true, tradeName: true, status: true } },
        vehicle: {
          include: {
            documents: true,
            assignments: {
              where: { organizationId },
              include: { driver: { include: { user: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOrganizationVehicleDetail(organizationId: string, vehicleId: string) {
    const ownership = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
      include: {
        organization: { select: { id: true, legalName: true, tradeName: true, status: true } },
        vehicle: {
          include: {
            documents: true,
            assignments: {
              where: { organizationId },
              include: { driver: { include: { user: true, documents: true } } },
              orderBy: [{ active: 'desc' }, { startsAt: 'desc' }],
            },
          },
        },
      },
    });
    if (!ownership || ownership.endedAt) {
      throw new NotFoundException('Vehicle not found in this organization');
    }
    const kycRecords = await this.prisma.kycRecord.findMany({
      where: { entityType: KycEntityType.VEHICLE, entityId: vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return { ownership, kycRecords };
  }

  private async updateOrganizationVehicleRecord(actorUserId: string | undefined, organizationId: string, vehicleId: string, body: UpdateOrganizationVehicleDto, allowLifecycleFields: boolean) {
    await this.requireOrgVehicleById(organizationId, vehicleId);
    const data = this.vehicleUpdateData(body, allowLifecycleFields);
    if (!allowLifecycleFields && body.status === VehicleStatus.ACTIVE) {
      throw new BadRequestException({ message: 'Vehicle activation requires approved KYC', error_code: 'vehicle_activation_requires_kyc' });
    }
    if (data.plate || data.vehicleNumber) {
      const existing = await this.prisma.vehicle.findFirst({
        where: { id: { not: vehicleId }, OR: [{ plate: data.plate }, { vehicleNumber: data.vehicleNumber }] },
      });
      if (existing) {
        throw new ConflictException({ message: 'Vehicle number already exists', error_code: 'vehicle_number_duplicate' });
      }
    }
    const vehicle = await this.prisma.vehicle.update({ where: { id: vehicleId }, data });
    if (body.ownershipType) {
      await this.prisma.organizationVehicle.update({
        where: { organizationId_vehicleId: { organizationId, vehicleId } },
        data: { ownershipType: body.ownershipType },
      });
    }
    await this.audit(organizationId, actorUserId, 'organization.vehicle.updated', 'Vehicle', vehicleId, vehicle);
    return vehicle;
  }

  private async createOrganizationVehicleDocumentRecord(actorUserId: string | undefined, organizationId: string, vehicleId: string, body: VehicleDocumentUploadDto) {
    await this.requireOrgVehicleById(organizationId, vehicleId);
    if (!body.url && !body.fileUuid) {
      throw new BadRequestException({ message: 'url or fileUuid is required', error_code: 'vehicle_document_reference_required' });
    }
    const document = await this.prisma.vehicleDocument.create({
      data: {
        vehicleId,
        type: body.type,
        url: body.url ?? `urn:moveos:file:${body.fileUuid}`,
        documentNo: body.documentNo,
        status: DocumentStatus.PENDING,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });
    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { documentStatus: VehicleDocumentStatus.PENDING } });
    await this.audit(organizationId, actorUserId, 'organization.vehicle.document_uploaded', 'VehicleDocument', document.id, { document, metadataJson: body.metadataJson, documentNo: body.documentNo });
    return document;
  }

  private async submitOrganizationVehicleKycRecord(actorUserId: string | undefined, organizationId: string, vehicleId: string, body: SubmitVehicleKycDto) {
    await this.requireOrgVehicleById(organizationId, vehicleId);
    const documents = await this.prisma.vehicleDocument.findMany({ where: { vehicleId } });
    if (!hasRequiredVehicleDocuments(documents)) {
      throw new BadRequestException({
        message: `Required vehicle documents missing: ${REQUIRED_VEHICLE_DOCUMENT_TYPES.filter((type) => !documents.some((doc) => doc.type === type)).join(', ')}`,
        error_code: 'vehicle_required_documents_missing',
      });
    }
    const existingPending = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.VEHICLE, entityId: vehicleId, status: DocumentStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException({ message: 'Vehicle KYC is already pending review', error_code: 'vehicle_kyc_pending_duplicate' });
    }
    const kycRecord = await this.prisma.kycRecord.create({
      data: {
        entityType: KycEntityType.VEHICLE,
        entityId: vehicleId,
        documentType: KycDocumentType.VEHICLE_REGISTRATION,
        documentUrl: documents.find((document) => document.type === 'RC')?.url ?? `urn:moveos:vehicle:${vehicleId}`,
        status: DocumentStatus.PENDING,
        metadataJson: { ...(body.metadataJson ?? {}), requiredDocumentTypes: [...REQUIRED_VEHICLE_DOCUMENT_TYPES] },
      },
    });
    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { kycStatus: KycStatus.PENDING, status: VehicleStatus.INACTIVE } });
    await this.audit(organizationId, actorUserId, 'organization.vehicle.kyc_submitted', 'KycRecord', kycRecord.id, kycRecord);
    return kycRecord;
  }

  private async assignOrganizationVehicleDriver(actorUserId: string | undefined, organizationId: string, vehicleId: string, driverId: string) {
    const ownership = await this.requireOrgVehicleById(organizationId, vehicleId);
    const vehicle = ownership.vehicle;
    if (vehicle.status !== VehicleStatus.ACTIVE || vehicle.kycStatus !== KycStatus.APPROVED) {
      throw new BadRequestException({ message: 'Vehicle must be ACTIVE with APPROVED KYC before assignment', error_code: 'vehicle_not_approved_for_assignment' });
    }
    const driverLink = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId } },
      include: { driver: true },
    });
    if (!driverLink || driverLink.status !== OrganizationDriverStatus.ACTIVE || driverLink.driver.status !== DriverStatus.ONLINE && driverLink.driver.status !== DriverStatus.OFFLINE) {
      throw new BadRequestException({ message: 'Driver must belong to this organization and be active', error_code: 'org_driver_not_active' });
    }
    const assignment = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // End any existing active assignment on this vehicle (previous driver gets unassigned)
      await tx.driverVehicleAssignment.updateMany({ where: { vehicleId, active: true }, data: { active: false, status: AssignmentStatus.ENDED, endsAt: now } });
      // End any active assignment this driver has on a different vehicle (one driver, one vehicle)
      await tx.driverVehicleAssignment.updateMany({ where: { driverId, active: true, vehicleId: { not: vehicleId } }, data: { active: false, status: AssignmentStatus.ENDED, endsAt: now } });
      return tx.driverVehicleAssignment.upsert({
        where: { driverId_vehicleId: { driverId, vehicleId } },
        create: { driverId, vehicleId, organizationId, assignedByUserId: actorUserId, status: AssignmentStatus.ACTIVE, active: true, startsAt: new Date(), source: 'organization_admin' },
        update: { organizationId, assignedByUserId: actorUserId, status: AssignmentStatus.ACTIVE, active: true, startsAt: new Date(), endsAt: null, source: 'organization_admin' },
        include: { driver: { include: { user: true } }, vehicle: true },
      });
    });
    await this.audit(organizationId, actorUserId, 'organization.vehicle.driver_assigned', 'DriverVehicleAssignment', assignment.id, assignment);
    return assignment;
  }

  private async reviewVehicleKycRecord(actorUserId: string | undefined, vehicleId: string, body: ReviewKycDto) {
    if (body.status !== DocumentStatus.APPROVED && body.status !== DocumentStatus.REJECTED) {
      throw new BadRequestException({ message: 'Vehicle KYC review status must be APPROVED or REJECTED', error_code: 'invalid_vehicle_kyc_review_status' });
    }
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { documents: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (body.status === DocumentStatus.APPROVED && !hasApprovedRequiredVehicleDocuments(vehicle.documents)) {
      const missing = REQUIRED_VEHICLE_DOCUMENT_TYPES.filter((type) =>
        !vehicle.documents.some((document) => document.type === type && document.status === DocumentStatus.APPROVED),
      );
      throw new BadRequestException({
        message: `Required vehicle documents must be approved first: ${missing.join(', ')}`,
        error_code: 'vehicle_required_documents_not_approved',
      });
    }

    const kycRecord = await this.prisma.kycRecord.findFirst({
      where: { entityType: KycEntityType.VEHICLE, entityId: vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    const approved = body.status === DocumentStatus.APPROVED;
    const updatedKyc = kycRecord
      ? await this.prisma.kycRecord.update({
          where: { id: kycRecord.id },
          data: { status: body.status, reviewedAt: new Date(), reviewedById: actorUserId, rejectionReason: body.rejectionReason },
        })
      : await this.prisma.kycRecord.create({
          data: {
            entityType: KycEntityType.VEHICLE,
            entityId: vehicleId,
            documentType: KycDocumentType.VEHICLE_REGISTRATION,
            documentUrl: vehicle.documents.find((document) => document.type === 'RC')?.url ?? `urn:moveos:vehicle:${vehicleId}`,
            status: body.status,
            reviewedAt: new Date(),
            reviewedById: actorUserId,
            rejectionReason: body.rejectionReason,
            metadataJson: { requiredDocumentTypes: [...REQUIRED_VEHICLE_DOCUMENT_TYPES], source: 'super_admin_review' },
          },
        });
    const updatedVehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        kycStatus: approved ? KycStatus.APPROVED : KycStatus.REJECTED,
        documentStatus: approved ? VehicleDocumentStatus.APPROVED : VehicleDocumentStatus.REJECTED,
        status: approved ? VehicleStatus.ACTIVE : VehicleStatus.INACTIVE,
      },
    });
    if (approved) {
      await this.prisma.vehicleDocument.updateMany({ where: { vehicleId }, data: { status: DocumentStatus.APPROVED } });
    }
    return { kycRecord: updatedKyc, vehicle: updatedVehicle };
  }

  private async requireOrgVehicleById(organizationId: string, vehicleId: string) {
    const ownership = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
      include: { vehicle: true },
    });
    if (!ownership || ownership.endedAt) {
      throw new BadRequestException({ message: 'Vehicle not in this organization', error_code: 'org_vehicle_required' });
    }
    return ownership;
  }

  private async requireOrgOrAdminAccess(user: any, organizationId: string): Promise<{ role: OrganizationMemberRole | 'DRIVER' } | null> {
    if (!user?.sub) throw new UnauthorizedException('Missing user');
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return null;
    if (user.role === 'DRIVER' && user.driverId) {
      const driverLink = await this.prisma.organizationDriver.findUnique({
        where: { organizationId_driverId: { organizationId, driverId: user.driverId } },
      });
      if (driverLink && driverLink.status !== OrganizationDriverStatus.REMOVED) {
        return { role: OrganizationMemberRole.DRIVER };
      }
    }
    return this.requireOrgAccess(user.sub, organizationId);
  }

  private async requireOrgOrAdminVehicleAccess(user: any, organizationId: string, vehicleId: string) {
    if (!user?.sub) throw new UnauthorizedException('Missing user');
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      await this.requireOrgAccess(user.sub, organizationId);
    }
    const ownership = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
    });
    if (!ownership || ownership.endedAt) {
      throw new BadRequestException({ message: 'Vehicle not in this organization', error_code: 'org_vehicle_required' });
    }
    return ownership;
  }

  private async requireOrgDriver(organizationId: string, driverId: string) {
    const link = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId } },
    });
    if (!link || link.status === OrganizationDriverStatus.REMOVED || link.status === OrganizationDriverStatus.SUSPENDED) {
      throw new BadRequestException({ message: 'Driver is not active in this organization', error_code: 'org_driver_required' });
    }
    return link;
  }

  private async requireOrgVehicleAccess(userId: string | undefined, organizationId: string, vehicleId: string) {
    await this.requireOrgAccess(userId, organizationId);
    const ownership = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
    });
    if (!ownership || ownership.endedAt) {
      throw new BadRequestException({ message: 'Vehicle not in this organization', error_code: 'org_vehicle_required' });
    }
    return ownership;
  }

  private normalizePlate(value?: string) {
    const plate = (value ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!plate) throw new BadRequestException('Vehicle plate is required');
    return plate;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async audit(
    organizationId: string,
    actorUserId: string | undefined,
    action: string,
    targetType: string,
    targetId: string | null,
    afterJson: unknown,
  ) {
    await this.prisma.auditEvent.create({
      data: { actorUserId, organizationId, targetType, targetId, action, afterJson: afterJson as any },
    });
  }
}

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
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService, RolesGuard, Roles } from '@common/index';
import { AssignmentStatus, KycStatus, OrganizationDriverStatus, OrganizationMemberStatus, VehicleStatus } from '@prisma/client';
import { AssignDriverToVehicleDto, RemoveAssignmentDto, SuspendAssignmentDto } from '../dto/vehicle-driver-assignments.dto';

const MANDATORY_DRIVER_DOC_TYPES = ['DRIVING_LICENSE'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ORG_ADMIN')
@Controller('admin/organizations/:orgId')
export class VehicleDriverAssignmentsController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Access helpers ─────────────────────────────────────────────────────────

  private async requireOrgOrSuperAdmin(req: any, orgId: string) {
    if (req.user?.role === 'SUPER_ADMIN') return;
    if (!req.user?.sub) throw new UnauthorizedException('Missing user');
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.user.sub } },
    });
    if (!membership || membership.status !== OrganizationMemberStatus.ACTIVE) {
      throw new ForbiddenException('Organization access required');
    }
  }

  private async requireVehicleInOrg(orgId: string, vehicleId: string) {
    const link = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId: orgId, vehicleId } },
      include: { vehicle: true },
    });
    if (!link) throw new NotFoundException({ message: 'Vehicle not found in this organization', error_code: 'vehicle_not_in_org' });
    return link;
  }

  private async requireAssignmentInOrg(orgId: string, assignmentId: string) {
    const assignment = await this.prisma.driverVehicleAssignment.findFirst({
      where: { id: assignmentId, organizationId: orgId },
    });
    if (!assignment) throw new NotFoundException({ message: 'Assignment not found', error_code: 'assignment_not_found' });
    return assignment;
  }

  private async writeAuditEvent(actorUserId: string | undefined, orgId: string, action: string, targetId: string, afterJson: any) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: actorUserId ?? null,
        organizationId: orgId,
        targetType: 'DriverVehicleAssignment',
        targetId,
        action,
        afterJson: afterJson as any,
      },
    });
  }

  private formatAssignment(a: any) {
    return {
      id: a.id,
      driverId: a.driverId,
      vehicleId: a.vehicleId,
      organizationId: a.organizationId,
      assignmentType: a.assignmentType ?? 'PRIMARY',
      status: a.status,
      note: a.note ?? null,
      removalReason: a.removalReason ?? null,
      active: a.active,
      assignedAt: a.startsAt ?? null,
      endedAt: a.endsAt ?? null,
      assignedByUserId: a.assignedByUserId ?? null,
      driver: a.driver
        ? {
            id: a.driver.id,
            name: a.driver.name,
            phone: a.driver.user?.phone ?? null,
          }
        : undefined,
      vehicle: a.vehicle
        ? {
            id: a.vehicle.id,
            plate: a.vehicle.plate,
            vehicleNumber: a.vehicle.vehicleNumber ?? null,
            vehicleType: a.vehicle.vehicleType ?? a.vehicle.type,
            status: a.vehicle.status,
          }
        : undefined,
    };
  }

  // ─── 1. List assignments for org ────────────────────────────────────────────

  @Get('vehicle-driver-assignments')
  async listAssignments(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
    @Query('assignmentType') assignmentType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);

    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: any = {
      organizationId: orgId,
      ...(vehicleId ? { vehicleId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(status ? { status: status as AssignmentStatus } : {}),
      ...(assignmentType ? { assignmentType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.driverVehicleAssignment.findMany({
        where,
        include: {
          driver: { include: { user: true } },
          vehicle: true,
        },
        orderBy: { startsAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.driverVehicleAssignment.count({ where }),
    ]);

    return {
      status: 'ok',
      data: {
        items: items.map((a) => this.formatAssignment(a)),
        pagination: { page: Math.max(Number(page) || 1, 1), limit: take, total },
      },
    };
  }

  // ─── 2. Vehicle assignment detail ───────────────────────────────────────────

  @Get('vehicles/:vehicleId/assignments')
  async getVehicleAssignments(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);
    await this.requireVehicleInOrg(orgId, vehicleId);

    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: { organizationId: orgId, vehicleId },
      include: { driver: { include: { user: true } }, vehicle: true },
      orderBy: { startsAt: 'desc' },
    });

    const formatted = assignments.map((a) => this.formatAssignment(a));
    const activePrimary = formatted.find((a) => a.status === AssignmentStatus.ACTIVE && a.assignmentType === 'PRIMARY') ?? null;
    const activeSecondary = formatted.filter((a) => a.status === AssignmentStatus.ACTIVE && a.assignmentType === 'SECONDARY');
    const history = formatted.filter((a) => a.status !== AssignmentStatus.ACTIVE);

    return { status: 'ok', data: { activePrimary, activeSecondary, history, all: formatted } };
  }

  // ─── 3. Assign driver to vehicle ────────────────────────────────────────────

  @Post('vehicles/:vehicleId/drivers')
  async assignDriver(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: AssignDriverToVehicleDto,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);

    // Validate vehicle in org and status
    const vehicleLink = await this.requireVehicleInOrg(orgId, vehicleId);
    if (vehicleLink.vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException({ message: 'Vehicle must be ACTIVE before assignment', error_code: 'vehicle_not_active' });
    }
    if (vehicleLink.vehicle.kycStatus !== KycStatus.APPROVED) {
      throw new BadRequestException({ message: 'Vehicle KYC must be APPROVED before assignment', error_code: 'vehicle_kyc_not_approved' });
    }

    // Validate driver is in org with ACTIVE status
    const orgDriver = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId: orgId, driverId: body.driverId } },
    });
    if (!orgDriver) {
      throw new BadRequestException({ message: 'Driver does not belong to this organization', error_code: 'driver_not_in_org' });
    }
    if (orgDriver.status !== OrganizationDriverStatus.ACTIVE) {
      throw new BadRequestException({
        message: `Driver must be ACTIVE (current status: ${orgDriver.status})`,
        error_code: 'driver_not_active',
      });
    }

    // Verify mandatory driver documents are APPROVED (belt-and-suspenders — ACTIVE implies this)
    const mandatoryDocs = await this.prisma.kycRecord.findMany({
      where: {
        entityType: 'DRIVER' as any,
        entityId: body.driverId,
        documentType: { in: MANDATORY_DRIVER_DOC_TYPES as any },
      },
    });
    for (const docType of MANDATORY_DRIVER_DOC_TYPES) {
      const doc = mandatoryDocs.find((d: any) => d.documentType === docType);
      if (!doc || doc.status !== 'APPROVED') {
        throw new BadRequestException({
          message: `Mandatory document ${docType} must be APPROVED before assignment`,
          error_code: 'mandatory_doc_not_approved',
        });
      }
    }

    // Check for duplicate active assignment (same driver + vehicle)
    const existingForPair = await this.prisma.driverVehicleAssignment.findUnique({
      where: { driverId_vehicleId: { driverId: body.driverId, vehicleId } },
    });
    if (existingForPair && existingForPair.status === AssignmentStatus.ACTIVE) {
      throw new ConflictException({
        message: 'Driver already has an active assignment to this vehicle',
        error_code: 'duplicate_active_assignment',
      });
    }

    // Driver-vehicle conflict: driver already actively assigned to a different vehicle
    const driverActiveElsewhere = await (this.prisma.driverVehicleAssignment as any).findFirst({
      where: {
        driverId: body.driverId,
        organizationId: orgId,
        status: AssignmentStatus.ACTIVE,
        vehicleId: { not: vehicleId },
      },
      include: { vehicle: { select: { plate: true } } },
    });
    if (driverActiveElsewhere) {
      if (!body.replaceExistingVehicle) {
        throw new ConflictException({
          message: `Driver is already assigned to vehicle ${driverActiveElsewhere.vehicle?.plate ?? driverActiveElsewhere.vehicleId}. Set replaceExistingVehicle=true to reassign.`,
          error_code: 'driver_already_assigned_elsewhere',
          existingVehicleId: driverActiveElsewhere.vehicleId,
          existingVehiclePlate: driverActiveElsewhere.vehicle?.plate ?? null,
          existingAssignmentId: driverActiveElsewhere.id,
        });
      }
      // End the previous vehicle assignment
      await (this.prisma.driverVehicleAssignment as any).update({
        where: { id: driverActiveElsewhere.id },
        data: {
          status: AssignmentStatus.ENDED,
          active: false,
          endsAt: new Date(),
          removalReason: body.replacementReason ?? 'Driver reassigned to another vehicle',
        },
      });
      await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.vehicle_replaced', driverActiveElsewhere.id, {
        driverId: body.driverId,
        previousVehicleId: driverActiveElsewhere.vehicleId,
        newVehicleId: vehicleId,
        replacementReason: body.replacementReason,
      });
    }

    // PRIMARY conflict check
    if (body.assignmentType === 'PRIMARY') {
      const existingPrimary = await (this.prisma.driverVehicleAssignment as any).findFirst({
        where: {
          vehicleId,
          organizationId: orgId,
          assignmentType: 'PRIMARY',
          status: AssignmentStatus.ACTIVE,
          driverId: { not: body.driverId },
        },
      });
      if (existingPrimary) {
        if (!body.replaceExistingPrimary) {
          throw new ConflictException({
            message: 'Vehicle already has an active primary driver. Set replaceExistingPrimary=true to replace.',
            error_code: 'primary_driver_conflict',
            existingAssignmentId: existingPrimary.id,
            existingDriverId: existingPrimary.driverId,
          });
        }
        // End the existing primary assignment
        await (this.prisma.driverVehicleAssignment as any).update({
          where: { id: existingPrimary.id },
          data: {
            status: AssignmentStatus.ENDED,
            active: false,
            endsAt: new Date(),
            removalReason: body.replacementReason ?? 'Replaced by new primary driver',
          },
        });
        await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.primary_replaced', existingPrimary.id, {
          replacedBy: body.driverId,
          replacementReason: body.replacementReason,
        });
      }
    }

    // Upsert: if an ENDED/SUSPENDED row exists for same pair, revive it; else create
    const now = new Date();
    const assignment = await (this.prisma.driverVehicleAssignment as any).upsert({
      where: { driverId_vehicleId: { driverId: body.driverId, vehicleId } },
      create: {
        driverId: body.driverId,
        vehicleId,
        organizationId: orgId,
        assignedByUserId: req.user?.sub,
        status: AssignmentStatus.ACTIVE,
        assignmentType: body.assignmentType,
        note: body.note,
        active: true,
        startsAt: now,
        endsAt: null,
        source: 'admin',
      },
      update: {
        organizationId: orgId,
        assignedByUserId: req.user?.sub,
        status: AssignmentStatus.ACTIVE,
        assignmentType: body.assignmentType,
        note: body.note,
        active: true,
        startsAt: now,
        endsAt: null,
        removalReason: null,
        source: 'admin',
      },
      include: { driver: { include: { user: true } }, vehicle: true },
    });

    await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.created', assignment.id, {
      driverId: body.driverId,
      vehicleId,
      assignmentType: body.assignmentType,
    });

    return { status: 'ok', data: { assignment: this.formatAssignment(assignment) } };
  }

  // ─── 4. Suspend assignment ──────────────────────────────────────────────────

  @Patch('vehicle-driver-assignments/:assignmentId/suspend')
  async suspendAssignment(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: SuspendAssignmentDto,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);
    const assignment = await this.requireAssignmentInOrg(orgId, assignmentId);
    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException({ message: 'Only ACTIVE assignments can be suspended', error_code: 'assignment_not_active' });
    }
    const updated = await (this.prisma.driverVehicleAssignment as any).update({
      where: { id: assignmentId },
      data: { status: AssignmentStatus.SUSPENDED, active: false, removalReason: body.reason },
    });
    await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.suspended', assignmentId, { reason: body.reason });
    return { status: 'ok', data: { assignment: this.formatAssignment(updated) } };
  }

  // ─── 5. Restore assignment ──────────────────────────────────────────────────

  @Patch('vehicle-driver-assignments/:assignmentId/restore')
  async restoreAssignment(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);
    const assignment = await this.requireAssignmentInOrg(orgId, assignmentId);
    if (assignment.status !== AssignmentStatus.SUSPENDED) {
      throw new BadRequestException({ message: 'Only SUSPENDED assignments can be restored', error_code: 'assignment_not_suspended' });
    }

    // Re-validate driver and vehicle eligibility
    const [vehicleLink, orgDriver] = await Promise.all([
      this.prisma.organizationVehicle.findUnique({
        where: { organizationId_vehicleId: { organizationId: orgId, vehicleId: assignment.vehicleId } },
        include: { vehicle: true },
      }),
      this.prisma.organizationDriver.findUnique({
        where: { organizationId_driverId: { organizationId: orgId, driverId: assignment.driverId } },
      }),
    ]);

    if (!vehicleLink || vehicleLink.vehicle.status !== VehicleStatus.ACTIVE || vehicleLink.vehicle.kycStatus !== KycStatus.APPROVED) {
      throw new BadRequestException({ message: 'Vehicle is no longer active/approved', error_code: 'vehicle_not_eligible' });
    }
    if (!orgDriver || orgDriver.status !== OrganizationDriverStatus.ACTIVE) {
      throw new BadRequestException({ message: 'Driver is no longer active in this organization', error_code: 'driver_not_eligible' });
    }

    // Check for primary conflict if restoring a primary
    const assignmentType = (assignment as any).assignmentType ?? 'PRIMARY';
    if (assignmentType === 'PRIMARY') {
      const conflictingPrimary = await (this.prisma.driverVehicleAssignment as any).findFirst({
        where: {
          vehicleId: assignment.vehicleId,
          organizationId: orgId,
          assignmentType: 'PRIMARY',
          status: AssignmentStatus.ACTIVE,
          id: { not: assignmentId },
        },
      });
      if (conflictingPrimary) {
        throw new ConflictException({ message: 'Vehicle already has another active primary driver', error_code: 'primary_driver_conflict' });
      }
    }

    const updated = await (this.prisma.driverVehicleAssignment as any).update({
      where: { id: assignmentId },
      data: { status: AssignmentStatus.ACTIVE, active: true, removalReason: null },
    });
    await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.restored', assignmentId, {});
    return { status: 'ok', data: { assignment: this.formatAssignment(updated) } };
  }

  // ─── 6. Remove/end assignment ───────────────────────────────────────────────

  @Delete('vehicle-driver-assignments/:assignmentId')
  async removeAssignment(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: RemoveAssignmentDto,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);
    const assignment = await this.requireAssignmentInOrg(orgId, assignmentId);
    if (assignment.status === AssignmentStatus.ENDED) {
      throw new BadRequestException({ message: 'Assignment is already ended', error_code: 'assignment_already_ended' });
    }
    const updated = await (this.prisma.driverVehicleAssignment as any).update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.ENDED,
        active: false,
        endsAt: new Date(),
        removalReason: body.reason ?? null,
      },
    });
    await this.writeAuditEvent(req.user?.sub, orgId, 'assignment.ended', assignmentId, { reason: body.reason });
    return { status: 'ok', data: { assignment: this.formatAssignment(updated) } };
  }

  // ─── 7. Eligible drivers for assignment ─────────────────────────────────────

  @Get('drivers/eligible-for-assignment')
  async eligibleDrivers(
    @Req() req: any,
    @Param('orgId') orgId: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('assignmentType') assignmentType?: string,
    @Query('search') search?: string,
    @Query('includeIneligible') includeIneligible?: string,
  ) {
    await this.requireOrgOrSuperAdmin(req, orgId);

    const orgDrivers = await this.prisma.organizationDriver.findMany({
      where: {
        organizationId: orgId,
        status: OrganizationDriverStatus.ACTIVE,
        driver: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { user: { phone: { contains: search } } },
              ],
            }
          : undefined,
      },
      include: {
        driver: {
          include: {
            user: { select: { phone: true } },
          },
        },
      },
      orderBy: { driver: { name: 'asc' } },
    });

    // Fetch active assignments for all candidate drivers
    const driverIds = orgDrivers.map((od) => od.driverId);
    const activeAssignments = driverIds.length
      ? await this.prisma.driverVehicleAssignment.findMany({
          where: { driverId: { in: driverIds }, status: AssignmentStatus.ACTIVE },
        })
      : [];

    // If vehicleId supplied, pre-fetch existing vehicle assignments to detect conflicts
    let vehicleActiveAssignments: any[] = [];
    if (vehicleId) {
      vehicleActiveAssignments = await (this.prisma.driverVehicleAssignment as any).findMany({
        where: { vehicleId, organizationId: orgId, status: AssignmentStatus.ACTIVE },
      });
    }

    const showIneligible = includeIneligible === 'true';
    const targetAssignmentType = assignmentType ?? 'PRIMARY';

    const items = orgDrivers.flatMap((od) => {
      const blockReasons: string[] = [];
      const driverActiveAssignments = activeAssignments.filter((a) => a.driverId === od.driverId);

      if (vehicleId) {
        const alreadyAssignedToVehicle = driverActiveAssignments.find((a) => a.vehicleId === vehicleId);
        if (alreadyAssignedToVehicle) {
          blockReasons.push('Already has active assignment to this vehicle');
        }
        if (targetAssignmentType === 'PRIMARY') {
          const vehicleHasPrimary = vehicleActiveAssignments.find(
            (a: any) => (a.assignmentType ?? 'PRIMARY') === 'PRIMARY' && a.driverId !== od.driverId,
          );
          if (vehicleHasPrimary) {
            blockReasons.push('Vehicle already has an active primary driver');
          }
        }
      }

      const eligible = blockReasons.length === 0;
      if (!eligible && !showIneligible) return [];

      return [
        {
          driverId: od.driverId,
          organizationDriverId: od.id,
          fullName: od.driver.name ?? null,
          phone: od.driver.user?.phone ?? null,
          organizationDriverStatus: od.status,
          currentAssignments: driverActiveAssignments.map((a) => ({
            id: a.id,
            vehicleId: a.vehicleId,
            assignmentType: (a as any).assignmentType ?? 'PRIMARY',
            status: a.status,
          })),
          eligible,
          blockReasons,
        },
      ];
    });

    return { status: 'ok', data: { items } };
  }
}

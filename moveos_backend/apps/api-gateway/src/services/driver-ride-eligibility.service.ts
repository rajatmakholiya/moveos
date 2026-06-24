import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@common/index';
import { AssignmentStatus, KycStatus, OrganizationDriverStatus, VehicleStatus } from '@prisma/client';

export type EligibilityAction =
  | 'ACCEPT_RIDE'
  | 'REJECT_RIDE'
  | 'START_RIDE'
  | 'COMPLETE_RIDE'
  | 'CANCEL_RIDE'
  | 'VIEW_RIDE_REQUEST'
  | 'CREATE_TRIP';

export interface EligibilityContext {
  eligible: true;
  driverId: string;
  organizationDriverId: string;
  assignmentId: string;
  vehicleId: string;
  organizationId: string;
}

export interface BlockReason {
  code: string;
  message: string;
}

export interface EligibilityCheckResult {
  eligible: boolean;
  blockReasons: BlockReason[];
  context?: EligibilityContext;
}

export interface EligibilityParams {
  driverUserId: string;
  driverId?: string;
  vehicleId?: string;
  organizationId?: string;
  action?: EligibilityAction;
}

@Injectable()
export class DriverRideEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Strict check — throws BadRequestException with structured error codes on any failure.
   * Use inside action endpoints (accept ride, create trip, etc.)
   */
  async assertDriverCanOperateVehicle(params: EligibilityParams & { action: EligibilityAction }): Promise<EligibilityContext> {
    const result = await this.checkEligibility(params);
    if (!result.eligible) {
      const first = result.blockReasons[0];
      throw new BadRequestException({
        code: first?.code ?? 'eligibility_failed',
        message: first?.message ?? 'Driver is not eligible to perform this action',
        blockReasons: result.blockReasons,
      });
    }
    return result.context!;
  }

  /**
   * Soft check — never throws; returns eligible + blockReasons.
   * Use for check endpoints and frontend eligibility polling.
   */
  async checkEligibility(params: EligibilityParams): Promise<EligibilityCheckResult> {
    // 1. Resolve driverId from Driver.userId if not directly provided in JWT
    let resolvedDriverId: string;
    if (params.driverId) {
      resolvedDriverId = params.driverId;
    } else {
      const driver = await (this.prisma as any).driver.findUnique({
        where: { userId: params.driverUserId },
        select: { id: true },
      });
      if (!driver) {
        return {
          eligible: false,
          blockReasons: [{ code: 'driver_profile_missing', message: 'Driver profile not found.' }],
        };
      }
      resolvedDriverId = driver.id as string;
    }
    const driverId = resolvedDriverId;

    // 2. Find an active assignment for this driver (filtered by vehicleId / orgId when provided).
    // Note: we only require status=ACTIVE, not active=true — the `active` boolean is a UI hint
    // for which vehicle is the driver's "current" one, not a business rule for trip eligibility.
    const activeWhere: any = {
      driverId,
      status: AssignmentStatus.ACTIVE,
    };
    if (params.vehicleId) activeWhere.vehicleId = params.vehicleId;
    if (params.organizationId) activeWhere.organizationId = params.organizationId;

    const assignment = await (this.prisma.driverVehicleAssignment as any).findFirst({
      where: activeWhere,
      select: { id: true, vehicleId: true, organizationId: true, status: true, assignmentType: true },
      orderBy: { active: 'desc' }, // prefer the one marked active if multiple
    });

    if (!assignment) {
      // Distinguish between "no assignment" and "assignment exists but in wrong status"
      const inactiveWhere: any = { driverId };
      if (params.vehicleId) inactiveWhere.vehicleId = params.vehicleId;

      const inactiveAssignment = await (this.prisma.driverVehicleAssignment as any).findFirst({
        where: inactiveWhere,
        select: { id: true, status: true },
        orderBy: { startsAt: 'desc' },
      });

      if (inactiveAssignment) {
        const statusLabel = (inactiveAssignment.status as string).toLowerCase();
        return {
          eligible: false,
          blockReasons: [{
            code: 'assignment_not_active',
            message: `Your assignment to this vehicle is ${statusLabel}, not active.`,
          }],
        };
      }

      return {
        eligible: false,
        blockReasons: [{
          code: 'driver_not_assigned_to_vehicle',
          message: params.vehicleId
            ? 'You are not assigned to this vehicle.'
            : 'You are not assigned to any active vehicle.',
        }],
      };
    }

    const vehicleId: string = params.vehicleId ?? (assignment.vehicleId as string);
    const organizationId: string | null = params.organizationId ?? (assignment.organizationId as string | null);

    // 3. Individual driver (no org) — skip org checks, just validate vehicle status directly.
    if (!organizationId) {
      const vehicle = await (this.prisma as any).vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, status: true },
      });
      if (!vehicle || vehicle.status !== VehicleStatus.ACTIVE) {
        return {
          eligible: false,
          blockReasons: [{ code: 'vehicle_not_active', message: 'This vehicle is not active.' }],
        };
      }
      return {
        eligible: true,
        blockReasons: [],
        context: {
          eligible: true,
          driverId,
          organizationDriverId: '',
          assignmentId: assignment.id,
          vehicleId,
          organizationId: '',
        },
      };
    }

    // 4. Org-assigned driver — validate OrganizationDriver membership and status.
    const orgDriver = await this.prisma.organizationDriver.findUnique({
      where: { organizationId_driverId: { organizationId, driverId } },
      select: { id: true, status: true },
    });

    if (!orgDriver) {
      return {
        eligible: false,
        blockReasons: [{ code: 'driver_not_linked_to_organization', message: 'Driver is not linked to this organization.' }],
      };
    }

    if (orgDriver.status !== OrganizationDriverStatus.ACTIVE) {
      return {
        eligible: false,
        blockReasons: [{ code: 'driver_not_active_for_organization', message: 'Your driver profile is not active for this organization.' }],
      };
    }

    // 5. Validate vehicle belongs to organization and is active + KYC approved.
    const orgVehicle = await this.prisma.organizationVehicle.findUnique({
      where: { organizationId_vehicleId: { organizationId, vehicleId } },
      include: { vehicle: { select: { id: true, status: true, kycStatus: true } } },
    });

    if (!orgVehicle) {
      return {
        eligible: false,
        blockReasons: [{ code: 'vehicle_not_in_organization', message: 'Vehicle does not belong to this organization.' }],
      };
    }

    if (orgVehicle.vehicle.status !== VehicleStatus.ACTIVE) {
      return {
        eligible: false,
        blockReasons: [{ code: 'vehicle_not_active', message: 'This vehicle is not active.' }],
      };
    }

    if (orgVehicle.vehicle.kycStatus !== KycStatus.APPROVED) {
      return {
        eligible: false,
        blockReasons: [{ code: 'vehicle_not_approved', message: 'This vehicle is not approved for rides.' }],
      };
    }

    return {
      eligible: true,
      blockReasons: [],
      context: {
        eligible: true,
        driverId,
        organizationDriverId: orgDriver.id,
        assignmentId: assignment.id,
        vehicleId,
        organizationId,
      },
    };
  }
}

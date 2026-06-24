import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import type { AppRole } from '@common/auth/roles.decorator';
import { DispatchServiceClient } from '../clients/dispatch-service.client';
import { DriverServiceClient } from '../clients/driver-service.client';
import { BookingServiceClient } from '../clients/booking-service.client';
import { DriverRideEligibilityService } from '../services/driver-ride-eligibility.service';

/**
 * Removes passengerPhone and passengerName from each item in the requests array.
 * Applied when the caller is a DRIVER — they need to know the request exists and
 * where to go, but must not receive raw passenger contact details.
 */
export function stripPassengerPii(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const list = record['requests'];
  if (!Array.isArray(list)) {
    return payload;
  }
  return {
    ...record,
    requests: list.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const { passengerPhone: _ph, passengerName: _nm, ...rest } = item as Record<string, unknown>;
      return rest;
    }),
  };
}

async function enrichTransportRequestResponse(payload: unknown, prisma: PrismaService): Promise<unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.requests)) {
    return enrichTransportRequests(record, prisma);
  }
  if (record.request && typeof record.request === 'object' && !Array.isArray(record.request)) {
    const [request] = await enrichRequestItems([record.request as Record<string, unknown>], prisma);
    return { ...record, request };
  }
  return payload;
}

async function enrichTransportRequests(payload: unknown, prisma: PrismaService): Promise<unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.requests)) return payload;
  return { ...record, requests: await enrichRequestItems(record.requests as Record<string, unknown>[], prisma) };
}

async function enrichRequestItems(items: Record<string, unknown>[], prisma: PrismaService) {
  const driverIds = Array.from(new Set(items.map((item) => String(item.acceptedByDriverId ?? '')).filter(Boolean)));
  if (!driverIds.length) return items;

  const drivers = await prisma.driver.findMany({
    where: { id: { in: driverIds } },
    include: {
      user: { select: { phone: true, name: true } },
      vehicles: {
        where: { active: true },
        include: { vehicle: true },
        orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
        take: 1,
      },
    },
  });
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));

  return items.map((item) => {
    const driver = byId.get(String(item.acceptedByDriverId ?? ''));
    const assignment = driver?.vehicles[0];
    return {
      ...item,
      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
            phone: driver.user?.phone,
          }
        : undefined,
      vehicle: assignment?.vehicle
        ? {
            id: assignment.vehicle.id,
            plate: assignment.vehicle.plate,
            vehicleNumber: assignment.vehicle.vehicleNumber,
            type: assignment.vehicle.type,
            vehicleType: assignment.vehicle.vehicleType,
          }
        : undefined,
    };
  });
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly dispatchClient: DispatchServiceClient,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('ORG_ADMIN', 'DRIVER', 'PASSENGER')
  @Get()
  async listRequests(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const user = req.user as { role: AppRole; sub: string; passengerId?: string } | undefined;
    const role = user?.role;

    // PASSENGER sees only their own requests; other roles see all REQUESTED items.
    const passengerId = role === 'PASSENGER' ? (user?.passengerId ?? user?.sub) : undefined;

    const response = await enrichTransportRequestResponse(
      await this.dispatchClient.listRequests({ type, status, passengerId }),
      this.prisma,
    );

    // DRIVER must not receive raw passenger contact details.
    if (role === 'DRIVER') {
      return stripPassengerPii(response);
    }
    return response;
  }

  @Roles('PASSENGER', 'ORG_ADMIN')
  @Post()
  createRequest(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = req.user as { role: AppRole; sub: string; passengerId?: string } | undefined;
    // Bind the request to the calling passenger so they can retrieve it later.
    const enriched =
      user?.role === 'PASSENGER'
        ? { ...body, passengerId: user.passengerId ?? user.sub }
        : body;
    return this.dispatchClient.createRequest(enriched);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('driver/requests')
export class DriverRequestsController {
  constructor(
    private readonly dispatchClient: DispatchServiceClient,
    private readonly driverClient: DriverServiceClient,
    private readonly eligibilityService: DriverRideEligibilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listDriverRequests(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const driverId = this.getDriverId(req);
    const enriched = await enrichTransportRequestResponse(await this.dispatchClient.listRequests({
      type,
      status,
      driverId: status === 'ACCEPTED' ? driverId : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    }), this.prisma);
    // Driver accepted their own requests — they need to see passenger contact details.
    if (status === 'ACCEPTED') {
      return enriched;
    }
    return stripPassengerPii(enriched);
  }

  @Post(':requestId/accept')
  async acceptRequest(@Req() req: any, @Param('requestId') requestId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'ACCEPT_RIDE',
    });
    return enrichTransportRequestResponse(await this.dispatchClient.acceptRequest(requestId, driverId), this.prisma);
  }

  @Post(':requestId/reject')
  async rejectRequest(@Req() req: any, @Param('requestId') requestId: string) {
    const driverId = this.getDriverId(req);
    await this.eligibilityService.assertDriverCanOperateVehicle({
      driverUserId: req.user.sub,
      driverId,
      action: 'REJECT_RIDE',
    });
    return this.dispatchClient.rejectRequest(requestId, driverId);
  }

  @Post(':requestId/complete')
  completeRequest(@Req() req: any, @Param('requestId') requestId: string, @Body() body: { agreedAmountPaise?: number }) {
    const driverId = this.getDriverId(req);
    return this.dispatchClient.completeRequest(requestId, driverId, body.agreedAmountPaise);
  }

  @Post(':requestId/cancel')
  cancelDriverRequest(@Req() req: any, @Param('requestId') requestId: string) {
    const driverId = this.getDriverId(req);
    return this.dispatchClient.cancelRequest(requestId, driverId);
  }

  private getDriverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('driver/bookings')
export class DriverBookingsController {
  constructor(private readonly bookingClient: BookingServiceClient) {}

  @Get()
  getDriverBookings(@Req() req: any) {
    const driverId = req.user?.driverId ?? req.user?.sub;
    return this.bookingClient.getDriverBookings(driverId);
  }

  @Post(':bookingId/collect-cash')
  collectCash(@Req() req: any, @Param('bookingId') bookingId: string) {
    const driverId = req.user?.driverId ?? req.user?.sub;
    return this.bookingClient.collectCash(driverId, bookingId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ORG_ADMIN')
@Controller('admin/transport-requests')
export class AdminTransportRequestsController {
  constructor(
    private readonly dispatchClient: DispatchServiceClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listAdminRequests(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const user = req.user as { role: AppRole; sub: string; defaultOrganizationId?: string } | undefined;
    const payload = await enrichTransportRequestResponse(
      await this.dispatchClient.listRequests({ type, status }),
      this.prisma,
    );

    // ORG_ADMIN: filter to show only requests accepted by (or relevant to) their fleet drivers
    if (user?.role === 'ORG_ADMIN' && user?.defaultOrganizationId) {
      return this.filterForOrgAdmin(payload, user.defaultOrganizationId);
    }

    return payload;
  }

  private async filterForOrgAdmin(payload: unknown, orgId: string): Promise<unknown> {
    const orgDriverLinks = await this.prisma.organizationDriver.findMany({
      where: { organizationId: orgId },
      select: { driverId: true },
    });
    if (!orgDriverLinks.length) return payload;
    const orgDriverIds = new Set(orgDriverLinks.map((d) => d.driverId));

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.requests)) return payload;

    return {
      ...record,
      requests: (record.requests as Record<string, unknown>[]).filter((r) => {
        const driverId = r.acceptedByDriverId;
        return !driverId || orgDriverIds.has(String(driverId));
      }),
    };
  }
}

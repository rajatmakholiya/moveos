import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService, RedisService } from '@common/index';
import {
  OrganizationDriverStatus,
  OrganizationMemberRole,
  OrganizationMemberStatus,
} from '@prisma/client';

type LatLng = { lat: number; lng: number };

type StopView = {
  bookingId: string;
  kind: 'PICKUP' | 'DROPOFF';
  label: string | null;
  lat: number | null;
  lng: number | null;
  passengerName: string;
  passengerPhone: string;
  seatType: string;
  // Lifecycle of this leg, derived from booking timestamps
  status: 'PENDING' | 'ARRIVED' | 'DONE';
};

type TripTrackingView = {
  tripId: string;
  status: string;
  departureAt: string;
  departedAt: string | null;
  departurePoint: string;
  route: { from: string; to: string; name: string };
  driver: { id: string; name: string; phone: string | null };
  vehicle: { id: string | null; plate: string | null; type: string | null; vehicleNumber: string | null };
  organization: { id: string; name: string } | null;
  location: { lat: number; lng: number; updatedAt: string } | null;
  progress: { totalPassengers: number; pickedUp: number; droppedOff: number };
  // Whether the trip is in the pickup leg or has moved on to drop-offs
  phase: 'PICKUP' | 'DROPOFF';
  stops: StopView[];
};

function readLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const lat = Number(rec.lat ?? rec.latitude);
  const lng = Number(rec.lng ?? rec.lon ?? rec.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function readLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const label = rec.label ?? rec.name ?? rec.address ?? rec.formattedAddress;
  return typeof label === 'string' ? label : null;
}

@Injectable()
export class LiveTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Authorization helpers ──────────────────────────────────────────────────

  /**
   * Resolve which organization the caller may track. SUPER_ADMIN/ADMIN may track
   * any org (or all). An org operator (OWNER/ADMIN/FLEET_MANAGER member) may only
   * track organizations they belong to.
   */
  private async assertCanTrackOrg(user: any, organizationId: string): Promise<void> {
    if (!user?.sub) throw new UnauthorizedException('Missing user');
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;
    // The org-admin token enumerates the organizations it may act on.
    if (Array.isArray(user.organizationIds) && user.organizationIds.includes(organizationId)) return;
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.sub,
        status: { not: OrganizationMemberStatus.REMOVED },
        role: { in: [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN, OrganizationMemberRole.FLEET_MANAGER] },
      },
    });
    if (!membership) throw new ForbiddenException('You do not have tracking access to this organization');
  }

  /** Organizations the caller is allowed to scope to (null = all, for super admin). */
  private async resolveScopeOrgIds(user: any): Promise<string[] | null> {
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return null; // unrestricted
    if (Array.isArray(user.organizationIds) && user.organizationIds.length > 0) return user.organizationIds;
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId: user.sub,
        status: { not: OrganizationMemberStatus.REMOVED },
        role: { in: [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN, OrganizationMemberRole.FLEET_MANAGER] },
      },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  // ── Org → vehicle/driver resolution ─────────────────────────────────────────

  private async orgVehicleAndDriverIds(orgIds: string[]): Promise<{ vehicleIds: string[]; driverIds: string[] }> {
    const [vehicleLinks, driverLinks] = await Promise.all([
      this.prisma.organizationVehicle.findMany({
        where: { organizationId: { in: orgIds }, status: 'ACTIVE' },
        select: { vehicleId: true },
      }),
      this.prisma.organizationDriver.findMany({
        where: { organizationId: { in: orgIds }, status: { not: OrganizationDriverStatus.REMOVED } },
        select: { driverId: true },
      }),
    ]);
    return {
      vehicleIds: [...new Set(vehicleLinks.map((v) => v.vehicleId))],
      driverIds: [...new Set(driverLinks.map((d) => d.driverId))],
    };
  }

  /** Map driverId/vehicleId → { orgId, name } for labelling each trip. */
  private async buildOrgLabelMaps() {
    const [vehicleLinks, driverLinks] = await Promise.all([
      this.prisma.organizationVehicle.findMany({
        where: { status: 'ACTIVE' },
        select: { vehicleId: true, organization: { select: { id: true, legalName: true, tradeName: true } } },
      }),
      this.prisma.organizationDriver.findMany({
        where: { status: { not: OrganizationDriverStatus.REMOVED } },
        select: { driverId: true, organization: { select: { id: true, legalName: true, tradeName: true } } },
      }),
    ]);
    const orgName = (o: { legalName: string; tradeName: string | null }) => o.tradeName || o.legalName;
    const byVehicle = new Map<string, { id: string; name: string }>();
    for (const v of vehicleLinks) byVehicle.set(v.vehicleId, { id: v.organization.id, name: orgName(v.organization) });
    const byDriver = new Map<string, { id: string; name: string }>();
    for (const d of driverLinks) byDriver.set(d.driverId, { id: d.organization.id, name: orgName(d.organization) });
    return { byVehicle, byDriver };
  }

  // ── Live location ────────────────────────────────────────────────────────────

  private async latestLocation(driverId: string): Promise<{ lat: number; lng: number; updatedAt: string } | null> {
    const raw = await this.redis.getClient().get(`location:latest:${driverId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { lat: number; lng: number; updatedAt: string };
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) return parsed;
    } catch {
      /* malformed */
    }
    return null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Snapshot of every in-progress (DEPARTED) trip the caller may see, optionally
   * filtered by organization and/or vehicle. Each trip carries the vehicle's last
   * known position plus the full pickup/drop stop sequence since departure.
   */
  async getActiveTrips(
    user: any,
    filters: { organizationId?: string; vehicleId?: string },
  ): Promise<{ trips: TripTrackingView[] }> {
    const tripWhere: Record<string, unknown> = { status: 'DEPARTED' };

    if (filters.organizationId) {
      await this.assertCanTrackOrg(user, filters.organizationId);
      const { vehicleIds, driverIds } = await this.orgVehicleAndDriverIds([filters.organizationId]);
      tripWhere.OR = [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }];
    } else {
      const scopeOrgIds = await this.resolveScopeOrgIds(user);
      if (scopeOrgIds !== null) {
        // Org operator with no explicit org filter — restrict to their orgs.
        if (scopeOrgIds.length === 0) return { trips: [] };
        const { vehicleIds, driverIds } = await this.orgVehicleAndDriverIds(scopeOrgIds);
        tripWhere.OR = [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }];
      }
    }

    if (filters.vehicleId) tripWhere.vehicleId = filters.vehicleId;

    const trips = await this.prisma.scheduledTrip.findMany({
      where: tripWhere,
      include: {
        route: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: {
          where: { status: 'CONFIRMED' },
          select: {
            id: true,
            passengerName: true,
            passengerPhone: true,
            seatType: true,
            pickupJson: true,
            dropoffJson: true,
            arrivedAtPickupAt: true,
            pickedUpAt: true,
            arrivedAtDropoffAt: true,
            droppedOffAt: true,
          },
        },
      },
      orderBy: { departedAt: 'desc' },
    });

    const { byVehicle, byDriver } = await this.buildOrgLabelMaps();

    const views = await Promise.all(
      trips.map(async (trip): Promise<TripTrackingView> => this.toTripView(trip, byVehicle, byDriver, await this.latestLocation(trip.driverId))),
    );

    return { trips: views };
  }

  /**
   * Trips departing on a given calendar day (default today), regardless of status,
   * scoped to the caller. Powers the schedule-tracking planner: pickup/drop stops
   * to plot a route plus the driver's last-known position. Useful before a journey
   * starts (status OPEN) to plan and to slot in offline bookings.
   */
  async getScheduledByDate(
    user: any,
    filters: { date?: string; organizationId?: string; vehicleId?: string },
  ): Promise<{ date: string; trips: TripTrackingView[] }> {
    // Resolve the [start, end) range for the requested local day (default: today).
    const base = filters.date ? new Date(`${filters.date}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) throw new BadRequestException('Invalid date');
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const tripWhere: Record<string, unknown> = { departureAt: { gte: start, lt: end } };

    if (filters.organizationId) {
      await this.assertCanTrackOrg(user, filters.organizationId);
      const { vehicleIds, driverIds } = await this.orgVehicleAndDriverIds([filters.organizationId]);
      tripWhere.OR = [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }];
    } else {
      const scopeOrgIds = await this.resolveScopeOrgIds(user);
      if (scopeOrgIds !== null) {
        if (scopeOrgIds.length === 0) return { date: start.toISOString().slice(0, 10), trips: [] };
        const { vehicleIds, driverIds } = await this.orgVehicleAndDriverIds(scopeOrgIds);
        tripWhere.OR = [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }];
      }
    }

    if (filters.vehicleId) tripWhere.vehicleId = filters.vehicleId;

    const trips = await this.prisma.scheduledTrip.findMany({
      where: tripWhere,
      include: {
        route: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: {
          where: { status: 'CONFIRMED' },
          select: {
            id: true,
            passengerName: true,
            passengerPhone: true,
            seatType: true,
            pickupJson: true,
            dropoffJson: true,
            arrivedAtPickupAt: true,
            pickedUpAt: true,
            arrivedAtDropoffAt: true,
            droppedOffAt: true,
          },
        },
      },
      orderBy: { departureAt: 'asc' },
    });

    const { byVehicle, byDriver } = await this.buildOrgLabelMaps();

    const views = await Promise.all(
      trips.map(async (trip): Promise<TripTrackingView> =>
        this.toTripView(trip, byVehicle, byDriver, await this.latestLocation(trip.driverId)),
      ),
    );

    return { date: start.toISOString().slice(0, 10), trips: views };
  }

  /** Single trip detail (same shape) — used when the admin opens one vehicle. */
  async getTripDetail(user: any, tripId: string): Promise<TripTrackingView> {
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: {
        route: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: {
          where: { status: 'CONFIRMED' },
          select: {
            id: true,
            passengerName: true,
            passengerPhone: true,
            seatType: true,
            pickupJson: true,
            dropoffJson: true,
            arrivedAtPickupAt: true,
            pickedUpAt: true,
            arrivedAtDropoffAt: true,
            droppedOffAt: true,
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const { byVehicle, byDriver } = await this.buildOrgLabelMaps();
    const org = (trip.vehicleId && byVehicle.get(trip.vehicleId)) || byDriver.get(trip.driverId) || null;

    // Org operators may only view trips that belong to one of their orgs.
    const scopeOrgIds = await this.resolveScopeOrgIds(user);
    if (scopeOrgIds !== null) {
      if (!org || !scopeOrgIds.includes(org.id)) {
        throw new ForbiddenException('You do not have tracking access to this trip');
      }
    }

    return this.toTripView(trip, byVehicle, byDriver, await this.latestLocation(trip.driverId));
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private toTripView(
    trip: any,
    byVehicle: Map<string, { id: string; name: string }>,
    byDriver: Map<string, { id: string; name: string }>,
    location: { lat: number; lng: number; updatedAt: string } | null,
  ): TripTrackingView {
    const bookings = (trip.bookings ?? []) as any[];

    const stops: StopView[] = [];
    for (const b of bookings) {
      const pickup = readLatLng(b.pickupJson);
      stops.push({
        bookingId: b.id,
        kind: 'PICKUP',
        label: readLabel(b.pickupJson),
        lat: pickup?.lat ?? null,
        lng: pickup?.lng ?? null,
        passengerName: b.passengerName,
        passengerPhone: b.passengerPhone,
        seatType: b.seatType,
        status: b.pickedUpAt ? 'DONE' : b.arrivedAtPickupAt ? 'ARRIVED' : 'PENDING',
      });
      const dropoff = readLatLng(b.dropoffJson);
      if (dropoff || b.dropoffJson) {
        stops.push({
          bookingId: b.id,
          kind: 'DROPOFF',
          label: readLabel(b.dropoffJson),
          lat: dropoff?.lat ?? null,
          lng: dropoff?.lng ?? null,
          passengerName: b.passengerName,
          passengerPhone: b.passengerPhone,
          seatType: b.seatType,
          status: b.droppedOffAt ? 'DONE' : b.arrivedAtDropoffAt ? 'ARRIVED' : 'PENDING',
        });
      }
    }

    const pickedUp = bookings.filter((b) => b.pickedUpAt).length;
    const droppedOff = bookings.filter((b) => b.droppedOffAt).length;
    const allPickedUp = bookings.length > 0 && pickedUp === bookings.length;

    const org = (trip.vehicleId && byVehicle.get(trip.vehicleId)) || byDriver.get(trip.driverId) || null;

    return {
      tripId: trip.id,
      status: trip.status,
      departureAt: (trip.departureAt instanceof Date ? trip.departureAt.toISOString() : String(trip.departureAt ?? '')),
      departedAt: trip.departedAt?.toISOString() ?? null,
      departurePoint: trip.departurePoint ?? '',
      route: {
        from: trip.route?.originLabel ?? trip.route?.fromCity ?? '',
        to: trip.route?.destinationLabel ?? trip.route?.toCity ?? '',
        name: trip.route?.name ?? trip.route?.routeName ?? '',
      },
      driver: {
        id: trip.driver?.id ?? trip.driverId,
        name: trip.driver?.name ?? '',
        phone: trip.driver?.user?.phone ?? null,
      },
      vehicle: {
        id: trip.vehicle?.id ?? null,
        plate: trip.vehicle?.plate ?? null,
        type: trip.vehicle?.type ?? null,
        vehicleNumber: trip.vehicle?.vehicleNumber ?? null,
      },
      organization: org,
      location,
      progress: { totalPassengers: bookings.length, pickedUp, droppedOff },
      phase: allPickedUp ? 'DROPOFF' : 'PICKUP',
      stops,
    };
  }
}

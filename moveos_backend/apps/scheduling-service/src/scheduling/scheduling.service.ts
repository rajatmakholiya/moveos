import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@common/index';
import { RedisService } from '@common/index';
import {
  AssignmentStatus,
  BookingStatus,
  ComplianceStatus,
  KycStatus,
  OrgPlanTier,
  SeatType,
  OrganizationDriverStatus,
  OrganizationStatus,
  TripStatus,
  VehicleStatus,
} from '@prisma/client';
import { CreateTripDto } from './dto/create-trip.dto';
import { AvailableTripsQueryDto } from './dto/available-trips-query.dto';

const DEPART_WINDOW_MS = 30 * 60 * 1000; // ±30 min

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createTrip(driverId: string, dto: CreateTripDto) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');

    const route = await this.prisma.route.findUnique({ where: { id: dto.routeId } });
    if (!route || !route.isActive) {
      throw new BadRequestException('Route not found or inactive');
    }

    const departureAt = new Date(dto.departureAt);
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (departureAt < twoHoursFromNow) {
      throw new BadRequestException('departureAt must be at least 2 hours from now');
    }

    const assignment = await this.resolveOperationalVehicle(driverId, dto.vehicleId);
    const vehicleId = assignment.vehicle.id;

    // Reject if driver or vehicle already has an overlapping active trip.
    // Overlap: newStart < existingEnd AND existingStart < newEnd
    const newTripEnd = new Date(
      departureAt.getTime() + (route.estimatedDurationMinutes ?? 24 * 60) * 60 * 1000,
    );
    const candidateConflicts = await this.prisma.scheduledTrip.findMany({
      where: {
        OR: [{ driverId }, { vehicleId }],
        status: { in: [TripStatus.OPEN, TripStatus.DEPARTED] },
        departureAt: { lt: newTripEnd }, // existing starts before new trip ends
      },
      include: { route: { select: { estimatedDurationMinutes: true } } },
    });
    for (const candidateConflict of candidateConflicts) {
      const existingEnd = new Date(
        candidateConflict.departureAt.getTime() +
        (candidateConflict.route?.estimatedDurationMinutes ?? 24 * 60) * 60 * 1000,
      );
      if (existingEnd > departureAt) {
        const conflictSide = candidateConflict.driverId === driverId ? 'Driver' : 'Vehicle';
        throw new ConflictException({
          message: `${conflictSide} already has an active trip overlapping this time window`,
          code: 'TRIP_SCHEDULE_CONFLICT',
          conflictingTripId: candidateConflict.id,
        });
      }
    }

    const trip = await this.prisma.scheduledTrip.create({
      data: {
        routeId: dto.routeId,
        driverId,
        vehicleId,
        departureAt,
        frontSeatsTotal: dto.frontSeatsTotal,
        backSeatsTotal: dto.backSeatsTotal,
        departurePoint: dto.departurePoint,
        luggagePolicy: dto.luggagePolicy,
        notes: dto.notes,
        status: TripStatus.OPEN,
      },
      include: { route: true, vehicle: true },
    });

    return { tripId: trip.id, id: trip.id, trip: this.toTripView(trip) };
  }

  async getAvailableTrips(query: AvailableTripsQueryDto) {
    const { gte, lt } = this.istDayToUtcRange(query.date);
    const now = new Date();
    // For today's date, only show trips that haven't departed yet (scheduled departure in the future).
    // For future dates, gte is already ahead of now so effectiveGte = gte.
    const effectiveGte = now > gte ? now : gte;

    const trips = await this.prisma.scheduledTrip.findMany({
      where: {
        routeId: query.routeId,
        status: TripStatus.OPEN,
        departureAt: { gte: effectiveGte, lt },
      },
      include: {
        route: { select: { name: true, baseFrontPrice: true, baseBackPrice: true } },
        driver: { select: { name: true } },
        vehicle: true,
      },
    });

    const filtered = trips.filter((trip) => {
      const hasFront = trip.frontSeatsBooked < trip.frontSeatsTotal;
      const hasBack = trip.backSeatsBooked < trip.backSeatsTotal;
      if (query.seatType === SeatType.FRONT) return hasFront;
      if (query.seatType === SeatType.BACK) return hasBack;
      return hasFront || hasBack;
    });

    const organizationNames = await this.resolveTripOrganizationNames(filtered);

    return {
      trips: filtered.map((trip) => this.toTripView(trip, {
        organizationName: organizationNames.get(trip.id) ?? '',
      })),
    };
  }

  async getTrip(tripId: string) {
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: {
        route: true,
        driver: { select: { name: true } },
        vehicle: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return { trip: this.toTripView(trip) };
  }

  async getDriverTrips(driverId: string, scope = 'all') {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');
    const now = new Date();
    const { gte, lt } = this.istDayToUtcRange(this.toIstDate(now));
    const trips = await this.prisma.scheduledTrip.findMany({
      where: {
        driverId,
        ...(scope === 'today' ? { departureAt: { gte, lt } } : scope === 'future' ? { departureAt: { gte: now } } : {}),
      },
      orderBy: { departureAt: 'desc' },
      include: {
        route: true,
        driver: { select: { name: true } },
        vehicle: true,
        _count: { select: { bookings: true } },
      },
    });
    const mapped = trips.map((trip) => this.toTripView(trip));
    return {
      trips: mapped,
      metrics: {
        totalEarningsPaise: mapped.reduce((sum, trip) => sum + trip.estimatedEarningsPaise, 0),
        openSeats: mapped.reduce((sum, trip) => sum + trip.frontSeatsLeft + trip.backSeatsLeft, 0),
        activeRoutes: new Set(mapped.map((trip) => trip.routeId)).size,
        bookings: mapped.reduce((sum, trip) => sum + trip.bookingsCount, 0),
      },
    };
  }

  async cancelTrip(tripId: string, driverId: string) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');

    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: {
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          select: { id: true, passengerId: true, paymentStatus: true, razorpayPaymentId: true, totalFare: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) {
      throw new ForbiddenException('Trip does not belong to this driver');
    }
    if (trip.status !== TripStatus.OPEN) {
      throw new BadRequestException('Only OPEN trips can be cancelled');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledTrip.update({
        where: { id: tripId },
        data: { status: TripStatus.CANCELLED },
      });
      if (trip.bookings.length > 0) {
        await tx.seatBooking.updateMany({
          where: { tripId, status: BookingStatus.CONFIRMED },
          data: { status: BookingStatus.CANCELLED },
        });
      }
      await tx.tripEvent.create({
        data: { tripId, type: 'trip.cancelled', payloadJson: { cancelledAt: now.toISOString(), by: 'driver' } },
      });
    });

    const updated = await this.prisma.scheduledTrip.findUniqueOrThrow({
      where: { id: tripId },
      include: { route: true, vehicle: true },
    });

    const cancelledPassengerIds = trip.bookings
      .filter((b) => b.passengerId)
      .map((b) => b.passengerId as string);

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({ event: 'trip.cancelled', tripId, passengerIds: cancelledPassengerIds }),
    );

    return { id: updated.id, status: updated.status, passengerIds: cancelledPassengerIds, trip: this.toTripView(updated) };
  }

  async departTrip(tripId: string, driverId: string) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');

    const trip = await this.prisma.scheduledTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) throw new ForbiddenException('Trip does not belong to this driver');
    if (trip.status !== TripStatus.OPEN) throw new BadRequestException('Only OPEN trips can be departed');

    const now = new Date();
    const diff = Math.abs(now.getTime() - trip.departureAt.getTime());
    if (diff > DEPART_WINDOW_MS) {
      throw new BadRequestException(
        `Trip can only be departed within ±30 min of scheduled time (${trip.departureAt.toISOString()})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledTrip.update({
        where: { id: tripId },
        data: { status: TripStatus.DEPARTED, departedAt: now },
      });
      await tx.tripEvent.create({
        data: { tripId, type: 'trip.departed', payloadJson: { departedAt: now.toISOString() } },
      });
    });

    const updated = await this.prisma.scheduledTrip.findUniqueOrThrow({
      where: { id: tripId },
      include: { route: true, vehicle: true },
    });

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({ event: 'trip.departed', tripId }),
    );

    return { id: updated.id, status: updated.status, departedAt: now, trip: this.toTripView(updated) };
  }

  async completeTrip(tripId: string, driverId: string) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');

    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: {
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          select: { id: true, passengerId: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) throw new ForbiddenException('Trip does not belong to this driver');
    if (trip.status !== TripStatus.DEPARTED) throw new BadRequestException('Only DEPARTED trips can be completed');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledTrip.update({
        where: { id: tripId },
        data: { status: TripStatus.COMPLETED, completedAt: now },
      });
      if (trip.bookings.length > 0) {
        await tx.seatBooking.updateMany({
          where: { tripId, status: BookingStatus.CONFIRMED },
          data: { status: BookingStatus.COMPLETED },
        });
      }
      await tx.tripEvent.create({
        data: { tripId, type: 'trip.completed', payloadJson: { completedAt: now.toISOString() } },
      });
    });

    const updated = await this.prisma.scheduledTrip.findUniqueOrThrow({
      where: { id: tripId },
      include: { route: true, vehicle: true },
    });

    const completedPassengerIds = trip.bookings
      .filter((b) => b.passengerId)
      .map((b) => b.passengerId as string);

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({ event: 'trip.completed', tripId, passengerIds: completedPassengerIds }),
    );

    return {
      id: updated.id,
      status: updated.status,
      completedAt: now,
      completedBookings: trip.bookings.length,
      passengerIds: completedPassengerIds,
      trip: this.toTripView(updated),
    };
  }

  /**
   * Auto-advance a trip to COMPLETED once none of its seats are still active
   * (CONFIRMED) and at least one was actually served (COMPLETED/NO_SHOW). Mirrors
   * the reconciler in booking-service so the last terminal transition — wherever
   * it happens — keeps trip.status from lagging behind its seats. Idempotent and
   * race-safe.
   */
  private async maybeAutoCompleteTrip(tripId: string) {
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    if (!trip || (trip.status !== TripStatus.OPEN && trip.status !== TripStatus.DEPARTED)) return;

    const counts = await this.prisma.seatBooking.groupBy({
      by: ['status'],
      where: { tripId },
      _count: { _all: true },
    });
    const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));
    const active = byStatus.get(BookingStatus.CONFIRMED) ?? 0;
    const served = (byStatus.get(BookingStatus.COMPLETED) ?? 0) + (byStatus.get(BookingStatus.NO_SHOW) ?? 0);
    if (active > 0 || served === 0) return;

    const now = new Date();
    const res = await this.prisma.scheduledTrip.updateMany({
      where: { id: tripId, status: { in: [TripStatus.OPEN, TripStatus.DEPARTED] } },
      data: { status: TripStatus.COMPLETED, completedAt: now },
    });
    if (res.count === 0) return;

    await this.prisma.tripEvent.create({
      data: {
        tripId,
        type: 'trip.auto_completed',
        payloadJson: { completedAt: now.toISOString(), reason: 'all_seats_terminal' },
      },
    });
    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({ event: 'trip.completed', tripId, auto: true, passengerIds: [] }),
    );
  }

  async markNoShow(tripId: string, bookingId: string, driverId: string, reason: string) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');
    if (!reason || !reason.trim()) throw new BadRequestException('A reason is required to mark no-show');

    const trip = await this.prisma.scheduledTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) throw new ForbiddenException('Trip does not belong to this driver');
    if (trip.status !== TripStatus.DEPARTED) {
      throw new BadRequestException('Passengers can only be marked no-show on DEPARTED trips');
    }

    const booking = await this.prisma.seatBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tripId !== tripId) throw new ForbiddenException('Booking does not belong to this trip');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(`Booking is already in status ${booking.status}`);
    }
    if (!booking.arrivedAtPickupAt) {
      throw new BadRequestException('Mark your arrival at the pickup point first');
    }
    const waitedMs = Date.now() - new Date(booking.arrivedAtPickupAt).getTime();
    if (waitedMs < 5 * 60 * 1000) {
      const remaining = Math.ceil((5 * 60 * 1000 - waitedMs) / 1000);
      throw new BadRequestException(`Wait ${remaining}s more before marking no-show (5-minute minimum)`);
    }

    await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.NO_SHOW, noShowReason: reason.trim() },
    });

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({
        event: 'booking.no_show',
        bookingId,
        tripId,
        passengerId: booking.passengerId,
      }),
    );

    // A no-show can be the last open seat (the rest already served) — close the trip out.
    await this.maybeAutoCompleteTrip(tripId);

    return { bookingId, status: BookingStatus.NO_SHOW, passengerId: booking.passengerId };
  }

  async getTripTimeline(tripId: string) {
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: { route: true, vehicle: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const events = await this.prisma.tripEvent.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });

    return { trip: this.toTripView(trip), events };
  }

  async getManifest(tripId: string, driverId: string) {
    if (!driverId) throw new BadRequestException('x-driver-id header is required');

    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: { route: true, vehicle: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) {
      throw new ForbiddenException('Trip does not belong to this driver');
    }

    const hasPremiumPickupRouting = await this.hasGrowthRoutingAccess(driverId);
    const bookings = await this.prisma.seatBooking.findMany({
      where: { tripId, status: BookingStatus.CONFIRMED },
      select: {
        id: true,
        passengerName: true,
        passengerPhone: true,
        pickupJson: true,
        dropoffJson: true,
        seatType: true,
        luggageSize: true,
        luggageSurcharge: true,
        totalFare: true,
        paymentMethod: true,
        paymentStatus: true,
        arrivedAtPickupAt: true,
        pickedUpAt: true,
        arrivedAtDropoffAt: true,
        droppedOffAt: true,
      },
    });

    return { trip: this.toTripView(trip), premiumFeatures: {
      pickupRouting: hasPremiumPickupRouting,
      requiredPlanTier: OrgPlanTier.GROWTH,
    }, passengers: bookings.map((booking) => ({
      id: booking.id,
      name: booking.passengerName,
      phone: booking.passengerPhone,
      seatType: booking.seatType,
      farePaise: booking.totalFare,
      paymentMethod: booking.paymentMethod,
      pickup: hasPremiumPickupRouting ? booking.pickupJson : null,
      dropoff: hasPremiumPickupRouting ? booking.dropoffJson : null,
      pickupPoint: hasPremiumPickupRouting ? this.locationLabel(booking.pickupJson, trip.departurePoint) : trip.departurePoint,
      luggageSize: booking.luggageSize,
      paymentStatus: booking.paymentStatus,
      arrivedAtPickupAt: booking.arrivedAtPickupAt?.toISOString() ?? null,
      pickedUpAt: booking.pickedUpAt?.toISOString() ?? null,
      arrivedAtDropoffAt: booking.arrivedAtDropoffAt?.toISOString() ?? null,
      droppedOffAt: booking.droppedOffAt?.toISOString() ?? null,
    })) };
  }

  private async hasGrowthRoutingAccess(driverId: string) {
    const membership = await this.prisma.organizationDriver.findFirst({
      where: {
        driverId,
        status: OrganizationDriverStatus.ACTIVE,
        organization: {
          status: OrganizationStatus.ACTIVE,
          planTier: { in: [OrgPlanTier.GROWTH, OrgPlanTier.ENTERPRISE] },
        },
      },
      select: { id: true },
    });

    return Boolean(membership);
  }

  private locationLabel(value: unknown, fallback: string) {
    if (!value || typeof value !== 'object') return fallback;
    const record = value as Record<string, unknown>;
    const label = record.label ?? record.address ?? record.name;
    return typeof label === 'string' && label.trim() ? label : fallback;
  }

  // "2026-05-15" in IST → UTC range [2026-05-14T18:30:00Z, 2026-05-15T18:30:00Z)
  private istDayToUtcRange(dateStr: string): { gte: Date; lt: Date } {
    const gte = new Date(`${dateStr}T00:00:00+05:30`);
    const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
    return { gte, lt };
  }

  private toIstDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private async resolveOperationalVehicle(driverId: string, vehicleId: string) {
    const assignment = await this.prisma.driverVehicleAssignment.findUnique({
      where: { driverId_vehicleId: { driverId, vehicleId } },
      include: { driver: true, vehicle: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Vehicle is not assigned to this driver');
    }

    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new ForbiddenException('Driver-vehicle assignment is not active');
    }

    if (
      assignment.driver.kycStatus !== KycStatus.APPROVED ||
      assignment.driver.complianceStatus !== ComplianceStatus.CLEAR
    ) {
      throw new ForbiddenException('Driver KYC or compliance is not approved');
    }

    if (
      assignment.vehicle.status !== VehicleStatus.ACTIVE ||
      assignment.vehicle.complianceStatus !== ComplianceStatus.CLEAR
    ) {
      throw new ForbiddenException('Vehicle is not active or compliance is not approved');
    }

    return assignment;
  }

  private async resolveTripOrganizationNames(trips: Array<{ id: string; driverId: string; vehicleId?: string | null }>) {
    const candidates = trips.filter((trip) => trip.vehicleId);
    if (candidates.length === 0) {
      return new Map<string, string>();
    }

    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: {
        status: AssignmentStatus.ACTIVE,
        active: true,
        organizationId: { not: null },
        OR: candidates.map((trip) => ({
          driverId: trip.driverId,
          vehicleId: trip.vehicleId as string,
        })),
      },
      select: { driverId: true, vehicleId: true, organizationId: true },
    });

    const organizationIds = [...new Set(assignments.flatMap((assignment) => assignment.organizationId ? [assignment.organizationId] : []))];
    if (organizationIds.length === 0) {
      return new Map<string, string>();
    }

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, legalName: true, tradeName: true },
    });
    const orgNameById = new Map(organizations.map((org) => [org.id, org.tradeName ?? org.legalName]));
    const assignmentByDriverVehicle = new Map(
      assignments.map((assignment) => [`${assignment.driverId}:${assignment.vehicleId}`, assignment]),
    );

    return new Map(
      candidates.flatMap((trip) => {
        const assignment = assignmentByDriverVehicle.get(`${trip.driverId}:${trip.vehicleId}`);
        const organizationName = assignment?.organizationId ? orgNameById.get(assignment.organizationId) : undefined;
        return organizationName ? [[trip.id, organizationName] as const] : [];
      }),
    );
  }

  private toTripView(trip: any, context?: { organizationName?: string }) {
    const frontSeatsLeft = Math.max(0, trip.frontSeatsTotal - trip.frontSeatsBooked);
    const backSeatsLeft = Math.max(0, trip.backSeatsTotal - trip.backSeatsBooked);
    const route = trip.route ?? {};
    return {
      ...trip,
      route,
      from: route.originLabel,
      to: route.destinationLabel,
      driverName: trip.driver?.name ?? 'Driver',
      organizationName: context?.organizationName ?? '',
      vehicleName: trip.vehicle?.type ?? 'Assigned vehicle',
      vehicleNumber: trip.vehicle?.plate ?? '',
      pickupPoint: trip.departurePoint,
      status: frontSeatsLeft + backSeatsLeft === 0 && trip.status === TripStatus.OPEN ? 'FULL' : trip.status,
      frontFarePaise: route.baseFrontPrice ?? 0,
      backFarePaise: route.baseBackPrice ?? 0,
      frontSeatsLeft,
      backSeatsLeft,
      frontSeatsRemaining: frontSeatsLeft,
      backSeatsRemaining: backSeatsLeft,
      bookingsCount: trip._count?.bookings ?? trip.bookings?.length ?? 0,
      estimatedEarningsPaise:
        (trip.frontSeatsBooked * (route.baseFrontPrice ?? 0)) +
        (trip.backSeatsBooked * (route.baseBackPrice ?? 0)),
      offerType: 'SEAT',
    };
  }
}

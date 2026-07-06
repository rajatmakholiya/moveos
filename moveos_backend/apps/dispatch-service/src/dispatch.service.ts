import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, RedisService } from '@common/index';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  TransportRequest,
  TransportRequestStatus,
  TransportRequestType,
  PaymentStatus,
} from '@prisma/client';
import { CreateTransportRequestDto } from './dto/dispatch.dto';

// Driver can mark a full-vehicle journey complete from 30 min before departure onwards.
const COMPLETE_GATE_MS = 30 * 60 * 1000;

const ROUTE_DURATION_HOURS: Record<string, number> = {
  'pithoragarh-dehradun': 13,
  'dehradun-pithoragarh': 13,
  'pithoragarh-haldwani': 5,
  'haldwani-pithoragarh': 5,
  'dehradun-pithoragarh-express': 12,
};
const DEFAULT_TRIP_HOURS = 16;

const pithoragarh = { id: 'geo-pth-bus', label: 'Pithoragarh Bus Stand', address: 'Roadways Station, Pithoragarh', city: 'Pithoragarh', lat: 29.5829, lng: 80.2182 };
const dehradun = { id: 'geo-ddn-isbt', label: 'ISBT Dehradun', address: 'Transport Nagar, Dehradun', city: 'Dehradun', lat: 30.2908, lng: 78.0007 };

/**
 * Transport request marketplace (SEAT / FULL_VEHICLE / PARCEL), persisted in
 * PostgreSQL. Response shapes intentionally match the original in-memory
 * implementation so the gateway/PWA/admin need no changes.
 *
 * Ride-offer dispatch (acceptRide/rejectRide) belongs to the parked on-demand
 * flow — kept as-is (Redis-atomic) but not part of the scheduled-ride product.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject('INTERNAL_EVENT_BUS') private readonly events: EventEmitter2,
  ) {}

  async acceptRide(rideId: string, driverId: string) {
    const winner = await this.redis.acceptRideAtomic(rideId, driverId);
    const payload = { rideId, driverId, winner };
    this.events.emit('dispatch.offer.accepted', payload);
    if (winner) {
      this.logger.log(`Ride ${rideId} accepted by driver ${driverId}`);
    }
    return payload;
  }

  async rejectRide(rideId: string, driverId: string) {
    const payload = { rideId, driverId };
    this.events.emit('dispatch.offer.rejected', payload);
    return payload;
  }

  async listRequests(query: { type?: string; status?: string; driverId?: string; passengerId?: string; lat?: number; lng?: number }) {
    const where: Prisma.TransportRequestWhereInput = {
      ...(query.type ? { type: query.type as TransportRequestType } : {}),
      status: (query.status as TransportRequestStatus) ?? TransportRequestStatus.REQUESTED,
      ...(query.driverId && query.status ? { acceptedByDriverId: query.driverId } : {}),
      ...(query.passengerId ? { passengerId: query.passengerId } : {}),
    };

    const rows = await this.prisma.transportRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const requests = rows
      // A driver browsing open requests shouldn't see ones they already declined
      .filter((row) => {
        if (!query.driverId || row.status !== TransportRequestStatus.REQUESTED) return true;
        return !this.rejectedBy(row).includes(query.driverId);
      })
      .map((row) => ({
        ...this.toView(row),
        ...(query.type === 'SEAT' ? { distanceKm: this.distanceKm(query.lat, query.lng, (row.pickupJson as Record<string, unknown>) ?? {}) } : {}),
      }))
      .sort((a: any, b: any) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    return { requests };
  }

  async createRequest(dto: CreateTransportRequestDto) {
    const row = await this.prisma.transportRequest.create({
      data: {
        type: (dto.type as TransportRequestType) ?? TransportRequestType.SEAT,
        status: TransportRequestStatus.REQUESTED,
        paymentStatus: PaymentStatus.PENDING,
        routeId: dto.routeId ?? 'pithoragarh-dehradun',
        fromLabel: dto.from ?? 'Pithoragarh',
        toLabel: dto.to ?? 'Dehradun',
        pickupJson: (dto.pickup ?? pithoragarh) as Prisma.InputJsonObject,
        dropoffJson: (dto.dropoff ?? dehradun) as Prisma.InputJsonObject,
        requestedFor: new Date(dto.requestedFor ?? Date.now() + 24 * 60 * 60 * 1000),
        passengerId: dto.passengerId ?? null,
        passengerName: dto.passengerName ?? 'Passenger One',
        passengerPhone: dto.passengerPhone ?? '+91 98765 43210',
        seats: dto.seats ?? 1,
        note: dto.note,
        parcelDetails: dto.parcelDetails,
        budgetPaise: dto.budgetPaise,
      },
    });
    const request = this.toView(row);
    this.events.emit('transport.request.created', request);
    await this.publishEvent('transport.request.created', { requestId: row.id, type: row.type });
    return { request, requestId: row.id };
  }

  async acceptRequest(requestId: string, driverId: string) {
    const row = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!row) return null;
    if (row.status !== TransportRequestStatus.REQUESTED && row.acceptedByDriverId !== driverId) return null;

    // Overlap check: reject if this driver already has an accepted request with an overlapping window
    const newStart = row.requestedFor.getTime();
    const newEnd = newStart + (ROUTE_DURATION_HOURS[row.routeId ?? ''] ?? DEFAULT_TRIP_HOURS) * 3_600_000;
    const acceptedByDriver = await this.prisma.transportRequest.findMany({
      where: {
        id: { not: requestId },
        acceptedByDriverId: driverId,
        status: TransportRequestStatus.ACCEPTED,
      },
    });
    const conflict = acceptedByDriver.find((existing) => {
      const exStart = existing.requestedFor.getTime();
      const exEnd = exStart + (ROUTE_DURATION_HOURS[existing.routeId ?? ''] ?? DEFAULT_TRIP_HOURS) * 3_600_000;
      return exStart < newEnd && exEnd > newStart;
    });
    if (conflict) {
      throw new ConflictException({
        message: 'You already have an accepted booking that overlaps with this time window',
        error_code: 'REQUEST_SCHEDULE_CONFLICT',
        conflictingRequestId: conflict.id,
      });
    }

    // Atomic claim — the WHERE guard means only one driver can win a REQUESTED row.
    const claimed = await this.prisma.transportRequest.updateMany({
      where: { id: requestId, status: TransportRequestStatus.REQUESTED },
      data: {
        status: TransportRequestStatus.ACCEPTED,
        acceptedByDriverId: driverId,
        bookingId: `booking-${requestId}`,
      },
    });
    if (claimed.count === 0 && row.acceptedByDriverId !== driverId) {
      throw new ConflictException({
        message: 'This request was just accepted by another driver',
        error_code: 'REQUEST_ALREADY_ACCEPTED',
      });
    }

    const updated = await this.prisma.transportRequest.findUniqueOrThrow({ where: { id: requestId } });
    this.events.emit('transport.request.accepted', { requestId, driverId });
    await this.publishEvent('transport.request.accepted', { requestId, driverId, passengerId: updated.passengerId });
    return { request: this.toView(updated), bookingId: updated.bookingId };
  }

  async rejectRequest(requestId: string, driverId: string) {
    const row = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!row) return null;
    const rejectedBy = Array.from(new Set([...this.rejectedBy(row), driverId]));
    const updated = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: { rejectedByJson: rejectedBy as Prisma.InputJsonValue },
    });
    this.events.emit('transport.request.rejected', { requestId, driverId });
    return { request: this.toView(updated) };
  }

  async completeRequest(requestId: string, driverId: string, agreedAmountPaise?: number) {
    const row = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.acceptedByDriverId !== driverId) throw new ForbiddenException('Not your request');
    if (row.status !== TransportRequestStatus.ACCEPTED) {
      throw new ConflictException(`Cannot complete a request in status ${row.status}`);
    }

    const departureAt = row.requestedFor.getTime();
    if (Date.now() < departureAt - COMPLETE_GATE_MS) {
      throw new ConflictException('Journey can only be completed from 30 minutes before the scheduled departure time');
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: {
        status: TransportRequestStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        completedAt: new Date(),
        ...(agreedAmountPaise !== undefined ? { agreedAmountPaise } : {}),
      },
    });
    this.events.emit('transport.request.completed', { requestId, driverId });
    await this.publishEvent('transport.request.completed', { requestId, driverId, passengerId: updated.passengerId });
    return { request: this.toView(updated) };
  }

  async cancelRequest(requestId: string, driverId: string) {
    const row = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.acceptedByDriverId !== driverId) throw new ForbiddenException('Not your request');
    if (row.status === TransportRequestStatus.COMPLETED || row.status === TransportRequestStatus.CANCELLED) {
      throw new ConflictException(`Cannot cancel a request in status ${row.status}`);
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: { status: TransportRequestStatus.CANCELLED, cancelledAt: new Date() },
    });
    this.events.emit('transport.request.cancelled', { requestId, driverId });
    await this.publishEvent('transport.request.cancelled', { requestId, driverId, passengerId: updated.passengerId });
    return { request: this.toView(updated) };
  }

  // ── Mapping helpers ─────────────────────────────────────────────────────────

  /** DB row → legacy response shape (what gateway/PWA/admin already consume). */
  private toView(row: TransportRequest) {
    return {
      id: row.id,
      passengerId: row.passengerId ?? undefined,
      type: row.type,
      status: row.status,
      paymentStatus: row.paymentStatus === PaymentStatus.PAID ? 'PAID' : 'PENDING',
      routeId: row.routeId ?? '',
      from: row.fromLabel,
      to: row.toLabel,
      pickup: (row.pickupJson as Record<string, unknown>) ?? {},
      dropoff: (row.dropoffJson as Record<string, unknown>) ?? {},
      requestedFor: row.requestedFor.toISOString(),
      passengerName: row.passengerName,
      passengerPhone: row.passengerPhone,
      seats: row.seats,
      note: row.note ?? undefined,
      parcelDetails: row.parcelDetails ?? undefined,
      budgetPaise: row.budgetPaise ?? undefined,
      agreedAmountPaise: row.agreedAmountPaise ?? undefined,
      acceptedByDriverId: row.acceptedByDriverId ?? undefined,
      rejectedByDriverIds: this.rejectedBy(row),
      bookingId: row.bookingId ?? undefined,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
    };
  }

  private rejectedBy(row: TransportRequest): string[] {
    return Array.isArray(row.rejectedByJson) ? (row.rejectedByJson as string[]) : [];
  }

  private async publishEvent(event: string, payload: Record<string, unknown>) {
    try {
      await this.redis.getClient().publish('pahadi:events', JSON.stringify({ event, ...payload }));
    } catch (err) {
      this.logger.warn(`Failed to publish ${event}: ${(err as Error).message}`);
    }
  }

  private distanceKm(lat: number | undefined, lng: number | undefined, place: Record<string, unknown>) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof place.lat !== 'number' || typeof place.lng !== 'number') {
      return undefined;
    }
    const dLat = this.toRadians(place.lat - lat!);
    const dLng = this.toRadians(place.lng - lng!);
    const lat1 = this.toRadians(lat!);
    const lat2 = this.toRadians(place.lat);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }
}

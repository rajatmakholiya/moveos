import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '@common/index';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

type TransportRequest = Required<Pick<CreateTransportRequestDto, 'type'>> & {
  id: string;
  passengerId?: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus: 'PENDING' | 'PAID';
  routeId: string;
  from: string;
  to: string;
  pickup: Record<string, unknown>;
  dropoff: Record<string, unknown>;
  requestedFor: string;
  passengerName: string;
  passengerPhone: string;
  seats: number;
  note?: string;
  parcelDetails?: string;
  budgetPaise?: number;
  agreedAmountPaise?: number;
  acceptedByDriverId?: string;
  rejectedByDriverIds?: string[];
  bookingId?: string;
  createdAt: string;
  completedAt?: string;
};

const pithoragarh = { id: 'geo-pth-bus', label: 'Pithoragarh Bus Stand', address: 'Roadways Station, Pithoragarh', city: 'Pithoragarh', lat: 29.5829, lng: 80.2182 };
const dehradun = { id: 'geo-ddn-isbt', label: 'ISBT Dehradun', address: 'Transport Nagar, Dehradun', city: 'Dehradun', lat: 30.2908, lng: 78.0007 };

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  private readonly transportRequests: TransportRequest[] = [
    this.buildRequest({
      type: 'SEAT',
      routeId: 'pithoragarh-dehradun',
      from: 'Pithoragarh',
      to: 'Dehradun',
      passengerName: 'Kavita Joshi',
      passengerPhone: '+91 98765 43210',
      passengerId: 'pass-seed-001',
      seats: 2,
      note: 'Can join from Siltham or bus stand.',
    }, 'req-seat-1001'),
    this.buildRequest({
      type: 'FULL_VEHICLE',
      routeId: 'pithoragarh-dehradun',
      from: 'Pithoragarh',
      to: 'Dehradun',
      passengerName: 'Mehra family',
      passengerPhone: '+91 99887 76655',
      passengerId: 'pass-seed-002',
      seats: 5,
      budgetPaise: 1150000,
    }, 'req-full-2001'),
    this.buildRequest({
      type: 'PARCEL',
      routeId: 'pithoragarh-haldwani',
      from: 'Pithoragarh',
      to: 'Haldwani',
      passengerName: 'Sharma Store',
      passengerPhone: '+91 91234 56789',
      passengerId: 'pass-seed-001',
      seats: 0,
      parcelDetails: '2 sealed medicine cartons',
      budgetPaise: 90000,
    }, 'req-parcel-3001'),
  ];

  constructor(
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

  listRequests(query: { type?: string; status?: string; driverId?: string; passengerId?: string; lat?: number; lng?: number }) {
    const requests = this.transportRequests
      .filter((request) => (query.type ? request.type === query.type : true))
      .filter((request) => (query.status ? request.status === query.status : request.status === 'REQUESTED'))
      .filter((request) => (query.driverId ? request.acceptedByDriverId === query.driverId : true))
      .filter((request) => (query.passengerId ? request.passengerId === query.passengerId : true))
      .filter((request) => (query.driverId && request.status === 'REQUESTED' ? !request.rejectedByDriverIds?.includes(query.driverId) : true))
      .map((request) => ({
        ...request,
        ...(query.type === 'SEAT' ? { distanceKm: this.distanceKm(query.lat, query.lng, request.pickup) } : {}),
      }))
      .sort((a: any, b: any) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    return { requests };
  }

  createRequest(dto: CreateTransportRequestDto) {
    const request = this.buildRequest(dto, `req-${Date.now()}`);
    this.transportRequests.unshift(request);
    this.events.emit('transport.request.created', request);
    return { request, requestId: request.id };
  }

  acceptRequest(requestId: string, driverId: string) {
    const request = this.transportRequests.find((item) => item.id === requestId);
    if (!request) return null;
    if (request.status !== 'REQUESTED' && request.acceptedByDriverId !== driverId) return null;

    // Overlap check: reject if this driver already has an accepted request with an overlapping window
    const newStart = new Date(request.requestedFor).getTime();
    const newEnd = newStart + (ROUTE_DURATION_HOURS[request.routeId] ?? DEFAULT_TRIP_HOURS) * 3_600_000;
    const conflict = this.transportRequests.find((existing) => {
      if (existing.id === requestId || existing.acceptedByDriverId !== driverId || existing.status !== 'ACCEPTED') return false;
      const exStart = new Date(existing.requestedFor).getTime();
      const exEnd = exStart + (ROUTE_DURATION_HOURS[existing.routeId] ?? DEFAULT_TRIP_HOURS) * 3_600_000;
      return exStart < newEnd && exEnd > newStart;
    });
    if (conflict) {
      throw new ConflictException({
        message: 'You already have an accepted booking that overlaps with this time window',
        error_code: 'REQUEST_SCHEDULE_CONFLICT',
        conflictingRequestId: conflict.id,
      });
    }

    request.status = 'ACCEPTED';
    request.acceptedByDriverId = driverId;
    request.bookingId = `booking-${requestId}`;
    this.events.emit('transport.request.accepted', { requestId, driverId });
    return { request, bookingId: request.bookingId };
  }

  rejectRequest(requestId: string, driverId: string) {
    const request = this.transportRequests.find((item) => item.id === requestId);
    if (!request) return null;
    request.rejectedByDriverIds = Array.from(new Set([...(request.rejectedByDriverIds ?? []), driverId]));
    this.events.emit('transport.request.rejected', { requestId, driverId });
    return { request };
  }

  completeRequest(requestId: string, driverId: string, agreedAmountPaise?: number) {
    const request = this.transportRequests.find((item) => item.id === requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.acceptedByDriverId !== driverId) throw new ForbiddenException('Not your request');
    if (request.status !== 'ACCEPTED') throw new ConflictException(`Cannot complete a request in status ${request.status}`);

    const departureAt = new Date(request.requestedFor).getTime();
    if (Date.now() < departureAt - COMPLETE_GATE_MS) {
      throw new ConflictException('Journey can only be completed from 30 minutes before the scheduled departure time');
    }

    request.status = 'COMPLETED';
    request.paymentStatus = 'PAID';
    request.completedAt = new Date().toISOString();
    if (agreedAmountPaise !== undefined) {
      request.agreedAmountPaise = agreedAmountPaise;
    }
    this.events.emit('transport.request.completed', { requestId, driverId });
    return { request };
  }

  cancelRequest(requestId: string, driverId: string) {
    const request = this.transportRequests.find((item) => item.id === requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.acceptedByDriverId !== driverId) throw new ForbiddenException('Not your request');
    if (request.status === 'COMPLETED' || request.status === 'CANCELLED') {
      throw new ConflictException(`Cannot cancel a request in status ${request.status}`);
    }

    request.status = 'CANCELLED';
    this.events.emit('transport.request.cancelled', { requestId, driverId });
    return { request };
  }

  private buildRequest(dto: CreateTransportRequestDto, id: string): TransportRequest {
    return {
      id,
      passengerId: dto.passengerId,
      type: dto.type ?? 'SEAT',
      status: 'REQUESTED',
      paymentStatus: 'PENDING',
      routeId: dto.routeId ?? 'pithoragarh-dehradun',
      from: dto.from ?? 'Pithoragarh',
      to: dto.to ?? 'Dehradun',
      pickup: dto.pickup ?? pithoragarh,
      dropoff: dto.dropoff ?? dehradun,
      requestedFor: dto.requestedFor ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      passengerName: dto.passengerName ?? 'Passenger One',
      passengerPhone: dto.passengerPhone ?? '+91 98765 43210',
      seats: dto.seats ?? 1,
      note: dto.note,
      parcelDetails: dto.parcelDetails,
      budgetPaise: dto.budgetPaise,
      createdAt: new Date().toISOString(),
    };
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

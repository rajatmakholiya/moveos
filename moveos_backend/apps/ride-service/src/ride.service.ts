import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService, RedisService } from '@common/index';
import { RideStatus } from '@prisma/client';

@Injectable()
export class RideService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async arrived(rideId: string, driverId: string) {
    return this.transitionStatus(rideId, driverId, RideStatus.ARRIVED, { eventType: 'ride.arrived' });
  }

  async start(rideId: string, driverId: string, riderOtp: string) {
    if (!riderOtp) {
      throw new BadRequestException('Missing riderOtp');
    }
    return this.transitionStatus(rideId, driverId, RideStatus.STARTED, {
      eventType: 'ride.started',
      riderOtp,
      startedAt: new Date(),
    });
  }

  async complete(rideId: string, driverId: string) {
    const result = await this.transitionStatus(rideId, driverId, RideStatus.COMPLETED, {
      eventType: 'ride.completed',
      completedAt: new Date(),
    });
    await this.redis.setActiveRide(driverId, null);
    return result;
  }

  async cancel(rideId: string, driverId: string, reason?: string) {
    return this.transitionStatus(rideId, driverId, RideStatus.CANCELLED, {
      eventType: 'ride.cancelled',
      reason,
      cancelledAt: new Date(),
    });
  }

  private async transitionStatus(
    rideId: string,
    driverId: string,
    status: RideStatus,
    payload: Record<string, any>,
  ) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    const eventPayload = this.serializePayload(payload);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRide = await tx.ride.update({
        where: { id: rideId },
        data: {
          status,
          driverId: ride.driverId ?? driverId,
          startedAt: payload.startedAt ?? undefined,
          completedAt: payload.completedAt ?? undefined,
          cancelledAt: payload.cancelledAt ?? undefined,
        },
      });
      await tx.rideEvent.create({
        data: {
          rideId,
          type: payload.eventType ?? `ride.${status.toLowerCase()}`,
          payloadJson: eventPayload,
        },
      });
      return updatedRide;
    });
    if (status === RideStatus.STARTED || status === RideStatus.ARRIVED) {
      await this.redis.setActiveRide(driverId, rideId);
    }
    return updated;
  }

  private serializePayload(payload: Record<string, any>) {
    const clone: Record<string, any> = { ...payload };
    ['startedAt', 'completedAt', 'cancelledAt'].forEach((key) => {
      if (clone[key]) {
        clone[key] = new Date(clone[key]).toISOString();
      }
    });
    return clone;
  }
}

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { PrismaService } from '@common/index';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*' },
})
export class GatewayEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GatewayEventsGateway.name);
  private redisSubscriber: Redis | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const sub = new Redis(redisUrl, { lazyConnect: true });
    this.redisSubscriber = sub;

    sub.on('error', (err: Error) => this.logger.error('Redis subscriber error', err.message));

    await sub.connect();
    await sub.psubscribe('pahadi:location:*');
    await sub.subscribe('pahadi:events');

    sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const driverId = channel.slice('pahadi:location:'.length);
      try {
        const data = JSON.parse(message) as { lat: number; lng: number; driverId: string; updatedAt: string };
        this.server.to(`location:${driverId}`).emit('driver.location', data);
      } catch { /* malformed payload — skip */ }
    });

    // Business events → socket rooms, so manifests and booking pages update live
    // instead of waiting for the next poll.
    sub.on('message', (_channel: string, message: string) => {
      try {
        const evt = JSON.parse(message) as {
          event?: string;
          bookingId?: string;
          tripId?: string;
          driverId?: string;
        };
        switch (evt.event) {
          case 'booking.paid':
          case 'booking.cancelled':
            if (evt.tripId) {
              this.server.to(`trip:${evt.tripId}`).emit('trip.bookings.updated', evt);
            }
            if (evt.bookingId) {
              this.server.to(`booking:${evt.bookingId}`).emit('booking.status.updated', evt);
            }
            break;
          case 'trip.departed':
          case 'trip.completed':
            if (evt.tripId) {
              this.server.to(`trip:${evt.tripId}`).emit('trip.status.updated', evt);
            }
            break;
          default:
            break;
        }
      } catch { /* malformed payload — skip */ }
    });

    this.logger.log('Redis subscribers active (pahadi:location:*, pahadi:events)');
  }

  async onModuleDestroy() {
    await this.redisSubscriber?.quit();
    this.redisSubscriber = null;
  }

  // ── Socket lifecycle ───────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    const { driverId, rideId, passengerId, tripId } = client.handshake.query;
    if (driverId) client.join(`driver:${driverId}`);
    if (rideId) client.join(`ride:${rideId}`);
    if (passengerId) client.join(`passenger:${passengerId}`);
    if (tripId) client.join(`trip:${tripId}`);
    this.logger.log(`WS connected  ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS disconnected ${client.id}`);
  }

  // ── Client → server ────────────────────────────────────────────────────────

  @SubscribeMessage('joinRide')
  handleJoinRide(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string }) {
    client.join(`ride:${data.rideId}`);
    return { joined: true };
  }

  @SubscribeMessage('joinTrip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    client.join(`trip:${data.tripId}`);
    return { joined: true };
  }

  /**
   * Passenger subscribes to live tracking for a booking.
   * Resolves bookingId → driverId and joins the socket into
   * `location:{driverId}` so every driver.location Redis publish
   * is forwarded to this client instantly.
   */
  @SubscribeMessage('track:booking')
  async handleTrackBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bookingId: string },
  ) {
    try {
      const booking = await this.prisma.seatBooking.findUnique({
        where: { id: data.bookingId },
        include: { trip: true },
      });
      if (!booking) return { error: 'Booking not found' };

      const { driverId } = booking.trip;
      client.join(`location:${driverId}`);
      client.join(`booking:${data.bookingId}`);
      this.logger.log(`${client.id} subscribed → location:${driverId} (booking ${data.bookingId})`);
      return { ok: true, driverId, tripId: booking.tripId };
    } catch {
      return { error: 'Subscription failed' };
    }
  }

  /**
   * Admin live-fleet tracking. The client first fetches the REST snapshot
   * (`GET /admin/live-tracking`) which returns the active drivers, then calls
   * this with their driverIds to stream every subsequent `driver.location`
   * publish for the whole fleet over one socket.
   */
  @SubscribeMessage('track:drivers')
  handleTrackDrivers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverIds: string[] },
  ) {
    const ids = Array.isArray(data?.driverIds) ? data.driverIds.filter((id) => typeof id === 'string') : [];
    for (const id of ids) client.join(`location:${id}`);
    this.logger.log(`${client.id} tracking ${ids.length} drivers`);
    return { ok: true, count: ids.length };
  }

  @SubscribeMessage('untrack:drivers')
  handleUntrackDrivers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverIds: string[] },
  ) {
    const ids = Array.isArray(data?.driverIds) ? data.driverIds.filter((id) => typeof id === 'string') : [];
    for (const id of ids) client.leave(`location:${id}`);
    return { ok: true };
  }

  @SubscribeMessage('track:driver')
  handleTrackDriver(@ConnectedSocket() client: Socket, @MessageBody() data: { driverId: string }) {
    if (data?.driverId) client.join(`location:${data.driverId}`);
    return { ok: true };
  }

  // ── Server → client helpers (called by HTTP controllers) ──────────────────

  emitOfferNew(driverId: string, payload: any) {
    this.server.to(`driver:${driverId}`).emit('offer.new', payload);
  }

  emitOfferClosed(driverId: string, payload: any) {
    this.server.to(`driver:${driverId}`).emit('offer.closed', payload);
  }

  emitRideUpdated(rideId: string, payload: any) {
    this.server.to(`ride:${rideId}`).emit('ride.status.updated', payload);
  }

  emitComplianceBlocked(driverId: string, payload: any) {
    this.server.to(`driver:${driverId}`).emit('compliance.blocked', payload);
  }

  emitDriverLocation(driverId: string, payload: any) {
    this.server.to(`driver:${driverId}`).emit('driver.location.updated', payload);
  }

  emitTripUpdated(tripId: string, payload: any) {
    this.server.to(`trip:${tripId}`).emit('trip.status.updated', payload);
  }

  emitBookingUpdated(passengerId: string, payload: any) {
    this.server.to(`passenger:${passengerId}`).emit('booking.status.updated', payload);
  }
}

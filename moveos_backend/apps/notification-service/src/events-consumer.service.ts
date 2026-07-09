import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService, RedisService } from '@common/index';
import { NotificationService } from './notification.service';

const EVENTS_CHANNEL = 'pahadi:events';
// Where booking-service stores the plain pickup OTP for passenger display/SMS.
const PICKUP_OTP_CODE_PREFIX = 'pickup:otp:code:';

type BusEvent = {
  event?: string;
  bookingId?: string;
  tripId?: string;
  driverId?: string;
  passengerId?: string | null;
  passengerIds?: string[];
  phone?: string | null;
  refundAmount?: number | null;
};

/**
 * The cross-service notification fan-out. Every business event published to
 * `pahadi:events` by booking/scheduling/dispatch services lands here and is
 * delivered to the right person via push and/or SMS.
 */
@Injectable()
export class EventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsConsumerService.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const sub = new Redis(redisUrl, { lazyConnect: true });
    this.subscriber = sub;
    sub.on('error', (err: Error) => this.logger.error('Events subscriber error', err.message));

    await sub.connect();
    await sub.subscribe(EVENTS_CHANNEL);
    sub.on('message', (_channel: string, message: string) => {
      let evt: BusEvent;
      try {
        evt = JSON.parse(message);
      } catch {
        return;
      }
      void this.handle(evt).catch((err) =>
        this.logger.warn(`Notification handling failed for ${evt.event}: ${(err as Error).message}`),
      );
    });

    this.logger.log(`Notification events consumer active (${EVENTS_CHANNEL})`);
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
    this.subscriber = null;
  }

  private async handle(evt: BusEvent) {
    switch (evt.event) {
      case 'pickup.otp_issued':
        return this.onPickupOtpIssued(evt);
      case 'booking.paid':
        return this.onBookingPaid(evt);
      case 'booking.cancelled':
        return this.onBookingCancelled(evt);
      case 'trip.departed':
        return this.onTripDeparted(evt);
      case 'trip.completed':
        return this.onTripCompleted(evt);
      default:
        return;
    }
  }

  /** SMS the pickup OTP to the passenger (also visible in-app). */
  private async onPickupOtpIssued(evt: BusEvent) {
    if (!evt.bookingId || !evt.phone) return;
    const otp = await this.redis.getClient().get(`${PICKUP_OTP_CODE_PREFIX}${evt.bookingId}`);
    if (!otp) return;
    await this.notifications.sendSms(
      evt.phone,
      `Your Pahadi Rides boarding code is ${otp}. Share it with your driver at pickup.`,
    );
    if (evt.passengerId) {
      await this.notifications.pushToPassenger(evt.passengerId, 'Boarding code', `Your boarding code is ${otp}`, {
        bookingId: evt.bookingId,
        type: 'pickup_otp',
      });
    }
  }

  /** Tell the driver a seat on their trip was just paid for. */
  private async onBookingPaid(evt: BusEvent) {
    if (!evt.bookingId) return;
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: evt.bookingId },
      include: { trip: { include: { route: true } } },
    });
    if (!booking) return;
    await this.notifications.pushToDriver(
      booking.trip.driverId,
      'New booking',
      `${booking.passengerName} booked a ${booking.seatType} seat on ${booking.trip.route.name}`,
      { bookingId: booking.id, tripId: booking.tripId, type: 'booking_paid' },
    );
  }

  /** Tell the driver a booking was cancelled; confirm refund to the passenger. */
  private async onBookingCancelled(evt: BusEvent) {
    if (!evt.bookingId) return;
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: evt.bookingId },
      include: { trip: { include: { route: true } } },
    });
    if (!booking) return;
    await this.notifications.pushToDriver(
      booking.trip.driverId,
      'Booking cancelled',
      `${booking.passengerName} cancelled their ${booking.seatType} seat on ${booking.trip.route.name}`,
      { bookingId: booking.id, tripId: booking.tripId, type: 'booking_cancelled' },
    );
    if (evt.refundAmount && booking.passengerPhone) {
      await this.notifications.sendSms(
        booking.passengerPhone,
        `Your Pahadi Rides booking is cancelled. Refund of ₹${(evt.refundAmount / 100).toFixed(0)} is on its way (3-5 business days).`,
      );
    }
  }

  /** Tell every confirmed passenger their driver has departed. */
  private async onTripDeparted(evt: BusEvent) {
    if (!evt.tripId) return;
    const bookings = await this.prisma.seatBooking.findMany({
      where: { tripId: evt.tripId, status: 'CONFIRMED' },
      select: { id: true, passengerId: true, passengerName: true, passengerPhone: true },
    });
    for (const booking of bookings) {
      if (booking.passengerId) {
        await this.notifications.pushToPassenger(
          booking.passengerId,
          'Driver on the way',
          'Your driver has started the trip. Track them live in the app.',
          { bookingId: booking.id, type: 'trip_departed' },
        );
      }
    }
  }

  /** Prompt passengers to rate the completed trip. */
  private async onTripCompleted(evt: BusEvent) {
    if (!evt.tripId) return;
    const passengerIds = (evt.passengerIds ?? []).filter(Boolean);
    for (const passengerId of passengerIds) {
      await this.notifications.pushToPassenger(
        passengerId,
        'Trip completed',
        'Thanks for travelling with Pahadi Rides! Tap to rate your driver.',
        { tripId: evt.tripId, type: 'trip_completed' },
      );
    }
  }
}

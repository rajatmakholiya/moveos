import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@common/index';
import { RedisService } from '@common/index';
import { RazorpayService } from '../razorpay/razorpay.service';
import { InvoiceGeneratorService } from './invoice-generator.service';
import { AccountType, TripStatus, SeatType, LuggageSize, PaymentMethod, PaymentStatus, BookingStatus, Prisma, WalletEntryType } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaymentConfirmDto } from './dto/payment-confirm.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { VerifyPickupOtpDto } from './dto/verify-pickup-otp.dto';
import { toBookingDto } from './booking.mapper';

// OTPs are issued at navigation-start (trip departure), so they must survive the
// whole pickup leg, not a 10-min arrival window. A long TTL is safe because
// verification is geofence-gated — the code is useless unless the driver is
// physically at the pickup point.
const PICKUP_OTP_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const OTP_HASH_PREFIX = 'pickup:otp:hash:';
const OTP_CODE_PREFIX = 'pickup:otp:code:';
// How far the driver may be from the pickup point and still verify the OTP. When
// no recent GPS fix exists (mountain dead zone) the gate is skipped — see verifyPickupOtp.
const OTP_VERIFY_MAX_DISTANCE_M = 250;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return haversineKm(a, b) * 1000;
}

// Geofence radii (metres). Enter is within the 100–200 m "arrived" band; the wider
// exit radius means the driver has clearly left a dropoff, so the passenger is dropped.
const GEOFENCE_ENTER_M = 150;
const GEOFENCE_EXIT_M = 300;

const LUGGAGE_SURCHARGE: Record<LuggageSize, number> = {
  [LuggageSize.SMALL]: 0,
  [LuggageSize.LARGE]: 5000,
  [LuggageSize.OVERSIZED]: 15000,
};

// Cancellation policy (hours before scheduled departure → refund % of total fare).
// Matches the fare-summary copy shown to passengers: "Free before 12 hrs".
// Overridable via env for regional tuning without a deploy.
const CANCELLATION_FREE_HOURS = Number(process.env.CANCELLATION_FREE_HOURS ?? 12);
const CANCELLATION_PARTIAL_HOURS = Number(process.env.CANCELLATION_PARTIAL_HOURS ?? 2);
const CANCELLATION_PARTIAL_PERCENT = Number(process.env.CANCELLATION_PARTIAL_PERCENT ?? 50);

export function refundPercentFor(departureAt: Date, cancelledAt: Date = new Date()): number {
  const hoursToDeparture = (departureAt.getTime() - cancelledAt.getTime()) / 3_600_000;
  if (hoursToDeparture >= CANCELLATION_FREE_HOURS) return 100;
  if (hoursToDeparture >= CANCELLATION_PARTIAL_HOURS) return CANCELLATION_PARTIAL_PERCENT;
  return 0;
}

// Platform commission on fares (percent). Online fares are held by the platform,
// so the driver is credited net of commission; cash fares are held by the driver,
// so the platform's cut is debited from their wallet when cash is marked collected.
const PLATFORM_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT ?? 10);

function commissionOf(amountPaise: number): number {
  return Math.floor((amountPaise * PLATFORM_COMMISSION_PERCENT) / 100);
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly razorpay: RazorpayService,
    private readonly invoiceGenerator: InvoiceGeneratorService,
  ) {}

  /**
   * Generate (and lazily register) the invoice PDF for a booking. Returned as
   * base64 over the internal boundary; the gateway streams application/pdf.
   * Invoices are only issued once payment has actually happened.
   */
  async getInvoicePdf(bookingId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: { include: { route: true, driver: true, vehicle: true } }, invoice: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.paymentStatus !== PaymentStatus.PAID && booking.paymentStatus !== PaymentStatus.REFUNDED) {
      throw new BadRequestException({
        message: 'Invoice is available after payment is completed',
        error_code: 'invoice_not_available',
      });
    }

    // Idempotent invoice number: reuse the existing record or mint the next one.
    const invoice =
      booking.invoice ??
      (await this.prisma.$transaction(async (tx) => {
        const count = await tx.invoiceRecord.count();
        const year = new Date().getFullYear();
        return tx.invoiceRecord.create({
          data: {
            bookingId,
            invoiceNo: `INV-${year}-${String(count + 1).padStart(6, '0')}`,
          },
        });
      }));

    const pdf = await this.invoiceGenerator.generateBookingInvoice({
      invoiceNo: invoice.invoiceNo,
      issuedAt: invoice.issuedAt,
      passengerName: booking.passengerName,
      passengerPhone: booking.passengerPhone,
      gstin: booking.gstin ?? undefined,
      routeName: booking.trip.route.name,
      departureAt: booking.trip.departureAt,
      seatType: booking.seatType,
      baseFare: booking.baseFare,
      luggageSurcharge: booking.luggageSurcharge,
      totalFare: booking.totalFare,
      paymentMethod: booking.paymentMethod === PaymentMethod.CASH ? 'CASH' : 'UPI',
      paymentStatus: booking.paymentStatus,
      driverName: booking.trip.driver.name,
      vehicleNumber: booking.trip.vehicle?.plate ?? '—',
      bookingId: booking.id,
    });

    return {
      invoiceNo: invoice.invoiceNo,
      fileName: `${invoice.invoiceNo}.pdf`,
      contentType: 'application/pdf',
      base64: pdf.toString('base64'),
      passengerId: booking.passengerId,
      driverId: booking.trip.driverId,
    };
  }

  async createBooking(dto: CreateBookingDto) {
    // 1. Fetch trip and verify status
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: dto.tripId },
      include: { route: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== TripStatus.OPEN) {
      throw new BadRequestException(`Trip is not open for bookings (status: ${trip.status})`);
    }

    // 2. Acquire Redis seat lock — serialises concurrent same-type bookings on this trip
    const lockKey = `booking:lock:${dto.tripId}:${dto.seatType}`;
    const acquired = await this.redis.getClient().set(lockKey, '1', 'EX', 30, 'NX');
    if (!acquired) {
      throw new ConflictException({
        message: `Another booking is in progress for ${dto.seatType} seats on this trip. Please retry.`,
        retryAfterSeconds: 5,
      });
    }

    try {
      // 3. Re-check seat availability inside the lock (read from DB)
      const fresh = await this.prisma.scheduledTrip.findUniqueOrThrow({ where: { id: dto.tripId } });
      const seatsAvailable =
        dto.seatType === SeatType.FRONT
          ? fresh.frontSeatsBooked < fresh.frontSeatsTotal
          : fresh.backSeatsBooked < fresh.backSeatsTotal;
      if (!seatsAvailable) {
        throw new BadRequestException(`No ${dto.seatType} seats available`);
      }

      // 4. Calculate fares
      const baseFare =
        dto.seatType === SeatType.FRONT ? trip.route.baseFrontPrice : trip.route.baseBackPrice;
      const luggageSurcharge = LUGGAGE_SURCHARGE[dto.luggageSize];
      const totalFare = baseFare + luggageSurcharge;

      // 5. Create Razorpay order for UPI before writing to DB
      let razorpayOrderId: string | undefined;
      let razorpayOrderPayload: { orderId: string; amount: number; currency: string } | undefined;

      if (dto.paymentMethod === PaymentMethod.UPI) {
        const order = await this.razorpay.createOrder(totalFare, `booking_${Date.now()}`);
        razorpayOrderId = order.id;
        razorpayOrderPayload = {
          orderId: order.id,
          amount: Number(order.amount),
          currency: order.currency,
        };
      }

      // 6 & 7. Create booking + increment seat count atomically
      const booking = await this.prisma.$transaction(async (tx) => {
        const created = await tx.seatBooking.create({
          data: {
            tripId: dto.tripId,
            passengerId: dto.passengerId,
            agentId: dto.agentId,
            passengerName: dto.passengerName,
            passengerPhone: dto.passengerPhone,
            pickupJson: dto.pickup as Prisma.InputJsonObject | undefined,
            dropoffJson: dto.dropoff as Prisma.InputJsonObject | undefined,
            seatType: dto.seatType,
            luggageSize: dto.luggageSize,
            luggageSurcharge,
            baseFare,
            totalFare,
            paymentMethod: dto.paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
            razorpayOrderId,
            emergencyContact: dto.emergencyContact,
            gstin: dto.gstin,
          },
        });
        await tx.scheduledTrip.update({
          where: { id: dto.tripId },
          data:
            dto.seatType === SeatType.FRONT
              ? { frontSeatsBooked: { increment: 1 } }
              : { backSeatsBooked: { increment: 1 } },
        });
        return created;
      });

      // 8. Return booking with fare breakdown (and Razorpay order for UPI)
      return {
        bookingId: booking.id,
        id: booking.id,
        booking,
        fareBreakdown: { baseFare, luggageSurcharge, totalFare },
        ...(razorpayOrderPayload && { razorpayOrder: razorpayOrderPayload }),
      };
    } finally {
      // 9. Always release the lock
      await this.redis.getClient().del(lockKey);
    }
  }

  async confirmPayment(bookingId: string, dto: PaymentConfirmDto) {
    const booking = await this.prisma.seatBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.razorpayOrderId) {
      throw new BadRequestException('No Razorpay order associated with this booking');
    }

    this.razorpay.verifyPaymentSignature(
      booking.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );

    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        razorpayPaymentId: dto.razorpayPaymentId,
      },
      include: { trip: { select: { driverId: true } } },
    });

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({
        event: 'booking.paid',
        bookingId,
        tripId: updated.tripId,
        driverId: updated.trip.driverId,
        passengerId: updated.passengerId,
      }),
    );

    return updated;
  }

  async cancelBooking(bookingId: string, dto: CancelBookingDto) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }
    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Completed bookings cannot be cancelled');
    }
    if (booking.pickedUpAt) {
      throw new BadRequestException('Booking cannot be cancelled after pickup');
    }

    // Time-based cancellation policy → refund amount
    const cancelledAt = new Date();
    const refundPercent = refundPercentFor(booking.trip.departureAt, cancelledAt);
    const refundDue = Math.floor((booking.totalFare * refundPercent) / 100);

    // Issue the refund BEFORE mutating booking state — if Razorpay rejects it we
    // leave the booking untouched rather than cancelling without refunding.
    let refundId: string | null = null;
    let refundedAmount: number | null = null;
    let refundedAt: Date | null = null;
    if (booking.paymentStatus === PaymentStatus.PAID && booking.razorpayPaymentId && refundDue > 0) {
      const refund = await this.razorpay.refundPayment(booking.razorpayPaymentId, refundDue, bookingId);
      refundId = refund.refundId;
      refundedAmount = refund.amountPaise;
      refundedAt = cancelledAt;
    }

    const wasPaid = booking.paymentStatus === PaymentStatus.PAID;
    // Decrement seat count and set booking cancelled atomically
    await this.prisma.$transaction([
      this.prisma.seatBooking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt,
          cancellationReason: dto.reason ?? null,
          ...(refundId
            ? { paymentStatus: PaymentStatus.REFUNDED, refundId, refundAmount: refundedAmount, refundedAt }
            : {}),
        },
      }),
      this.prisma.scheduledTrip.update({
        where: { id: booking.tripId },
        data:
          booking.seatType === SeatType.FRONT
            ? { frontSeatsBooked: { decrement: 1 } }
            : { backSeatsBooked: { decrement: 1 } },
      }),
    ]);

    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({
        event: 'booking.cancelled',
        bookingId,
        tripId: booking.tripId,
        driverId: booking.trip.driverId,
        refundAmount: refundedAmount,
        refundPercent,
      }),
    );

    // A cancellation can leave a trip with no active seats (the rest already served) — close it out.
    await this.maybeAutoCompleteTrip(booking.tripId);

    return {
      bookingId,
      status: BookingStatus.CANCELLED,
      refund: {
        percent: refundPercent,
        amount: refundedAmount ?? (wasPaid ? refundDue : 0),
        refundId,
        // PAID cash bookings have no online refund path; policy amount is informational
        method: refundId ? 'razorpay' : 'none',
      },
    };
  }

  async collectCash(bookingId: string, driverId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) {
      throw new ForbiddenException('Booking does not belong to a trip driven by this driver');
    }
    if (booking.paymentMethod !== 'CASH') {
      throw new BadRequestException('Cash collection is only for CASH payment bookings');
    }
    if (booking.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Cash has already been collected for this booking');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(`Booking is in status ${booking.status} — cannot collect cash`);
    }

    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: { paymentStatus: PaymentStatus.PAID, status: BookingStatus.COMPLETED },
    });

    // The driver now physically holds the fare — debit the platform's commission
    // from their wallet. Idempotent per booking.
    const commission = commissionOf(booking.totalFare);
    if (commission > 0) {
      const existing = await this.prisma.walletLedger.findFirst({
        where: { refType: 'PLATFORM_FEE_CASH', refId: bookingId },
      });
      if (!existing) {
        await this.prisma.walletLedger.create({
          data: {
            accountType: AccountType.DRIVER,
            accountId: driverId,
            amount: commission,
            entryType: WalletEntryType.DEBIT,
            refType: 'PLATFORM_FEE_CASH',
            refId: bookingId,
          },
        });
      }
    }

    await this.redis
      .getClient()
      .publish('pahadi:events', JSON.stringify({ event: 'booking.cash_collected', bookingId, passengerId: booking.passengerId }));

    await this.maybeAutoCompleteTrip(booking.tripId);

    return { bookingId: updated.id, status: updated.status, paymentStatus: updated.paymentStatus };
  }

  /**
   * Auto-advance a trip to COMPLETED once none of its seats are still active
   * (CONFIRMED) and at least one actually completed. `trip.status` is the source
   * of truth for lifecycle classification (Upcoming/Ongoing/Past); without this
   * it lags behind its seats whenever the driver forgets to tap "complete trip",
   * leaving a finished journey stuck under Upcoming. Idempotent and race-safe —
   * safe to call after every terminal booking transition.
   */
  private async maybeAutoCompleteTrip(tripId: string) {
    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    // Only an in-flight trip can auto-complete; terminal trips are left as-is.
    if (!trip || (trip.status !== TripStatus.OPEN && trip.status !== TripStatus.DEPARTED)) return;

    const counts = await this.prisma.seatBooking.groupBy({
      by: ['status'],
      where: { tripId },
      _count: { _all: true },
    });
    const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));
    const active = byStatus.get(BookingStatus.CONFIRMED) ?? 0;
    const served = (byStatus.get(BookingStatus.COMPLETED) ?? 0) + (byStatus.get(BookingStatus.NO_SHOW) ?? 0);
    // Still carrying confirmed seats, or the trip never served anyone (all cancelled) — don't complete.
    if (active > 0 || served === 0) return;

    const now = new Date();
    // Conditional updateMany guards the OPEN/DEPARTED→COMPLETED transition against
    // a concurrent completion; count===0 means we lost the race and someone already closed it.
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
    await this.redis
      .getClient()
      .publish('pahadi:events', JSON.stringify({ event: 'trip.completed', tripId, auto: true, passengerIds: [] }));
    this.logger.log(`Trip ${tripId} auto-completed: all seats terminal`);
  }

  /**
   * Safety-net sweep: heals trips that got stuck in OPEN/DEPARTED with no active
   * seats — e.g. completed before this reconciler existed, or while the service was
   * down so the terminal-transition event was missed. Runs the same idempotent
   * predicate as maybeAutoCompleteTrip on every candidate. Returns how many healed.
   */
  async sweepStuckTrips() {
    const candidates = await this.prisma.scheduledTrip.findMany({
      where: {
        status: { in: [TripStatus.OPEN, TripStatus.DEPARTED] },
        bookings: { none: { status: BookingStatus.CONFIRMED } }, // no active seats left
      },
      select: { id: true },
    });

    let healed = 0;
    for (const { id } of candidates) {
      const before = await this.prisma.scheduledTrip.findUnique({ where: { id }, select: { status: true } });
      await this.maybeAutoCompleteTrip(id); // re-checks "served ≥ 1" so all-cancelled trips are left alone
      const after = await this.prisma.scheduledTrip.findUnique({ where: { id }, select: { status: true } });
      if (before?.status !== after?.status) healed++;
    }
    if (healed > 0) this.logger.log(`Sweep healed ${healed} stuck trip(s)`);
    return { candidates: candidates.length, healed };
  }

  async getBooking(bookingId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: {
        trip: { include: { route: true, driver: true, vehicle: true } },
        invoice: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return {
      ...toBookingDto(booking),
      fareBreakdown: {
        baseFare: booking.baseFare,
        luggageSurcharge: booking.luggageSurcharge,
        totalFare: booking.totalFare,
      },
    };
  }

  // ── Pickup flow ────────────────────────────────────────────────────────────

  async arriveAtPickup(bookingId: string, driverId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (booking.trip.status !== 'DEPARTED') throw new BadRequestException('Trip must be DEPARTED');
    if (booking.status !== BookingStatus.CONFIRMED) throw new BadRequestException(`Booking is ${booking.status}`);
    if (booking.arrivedAtPickupAt) return { arrivedAtPickupAt: booking.arrivedAtPickupAt };

    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: { arrivedAtPickupAt: new Date() },
    });
    return { arrivedAtPickupAt: updated.arrivedAtPickupAt };
  }

  // Generate + store the pickup OTP and notify the passenger. Shared by the manual
  // "send OTP" endpoint and the auto-issue-at-departure path. Idempotent enough to
  // re-issue safely (a fresh code overwrites the old one).
  private async issuePickupOtp(booking: { id: string; passengerId: string | null; passengerPhone: string }) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = createHash('sha256').update(`${booking.id}:${otp}`).digest('hex');
    const redis = this.redis.getClient();
    await redis.set(`${OTP_HASH_PREFIX}${booking.id}`, hash, 'EX', PICKUP_OTP_TTL_SECONDS);
    await redis.set(`${OTP_CODE_PREFIX}${booking.id}`, otp, 'EX', PICKUP_OTP_TTL_SECONDS);

    // Hand off to the notification layer to SMS/WhatsApp the passenger their code.
    await redis.publish(
      'pahadi:events',
      JSON.stringify({
        event: 'pickup.otp_issued',
        bookingId: booking.id,
        passengerId: booking.passengerId,
        phone: booking.passengerPhone,
      }),
    );
    return otp;
  }

  /**
   * Credit the driver's wallet for a completed trip's online (UPI) fares, net
   * of platform commission. Cash fares are settled per-booking in collectCash.
   * Idempotent per trip (guarded by a TRIP_EARNINGS ledger entry).
   */
  async settleTripEarnings(tripId: string) {
    const existing = await this.prisma.walletLedger.findFirst({
      where: { refType: 'TRIP_EARNINGS', refId: tripId },
    });
    if (existing) return { settled: false, reason: 'already_settled' };

    const trip = await this.prisma.scheduledTrip.findUnique({
      where: { id: tripId },
      include: {
        bookings: {
          where: {
            status: BookingStatus.COMPLETED,
            paymentMethod: PaymentMethod.UPI,
            paymentStatus: PaymentStatus.PAID,
          },
          select: { totalFare: true },
        },
      },
    });
    if (!trip) return { settled: false, reason: 'trip_not_found' };

    const onlineTotal = trip.bookings.reduce((sum, b) => sum + b.totalFare, 0);
    if (onlineTotal <= 0) return { settled: false, reason: 'no_online_fares' };

    const driverNet = onlineTotal - commissionOf(onlineTotal);
    await this.prisma.walletLedger.create({
      data: {
        accountType: AccountType.DRIVER,
        accountId: trip.driverId,
        amount: driverNet,
        entryType: WalletEntryType.CREDIT,
        refType: 'TRIP_EARNINGS',
        refId: tripId,
      },
    });
    this.logger.log(
      `Settled trip ${tripId}: online ${onlineTotal} paise → driver ${trip.driverId} credited ${driverNet} paise (${PLATFORM_COMMISSION_PERCENT}% commission)`,
    );
    return { settled: true, onlineTotal, driverNet };
  }

  // Issue pickup OTPs for every still-boarding seat the moment a trip departs
  // ("driver starts navigating") — passengers get their code in advance instead of
  // waiting for the driver to tap "send" at the kerb. Driven by the trip.departed event.
  async issuePickupOtpsForTrip(tripId: string) {
    const bookings = await this.prisma.seatBooking.findMany({
      where: { tripId, status: BookingStatus.CONFIRMED, pickedUpAt: null },
      select: { id: true, passengerId: true, passengerPhone: true },
    });
    for (const b of bookings) {
      try {
        await this.issuePickupOtp(b);
      } catch (err) {
        this.logger.warn(`Failed to issue pickup OTP for booking ${b.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Issued ${bookings.length} pickup OTP(s) for departed trip ${tripId}`);
    return { issued: bookings.length };
  }

  async requestPickupOtp(bookingId: string, driverId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (booking.pickedUpAt) throw new BadRequestException('Passenger already picked up');

    // No longer gated on arrival — OTPs are normally pre-issued at departure; this
    // endpoint is the manual re-send fallback.
    const otp = await this.issuePickupOtp(booking);
    return {
      sent: true,
      phone: booking.passengerPhone,
      devOtpCode: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  async verifyPickupOtp(bookingId: string, driverId: string, dto: VerifyPickupOtpDto) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (booking.pickedUpAt) throw new BadRequestException('Already picked up');

    // Geofence gate: a long-lived OTP is only honoured when the driver is actually at
    // the pickup. If there's no recent GPS fix (dead zone), skip the gate — don't strand
    // a real pickup over missing telemetry.
    const pickup = booking.pickupJson as { lat?: number; lng?: number } | null;
    if (pickup && typeof pickup.lat === 'number' && typeof pickup.lng === 'number') {
      const raw = await this.redis.getClient().get(`location:latest:${driverId}`);
      const loc = raw ? (JSON.parse(raw) as { lat: number; lng: number }) : null;
      if (loc && metersBetween(loc, { lat: pickup.lat, lng: pickup.lng }) > OTP_VERIFY_MAX_DISTANCE_M) {
        throw new BadRequestException('You are too far from the pickup point to verify this OTP');
      }
    }

    const redis = this.redis.getClient();
    const storedHash = await redis.get(`${OTP_HASH_PREFIX}${bookingId}`);
    if (!storedHash) throw new BadRequestException('OTP expired or not yet requested');

    const hash = createHash('sha256').update(`${bookingId}:${dto.otp}`).digest('hex');
    if (hash !== storedHash) throw new BadRequestException('Invalid OTP');

    await redis.del(`${OTP_HASH_PREFIX}${bookingId}`, `${OTP_CODE_PREFIX}${bookingId}`);
    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: { pickedUpAt: new Date() },
    });
    return { pickedUpAt: updated.pickedUpAt };
  }

  // ── Drop-off flow (driver-facing) ──────────────────────────────────────────

  async arriveAtDropoff(bookingId: string, driverId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (booking.trip.status !== 'DEPARTED') throw new BadRequestException('Trip must be DEPARTED');
    if (!booking.pickedUpAt) throw new BadRequestException('Passenger not picked up yet');
    if (booking.droppedOffAt) throw new BadRequestException('Already dropped off');
    if (booking.arrivedAtDropoffAt) return { arrivedAtDropoffAt: booking.arrivedAtDropoffAt };

    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: { arrivedAtDropoffAt: new Date() },
    });
    return { arrivedAtDropoffAt: updated.arrivedAtDropoffAt };
  }

  async dropOff(bookingId: string, driverId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (!booking.pickedUpAt) throw new BadRequestException('Passenger not picked up yet');
    if (booking.droppedOffAt) return { droppedOffAt: booking.droppedOffAt };

    const updated = await this.prisma.seatBooking.update({
      where: { id: bookingId },
      data: {
        droppedOffAt: new Date(),
        arrivedAtDropoffAt: booking.arrivedAtDropoffAt ?? new Date(),
      },
    });
    const dropoff = booking.dropoffJson as { label?: string } | null;
    return {
      droppedOffAt: updated.droppedOffAt,
      passengerId: booking.passengerId,
      passengerName: booking.passengerName,
      passengerPhone: booking.passengerPhone,
      dropoffLabel: dropoff?.label ?? null,
    };
  }

  // ── Geofence auto-events ────────────────────────────────────────────────────
  // Driven by driver GPS pings (pahadi:location:*). Each crossing fires the same
  // idempotent transition a manual tap would, so the manual endpoints remain a
  // fallback for GPS dead zones. OTP verification / boarding stays manual — that
  // is the passenger-consent gate and must not be automated away.
  async evaluateGeofences(driverId: string, lat: number, lng: number) {
    const trip = await this.prisma.scheduledTrip.findFirst({
      where: { driverId, status: TripStatus.DEPARTED },
      select: {
        id: true,
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          select: {
            id: true,
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
    if (!trip) return;

    const here = { lat, lng };
    const asPoint = (j: unknown): { lat: number; lng: number } | null => {
      const p = j as { lat?: number; lng?: number } | null;
      return p && typeof p.lat === 'number' && typeof p.lng === 'number' ? { lat: p.lat, lng: p.lng } : null;
    };

    for (const b of trip.bookings) {
      try {
        if (!b.pickedUpAt) {
          // Pickup leg: auto-mark arrival inside the geofence. Boarding (OTP) stays manual.
          const p = asPoint(b.pickupJson);
          if (p && !b.arrivedAtPickupAt && metersBetween(here, p) <= GEOFENCE_ENTER_M) {
            await this.arriveAtPickup(b.id, driverId);
          }
          continue; // a dropoff can never precede its pickup
        }
        if (!b.droppedOffAt) {
          // Dropoff leg: arrive on entry, then complete the drop once clearly moving away.
          const d = asPoint(b.dropoffJson);
          if (!d) continue;
          const dist = metersBetween(here, d);
          if (!b.arrivedAtDropoffAt) {
            if (dist <= GEOFENCE_ENTER_M) await this.arriveAtDropoff(b.id, driverId);
          } else if (dist >= GEOFENCE_EXIT_M) {
            await this.dropOff(b.id, driverId);
          }
        }
      } catch (err) {
        // One booking's transition failing (transient race, etc.) must not stall the others.
        this.logger.warn(`Geofence eval failed for booking ${b.id}: ${(err as Error).message}`);
      }
    }
  }

  // Passenger-facing: live trip position — driver location + stops before this passenger
  async getTripPosition(bookingId: string, passengerId: string) {
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.passengerId !== passengerId) throw new ForbiddenException('Not your booking');

    // Resolve driver location by driverId (the telemetry key is location:latest:{driverId})
    const raw = await this.redis.getClient().get(`location:latest:${booking.trip.driverId}`);
    const driverLoc = raw
      ? (JSON.parse(raw) as { lat: number; lng: number; updatedAt: string })
      : null;

    // All confirmed bookings for the trip (including already picked-up ones)
    const allBookings = await this.prisma.seatBooking.findMany({
      where: { tripId: booking.tripId, status: BookingStatus.CONFIRMED },
      select: { id: true, pickupJson: true, dropoffJson: true, pickedUpAt: true, arrivedAtPickupAt: true, droppedOffAt: true },
    });

    const myPickup = booking.pickupJson as { lat: number; lng: number; label?: string } | null;
    const myDropoff = booking.dropoffJson as { lat: number; lng: number; label?: string } | null;
    const pickedUpCount = allBookings.filter((b) => b.pickedUpAt).length;
    const droppedOffCount = allBookings.filter((b) => b.droppedOffAt).length;
    const unpickedOthers = allBookings.filter((b) => !b.pickedUpAt && b.id !== bookingId);

    // Phase: before boarding the passenger watches the pickup leg; after boarding
    // (and before drop) they watch the journey to their destination.
    const isBoarded = !!booking.pickedUpAt && !booking.droppedOffAt;
    const isDroppedOff = !!booking.droppedOffAt;
    const phase = isDroppedOff ? 'DROPPED_OFF' : isBoarded ? 'ONBOARD_TO_DROPOFF' : 'EN_ROUTE_TO_PICKUP';

    let stopsBeforeMe = 0;
    let distanceKmToPickup: number | null = null;

    if (driverLoc && myPickup?.lat && myPickup?.lng) {
      const myDist = haversineKm(driverLoc, myPickup as { lat: number; lng: number });
      distanceKmToPickup = Math.round(myDist * 10) / 10;
      for (const b of unpickedOthers) {
        const p = b.pickupJson as { lat: number; lng: number } | null;
        if (p?.lat && p?.lng && haversineKm(driverLoc, p) < myDist) stopsBeforeMe++;
      }
    } else {
      stopsBeforeMe = unpickedOthers.length;
    }

    // Post-pickup leg: distance & remaining drops before this passenger's destination.
    let distanceKmToDropoff: number | null = null;
    let dropsBeforeMe = 0;
    if (isBoarded && driverLoc && myDropoff?.lat && myDropoff?.lng) {
      const myDist = haversineKm(driverLoc, myDropoff as { lat: number; lng: number });
      distanceKmToDropoff = Math.round(myDist * 10) / 10;
      const onboardOthers = allBookings.filter((b) => b.pickedUpAt && !b.droppedOffAt && b.id !== bookingId);
      for (const b of onboardOthers) {
        const d = b.dropoffJson as { lat: number; lng: number } | null;
        if (d?.lat && d?.lng && haversineKm(driverLoc, d) < myDist) dropsBeforeMe++;
      }
    }

    return {
      driverLocation: driverLoc,
      myPickup,
      myDropoff,
      phase,
      stopsBeforeMe,
      pickedUpCount,
      droppedOffCount,
      totalPassengers: allBookings.length,
      distanceKmToPickup,
      distanceKmToDropoff,
      dropsBeforeMe,
      driverArrivedAtMyPickup: !!booking.arrivedAtPickupAt && !booking.pickedUpAt,
      driverArrivedAtMyDropoff: !!booking.arrivedAtDropoffAt && !booking.droppedOffAt,
      pickedUpAt: booking.pickedUpAt?.toISOString() ?? null,
      droppedOffAt: booking.droppedOffAt?.toISOString() ?? null,
      tripStatus: booking.trip.status,
    };
  }

  // Passenger-facing: returns OTP if one is pending for this booking (auth: passengerId)
  async getPickupOtpStatus(bookingId: string, passengerId: string) {
    const booking = await this.prisma.seatBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.passengerId !== passengerId) throw new ForbiddenException('Not your booking');
    if (booking.pickedUpAt) return { status: 'PICKED_UP', pickedUpAt: booking.pickedUpAt };

    const otp = await this.redis.getClient().get(`${OTP_CODE_PREFIX}${bookingId}`);
    if (otp) return { status: 'OTP_PENDING', otp };
    return { status: 'WAITING' };
  }

  async getPassengerBookings(passengerId: string) {
    const bookings = await this.prisma.seatBooking.findMany({
      where: { passengerId },
      include: {
        trip: { include: { route: true, driver: true, vehicle: true } },
        invoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(toBookingDto);
  }

  async getDriverBookings(driverId: string) {
    // Only returns bookings for trips owned by this driver — authorization is enforced by query scope.
    // passengerPhone is included because drivers need it for pickup coordination.
    const bookings = await this.prisma.seatBooking.findMany({
      where: { trip: { driverId } },
      include: {
        trip: { include: { route: true, driver: true, vehicle: true } },
        invoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(toBookingDto);
  }
}

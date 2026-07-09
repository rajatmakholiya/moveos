import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { BookingServiceClient } from '../clients/booking-service.client';
import { NotificationServiceClient } from '../clients/notification-service.client';
import { GatewayEventsGateway } from '../gateway/events.gateway';
import {
  CreateBookingGatewayDto,
  PaymentConfirmGatewayDto,
  CancelBookingGatewayDto,
  VerifyPickupOtpGatewayDto,
} from '../dto/bookings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingClient: BookingServiceClient,
    private readonly wsGateway: GatewayEventsGateway,
    private readonly notificationClient: NotificationServiceClient,
  ) {}

  @Roles('PASSENGER')
  @Post()
  createBooking(@Req() req: any, @Body() dto: CreateBookingGatewayDto) {
    const passengerId = this.getEntityId(req);
    return this.bookingClient.createBooking({ ...dto, passengerId });
  }

  // GET /bookings/:bookingId is intentionally not role-restricted — passengers
  // and drivers both need to view booking details (track page, confirmation page).
  @Get(':bookingId')
  getBooking(@Param('bookingId') bookingId: string) {
    return this.bookingClient.getBooking(bookingId);
  }

  // Invoice download — the booking's passenger, the trip's driver, or an admin.
  @Get(':bookingId/invoice')
  async getInvoice(@Req() req: any, @Param('bookingId') bookingId: string, @Res() res: Response) {
    const invoice = await this.bookingClient.getInvoice(bookingId);
    const role = req.user?.role;
    const isOwner =
      (req.user?.passengerId && req.user.passengerId === invoice.passengerId) ||
      (req.user?.driverId && req.user.driverId === invoice.driverId);
    if (!isOwner && role !== 'SUPER_ADMIN' && role !== 'ORG_ADMIN' && role !== 'ADMIN') {
      throw new ForbiddenException('You do not have access to this invoice');
    }
    const pdf = Buffer.from(invoice.base64, 'base64');
    res.setHeader('Content-Type', invoice.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.fileName}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Roles('PASSENGER')
  @Post(':bookingId/payment-confirm')
  confirmPayment(@Param('bookingId') bookingId: string, @Body() dto: PaymentConfirmGatewayDto) {
    return this.bookingClient.confirmPayment(bookingId, dto);
  }

  @Roles('PASSENGER')
  @Post(':bookingId/cancel')
  cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body() dto: CancelBookingGatewayDto,
  ) {
    return this.bookingClient.cancelBooking(bookingId, dto.reason);
  }

  // ── Pickup flow — driver ───────────────────────────────────────────────────

  @Roles('DRIVER')
  @Post(':bookingId/arrive-pickup')
  arriveAtPickup(@Req() req: any, @Param('bookingId') bookingId: string) {
    return this.bookingClient.arriveAtPickup(this.getDriverId(req), bookingId);
  }

  @Roles('DRIVER')
  @Post(':bookingId/request-pickup-otp')
  requestPickupOtp(@Req() req: any, @Param('bookingId') bookingId: string) {
    return this.bookingClient.requestPickupOtp(this.getDriverId(req), bookingId);
  }

  @Roles('DRIVER')
  @Post(':bookingId/verify-pickup-otp')
  verifyPickupOtp(@Req() req: any, @Param('bookingId') bookingId: string, @Body() dto: VerifyPickupOtpGatewayDto) {
    return this.bookingClient.verifyPickupOtp(this.getDriverId(req), bookingId, dto.otp);
  }

  // ── Drop-off flow — driver ────────────────────────────────────────────────

  @Roles('DRIVER')
  @Post(':bookingId/arrive-dropoff')
  arriveAtDropoff(@Req() req: any, @Param('bookingId') bookingId: string) {
    return this.bookingClient.arriveAtDropoff(this.getDriverId(req), bookingId);
  }

  @Roles('DRIVER')
  @Post(':bookingId/drop-off')
  async dropOff(@Req() req: any, @Param('bookingId') bookingId: string) {
    const result = await this.bookingClient.dropOff(this.getDriverId(req), bookingId) as any;
    if (result?.passengerId) {
      this.wsGateway.emitBookingUpdated(result.passengerId, {
        bookingId,
        droppedOffAt: result.droppedOffAt,
        droppedOff: true,
      });
    }
    // Fire-and-forget passenger notification (SMS/push stub — no real provider yet).
    void Promise.resolve(
      this.notificationClient.notifyDropOff({
        bookingId,
        passengerId: result?.passengerId ?? null,
        passengerPhone: result?.passengerPhone ?? null,
        passengerName: result?.passengerName ?? null,
        dropoffLabel: result?.dropoffLabel ?? null,
      }),
    ).catch(() => { /* notification failures must not block the drop-off */ });
    return result;
  }

  // ── Live trip position — passenger ────────────────────────────────────────

  @Roles('PASSENGER')
  @Get(':bookingId/trip-position')
  getTripPosition(@Req() req: any, @Param('bookingId') bookingId: string) {
    return this.bookingClient.getTripPosition(this.getEntityId(req), bookingId);
  }

  // ── Pickup OTP status — passenger ─────────────────────────────────────────

  @Roles('PASSENGER')
  @Get(':bookingId/pickup-otp-status')
  getPickupOtpStatus(@Req() req: any, @Param('bookingId') bookingId: string) {
    return this.bookingClient.getPickupOtpStatus(this.getEntityId(req), bookingId);
  }

  private getEntityId(req: any): string {
    return req.user?.passengerId ?? req.user?.agentId ?? req.user?.sub;
  }

  private getDriverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }
}

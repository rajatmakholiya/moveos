import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaymentConfirmDto } from './dto/payment-confirm.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { VerifyPickupOtpDto } from './dto/verify-pickup-otp.dto';

@Controller('booking/bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // Internal boundary — the gateway decodes base64 and streams application/pdf.
  @Get(':bookingId/invoice')
  getInvoice(@Param('bookingId') bookingId: string) {
    return this.bookingService.getInvoicePdf(bookingId);
  }

  @Post()
  createBooking(@Body() dto: CreateBookingDto) {
    return this.bookingService.createBooking(dto);
  }

  // Static segment routes declared before :bookingId to ensure correct resolution order.

  @Get('passenger/:passengerId')
  getPassengerBookings(@Param('passengerId') passengerId: string) {
    return this.bookingService.getPassengerBookings(passengerId);
  }

  @Get('driver/:driverId')
  getDriverBookings(@Param('driverId') driverId: string) {
    return this.bookingService.getDriverBookings(driverId);
  }

  @Get(':bookingId')
  getBooking(@Param('bookingId') bookingId: string) {
    return this.bookingService.getBooking(bookingId);
  }

  @Post(':bookingId/payment-confirm')
  confirmPayment(@Param('bookingId') bookingId: string, @Body() dto: PaymentConfirmDto) {
    return this.bookingService.confirmPayment(bookingId, dto);
  }

  @Post(':bookingId/cancel')
  cancelBooking(@Param('bookingId') bookingId: string, @Body() dto: CancelBookingDto) {
    return this.bookingService.cancelBooking(bookingId, dto);
  }

  @Post(':bookingId/collect-cash')
  collectCash(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.bookingService.collectCash(bookingId, driverId);
  }

  // ── Pickup flow (driver-facing) ────────────────────────────────────────────

  @Post(':bookingId/arrive-pickup')
  arriveAtPickup(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.bookingService.arriveAtPickup(bookingId, driverId);
  }

  @Post(':bookingId/request-pickup-otp')
  requestPickupOtp(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.bookingService.requestPickupOtp(bookingId, driverId);
  }

  @Post(':bookingId/verify-pickup-otp')
  verifyPickupOtp(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
    @Body() dto: VerifyPickupOtpDto,
  ) {
    return this.bookingService.verifyPickupOtp(bookingId, driverId, dto);
  }

  // ── Drop-off flow (driver-facing) ──────────────────────────────────────────

  @Post(':bookingId/arrive-dropoff')
  arriveAtDropoff(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.bookingService.arriveAtDropoff(bookingId, driverId);
  }

  @Post(':bookingId/drop-off')
  dropOff(
    @Param('bookingId') bookingId: string,
    @Headers('x-driver-id') driverId: string,
  ) {
    return this.bookingService.dropOff(bookingId, driverId);
  }

  // ── Passenger-facing trip tracking ────────────────────────────────────────

  @Get(':bookingId/trip-position')
  getTripPosition(
    @Param('bookingId') bookingId: string,
    @Headers('x-passenger-id') passengerId: string,
  ) {
    return this.bookingService.getTripPosition(bookingId, passengerId);
  }

  // ── Pickup OTP status (passenger-facing) ──────────────────────────────────

  @Get(':bookingId/pickup-otp-status')
  getPickupOtpStatus(
    @Param('bookingId') bookingId: string,
    @Headers('x-passenger-id') passengerId: string,
  ) {
    return this.bookingService.getPickupOtpStatus(bookingId, passengerId);
  }
}

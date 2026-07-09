import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class BookingServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('BOOKING_SERVICE_URL') ?? 'http://localhost:3009/api';
  }

  createBooking(body: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}/booking/bookings`, body);
  }

  getBooking(bookingId: string) {
    return this.http.get(`${this.baseUrl}/booking/bookings/${bookingId}`);
  }

  getInvoice(bookingId: string) {
    return this.http.get<{
      invoiceNo: string;
      fileName: string;
      contentType: string;
      base64: string;
      passengerId: string | null;
      driverId: string;
    }>(`${this.baseUrl}/booking/bookings/${bookingId}/invoice`);
  }

  getPassengerBookings(passengerId: string) {
    return this.http.get(`${this.baseUrl}/booking/bookings/passenger/${passengerId}`);
  }

  getDriverBookings(driverId: string) {
    return this.http.get(`${this.baseUrl}/booking/bookings/driver/${driverId}`);
  }

  confirmPayment(bookingId: string, body: { razorpayPaymentId: string; razorpaySignature: string }) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/payment-confirm`, body);
  }

  cancelBooking(bookingId: string, reason?: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/cancel`, { reason });
  }

  collectCash(driverId: string, bookingId: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/collect-cash`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  // Pickup flow — driver
  arriveAtPickup(driverId: string, bookingId: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/arrive-pickup`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  requestPickupOtp(driverId: string, bookingId: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/request-pickup-otp`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  verifyPickupOtp(driverId: string, bookingId: string, otp: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/verify-pickup-otp`, { otp }, {
      headers: { 'x-driver-id': driverId },
    });
  }

  // Drop-off flow — driver
  arriveAtDropoff(driverId: string, bookingId: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/arrive-dropoff`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  dropOff(driverId: string, bookingId: string) {
    return this.http.post(`${this.baseUrl}/booking/bookings/${bookingId}/drop-off`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  // Live trip position — passenger
  getTripPosition(passengerId: string, bookingId: string) {
    return this.http.get(`${this.baseUrl}/booking/bookings/${bookingId}/trip-position`, {
      headers: { 'x-passenger-id': passengerId },
    });
  }

  // Pickup OTP status — passenger
  getPickupOtpStatus(passengerId: string, bookingId: string) {
    return this.http.get(`${this.baseUrl}/booking/bookings/${bookingId}/pickup-otp-status`, {
      headers: { 'x-passenger-id': passengerId },
    });
  }
}

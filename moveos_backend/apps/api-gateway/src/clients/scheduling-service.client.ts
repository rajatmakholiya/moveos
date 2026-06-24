import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class SchedulingServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl =
      this.config.get<string>('SCHEDULING_SERVICE_URL') ?? 'http://localhost:3008/api';
  }

  getAvailableTrips(query: { routeId: string; date: string; seatType?: string }) {
    return this.http.get(`${this.baseUrl}/scheduling/trips/available`, { params: query });
  }

  createTrip(driverId: string, body: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}/scheduling/trips`, body, {
      headers: { 'x-driver-id': driverId },
    });
  }

  getDriverTrips(driverId: string, scope?: string) {
    return this.http.get(`${this.baseUrl}/scheduling/trips/driver/me`, {
      headers: { 'x-driver-id': driverId },
      params: { scope },
    });
  }

  getTrip(tripId: string) {
    return this.http.get(`${this.baseUrl}/scheduling/trips/${tripId}`);
  }

  cancelTrip(driverId: string, tripId: string) {
    return this.http.post(`${this.baseUrl}/scheduling/trips/${tripId}/cancel`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  departTrip(driverId: string, tripId: string) {
    return this.http.post(`${this.baseUrl}/scheduling/trips/${tripId}/depart`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  completeTrip(driverId: string, tripId: string) {
    return this.http.post(`${this.baseUrl}/scheduling/trips/${tripId}/complete`, undefined, {
      headers: { 'x-driver-id': driverId },
    });
  }

  markNoShow(driverId: string, tripId: string, bookingId: string, reason: string) {
    return this.http.post(
      `${this.baseUrl}/scheduling/trips/${tripId}/bookings/${bookingId}/no-show`,
      { reason },
      { headers: { 'x-driver-id': driverId } },
    );
  }

  getTripTimeline(tripId: string) {
    return this.http.get(`${this.baseUrl}/scheduling/trips/${tripId}/timeline`);
  }

  getManifest(driverId: string, tripId: string) {
    return this.http.get(`${this.baseUrl}/scheduling/trips/${tripId}/manifest`, {
      headers: { 'x-driver-id': driverId },
    });
  }
}

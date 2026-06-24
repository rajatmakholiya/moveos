import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class DispatchServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('DISPATCH_SERVICE_URL') ?? 'http://localhost:3003/api';
  }

  acceptRide(rideId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/dispatch/rides/${rideId}/accept`, { driverId });
  }

  rejectRide(rideId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/dispatch/rides/${rideId}/reject`, { driverId });
  }

  listRequests(query: { type?: string; status?: string; driverId?: string; passengerId?: string; lat?: number; lng?: number }) {
    return this.http.get(`${this.baseUrl}/dispatch/requests`, { params: query });
  }

  createRequest(body: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}/dispatch/requests`, body);
  }

  acceptRequest(requestId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/dispatch/requests/${requestId}/accept`, { driverId });
  }

  rejectRequest(requestId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/dispatch/requests/${requestId}/reject`, { driverId });
  }

  completeRequest(requestId: string, driverId: string, agreedAmountPaise?: number) {
    return this.http.post(`${this.baseUrl}/dispatch/requests/${requestId}/complete`, { driverId, agreedAmountPaise });
  }

  cancelRequest(requestId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/dispatch/requests/${requestId}/cancel`, { driverId });
  }
}

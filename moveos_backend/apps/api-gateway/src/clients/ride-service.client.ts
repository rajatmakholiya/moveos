import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class RideServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('RIDE_SERVICE_URL') ?? 'http://localhost:3002/api';
  }

  arrived(rideId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/rides/${rideId}/arrived`, { driverId });
  }

  start(rideId: string, driverId: string, riderOtp: string) {
    return this.http.post(`${this.baseUrl}/rides/${rideId}/start`, { driverId, riderOtp });
  }

  complete(rideId: string, driverId: string) {
    return this.http.post(`${this.baseUrl}/rides/${rideId}/complete`, { driverId });
  }

  cancel(rideId: string, driverId: string, reason?: string) {
    return this.http.post(`${this.baseUrl}/rides/${rideId}/cancel`, { driverId, reason });
  }
}

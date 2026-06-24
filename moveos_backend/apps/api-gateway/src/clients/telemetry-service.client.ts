import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class TelemetryServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('TELEMETRY_SERVICE_URL') ?? 'http://localhost:3004/api';
  }

  sendLocation(payload: { driverId: string; lat: number; lng: number }) {
    return this.http.post(`${this.baseUrl}/telemetry/location`, payload);
  }

  getLocation(bookingId?: string) {
    return this.http.get(`${this.baseUrl}/telemetry/location`, { params: { bookingId } });
  }

  heartbeat(payload: { driverId: string }) {
    return this.http.post(`${this.baseUrl}/telemetry/heartbeat`, payload);
  }
}

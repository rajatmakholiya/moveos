import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class NotificationServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('NOTIFICATION_SERVICE_URL') ?? 'http://localhost:3005/api';
  }

  registerDeviceToken(payload: { driverId: string; token: string }) {
    return this.http.post(`${this.baseUrl}/notifications/device-token`, payload);
  }

  notifyDropOff(payload: {
    bookingId: string;
    passengerId?: string | null;
    passengerPhone?: string | null;
    passengerName?: string | null;
    dropoffLabel?: string | null;
  }) {
    return this.http.post(`${this.baseUrl}/notifications/drop-off`, payload);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';
import { CreateSessionDto, ProfileDto, ConsentsDto } from '../dto/onboarding.dto';

@Injectable()
export class OnboardingServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('ONBOARDING_SERVICE_URL') ?? 'http://localhost:3006/api';
  }

  createSession(body: CreateSessionDto, idempotencyKey?: string) {
    return this.http.post(`${this.baseUrl}/onboarding/session`, body, this.headers(idempotencyKey));
  }

  submitProfile(token: string, body: ProfileDto, idempotencyKey?: string) {
    return this.http.post(`${this.baseUrl}/onboarding/profile`, body, this.headers(idempotencyKey, token));
  }

  submitConsents(token: string, body: ConsentsDto, idempotencyKey?: string) {
    return this.http.post(`${this.baseUrl}/onboarding/consents`, body, this.headers(idempotencyKey, token));
  }

  fetchContext(token: string, lat?: number, lng?: number) {
    return this.http.get(`${this.baseUrl}/onboarding/context`, {
      headers: this.headers(undefined, token).headers,
      params: { lat, lng },
    });
  }

  complete(token: string, body: Partial<ProfileDto>, idempotencyKey?: string) {
    return this.http.post(
      `${this.baseUrl}/onboarding/complete`,
      body,
      this.headers(idempotencyKey, token),
    );
  }

  private headers(idempotencyKey?: string, token?: string) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    return { headers };
  }
}

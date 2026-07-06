import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { createSign } from 'crypto';
import { PushNotification, PushProvider, PushSendResult } from './push.types';

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** Service-account private key (PEM). '\n' escapes are normalized automatically. */
  privateKey: string;
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Firebase Cloud Messaging (HTTP v1) provider. Mints OAuth2 access tokens
 * from the service-account key with plain crypto (no firebase-admin
 * dependency) and caches them until shortly before expiry.
 * Configure via FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY.
 */
@Injectable()
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  readonly deliversRealPush = true;
  private readonly logger = new Logger('FcmPushProvider');
  private cachedToken: { token: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: FcmConfig) {}

  async send(deviceToken: string, notification: PushNotification): Promise<PushSendResult> {
    try {
      const accessToken = await this.getAccessToken();
      const res = await axios.post(
        `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`,
        {
          message: {
            token: deviceToken,
            notification: { title: notification.title, body: notification.body },
            data: notification.data,
            android: { priority: 'HIGH' },
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
      );
      return { delivered: true, provider: this.name, providerMessageId: res.data?.name };
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { status?: string; message?: string } }>;
      const status = axiosErr.response?.data?.error?.status;
      // UNREGISTERED / NOT_FOUND → token is dead, caller should prune it.
      const invalidToken = status === 'UNREGISTERED' || status === 'NOT_FOUND' || axiosErr.response?.status === 404;
      const message = axiosErr.response?.data?.error?.message ?? (err as Error).message;
      if (!invalidToken) this.logger.error(`FCM send failed: ${message}`);
      return { delivered: false, provider: this.name, error: message, invalidToken };
    }
  }

  async sendToMany(deviceTokens: string[], notification: PushNotification): Promise<PushSendResult[]> {
    return Promise.all(deviceTokens.map((token) => this.send(token, notification)));
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAtMs > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    const assertion = this.buildJwtAssertion();
    const res = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      { headers: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
    );
    const token = res.data.access_token as string;
    const expiresInSec = (res.data.expires_in as number) ?? 3600;
    this.cachedToken = { token, expiresAtMs: Date.now() + expiresInSec * 1000 };
    return token;
  }

  /** RS256-signed OAuth2 JWT assertion for the service account. */
  private buildJwtAssertion(): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = this.base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = this.base64Url(
      JSON.stringify({
        iss: this.config.clientEmail,
        scope: FCM_SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    );
    const unsigned = `${header}.${claims}`;
    const privateKey = this.config.privateKey.replace(/\\n/g, '\n');
    const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey);
    return `${unsigned}.${signature.toString('base64url')}`;
  }

  private base64Url(value: string): string {
    return Buffer.from(value).toString('base64url');
  }
}

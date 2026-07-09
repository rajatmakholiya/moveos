import { Injectable, Logger } from '@nestjs/common';
import { PushNotification, PushProvider, PushSendResult } from './push.types';

/** Development push provider: logs instead of delivering. */
@Injectable()
export class DevPushProvider implements PushProvider {
  readonly name = 'dev';
  readonly deliversRealPush = false;
  private readonly logger = new Logger('DevPushProvider');

  async send(deviceToken: string, notification: PushNotification): Promise<PushSendResult> {
    this.logger.log(
      `[DEV PUSH] → ${deviceToken.slice(0, 12)}…: ${notification.title} — ${notification.body}` +
        (notification.data ? ` data=${JSON.stringify(notification.data)}` : ''),
    );
    return { delivered: true, provider: this.name };
  }

  async sendToMany(deviceTokens: string[], notification: PushNotification): Promise<PushSendResult[]> {
    return Promise.all(deviceTokens.map((token) => this.send(token, notification)));
  }
}

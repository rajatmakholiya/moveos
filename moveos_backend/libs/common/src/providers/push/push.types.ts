export const PUSH_PROVIDER = 'PUSH_PROVIDER';

export interface PushNotification {
  title: string;
  body: string;
  /** FCM data payload — string values only. */
  data?: Record<string, string>;
}

export interface PushSendResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
  /** True when the provider says the device token is dead — caller should prune it. */
  invalidToken?: boolean;
}

/**
 * Swappable push delivery boundary. Selected via PUSH_PROVIDER env
 * ('dev' | 'fcm').
 */
export interface PushProvider {
  readonly name: string;
  readonly deliversRealPush: boolean;
  send(deviceToken: string, notification: PushNotification): Promise<PushSendResult>;
  sendToMany(deviceTokens: string[], notification: PushNotification): Promise<PushSendResult[]>;
}

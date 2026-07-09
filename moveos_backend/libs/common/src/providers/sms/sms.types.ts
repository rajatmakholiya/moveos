export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsSendResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
}

export interface SmsOtpContext {
  /** What the OTP is for — used for template selection / logging. */
  purpose?: 'onboarding' | 'login' | 'invite' | 'pickup' | 'generic';
  ttlSeconds?: number;
}

/**
 * Swappable SMS delivery boundary. Selected via SMS_PROVIDER env
 * ('dev' | 'msg91'). Call sites must never branch on NODE_ENV to decide
 * whether to expose dev OTP codes — branch on `deliversRealSms` instead.
 */
export interface SmsProvider {
  readonly name: string;
  /** True when this provider actually delivers SMS to real phones. */
  readonly deliversRealSms: boolean;
  sendOtp(phone: string, code: string, context?: SmsOtpContext): Promise<SmsSendResult>;
  sendMessage(phone: string, message: string): Promise<SmsSendResult>;
}

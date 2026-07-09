import { Injectable, Logger } from '@nestjs/common';
import { SmsOtpContext, SmsProvider, SmsSendResult } from './sms.types';

/**
 * Development SMS provider: logs instead of sending. Because
 * `deliversRealSms` is false, OTP flows surface the code in API responses
 * (devOtpCode) so local/E2E testing works without a real SMS account.
 */
@Injectable()
export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';
  readonly deliversRealSms = false;
  private readonly logger = new Logger('DevSmsProvider');

  async sendOtp(phone: string, code: string, context?: SmsOtpContext): Promise<SmsSendResult> {
    this.logger.log(`[DEV SMS] OTP ${code} → ${phone} (purpose=${context?.purpose ?? 'generic'})`);
    return { delivered: true, provider: this.name };
  }

  async sendMessage(phone: string, message: string): Promise<SmsSendResult> {
    this.logger.log(`[DEV SMS] → ${phone}: ${message}`);
    return { delivered: true, provider: this.name };
  }
}

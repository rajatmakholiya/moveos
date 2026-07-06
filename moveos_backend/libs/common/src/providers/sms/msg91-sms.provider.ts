import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SmsOtpContext, SmsProvider, SmsSendResult } from './sms.types';

export interface Msg91Config {
  authKey: string;
  /** DLT-approved OTP template id (MSG91 "OTP" template). */
  otpTemplateId: string;
  /** DLT-approved generic transactional Flow template id with a `{#var#}` message variable. */
  flowTemplateId?: string;
  senderId?: string;
  baseUrl?: string;
}

/**
 * MSG91 SMS provider (India). Uses the v5 OTP API for codes and the v5 Flow
 * API for transactional messages. Requires a DLT-registered template —
 * configure via MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID, MSG91_FLOW_TEMPLATE_ID,
 * MSG91_SENDER_ID.
 */
@Injectable()
export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';
  readonly deliversRealSms = true;
  private readonly logger = new Logger('Msg91SmsProvider');
  private readonly baseUrl: string;

  constructor(private readonly config: Msg91Config) {
    this.baseUrl = config.baseUrl ?? 'https://control.msg91.com/api/v5';
  }

  async sendOtp(phone: string, code: string, _context?: SmsOtpContext): Promise<SmsSendResult> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/otp`,
        { otp: code },
        {
          params: {
            template_id: this.config.otpTemplateId,
            mobile: this.toMsg91Mobile(phone),
            otp: code,
            otp_expiry: 10,
          },
          headers: { authkey: this.config.authKey, 'content-type': 'application/json' },
          timeout: 10_000,
        },
      );
      const ok = res.data?.type === 'success';
      if (!ok) this.logger.warn(`MSG91 OTP send non-success for ${phone}: ${JSON.stringify(res.data)}`);
      return {
        delivered: ok,
        provider: this.name,
        providerMessageId: res.data?.request_id,
        error: ok ? undefined : res.data?.message ?? 'msg91_non_success',
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`MSG91 OTP send failed for ${phone}: ${message}`);
      return { delivered: false, provider: this.name, error: message };
    }
  }

  async sendMessage(phone: string, message: string): Promise<SmsSendResult> {
    if (!this.config.flowTemplateId) {
      this.logger.warn('MSG91_FLOW_TEMPLATE_ID not configured — transactional SMS skipped');
      return { delivered: false, provider: this.name, error: 'flow_template_not_configured' };
    }
    try {
      const res = await axios.post(
        `${this.baseUrl}/flow`,
        {
          template_id: this.config.flowTemplateId,
          sender: this.config.senderId,
          recipients: [{ mobiles: this.toMsg91Mobile(phone), message }],
        },
        {
          headers: { authkey: this.config.authKey, 'content-type': 'application/json' },
          timeout: 10_000,
        },
      );
      const ok = res.data?.type === 'success';
      return {
        delivered: ok,
        provider: this.name,
        providerMessageId: res.data?.request_id,
        error: ok ? undefined : res.data?.message ?? 'msg91_non_success',
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`MSG91 SMS send failed for ${phone}: ${message}`);
      return { delivered: false, provider: this.name, error: message };
    }
  }

  /** MSG91 wants country-code-prefixed digits without the '+' (e.g. 919876543210). */
  private toMsg91Mobile(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 ? `91${digits}` : digits;
  }
}

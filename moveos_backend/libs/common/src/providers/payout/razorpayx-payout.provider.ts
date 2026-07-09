import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { BeneficiaryInput, BeneficiaryResult, PayoutInput, PayoutProvider, PayoutResult, PayoutStatus } from './payout.types';

export interface RazorpayXConfig {
  keyId: string;
  keySecret: string;
  /** RazorpayX virtual account number payouts are debited from. */
  accountNumber: string;
  baseUrl?: string;
}

/**
 * RazorpayX payout provider. Contacts + fund accounts + payouts via the
 * RazorpayX REST API (basic auth with key id/secret). Configure via
 * RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER.
 */
@Injectable()
export class RazorpayXPayoutProvider implements PayoutProvider {
  readonly name = 'razorpayx';
  readonly movesRealMoney = true;
  private readonly logger = new Logger('RazorpayXPayoutProvider');
  private readonly http: AxiosInstance;

  constructor(private readonly config: RazorpayXConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl ?? 'https://api.razorpay.com/v1',
      timeout: 15_000,
      auth: { username: config.keyId, password: config.keySecret },
    });
  }

  async createBeneficiary(input: BeneficiaryInput): Promise<BeneficiaryResult> {
    try {
      const contactRes = await this.http.post('/contacts', {
        name: input.name,
        contact: input.phone,
        email: input.email,
        type: 'vendor',
        reference_id: input.referenceId,
      });
      const contactId = contactRes.data.id as string;

      const fundAccountBody =
        input.type === 'vpa'
          ? { contact_id: contactId, account_type: 'vpa', vpa: { address: input.vpa } }
          : {
              contact_id: contactId,
              account_type: 'bank_account',
              bank_account: {
                name: input.name,
                ifsc: input.ifsc,
                account_number: input.accountNumber,
              },
            };
      const fundRes = await this.http.post('/fund_accounts', fundAccountBody);
      return { success: true, provider: this.name, contactId, fundAccountId: fundRes.data.id as string };
    } catch (err) {
      return { success: false, provider: this.name, error: this.axiosError(err) };
    }
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    try {
      const res = await this.http.post(
        '/payouts',
        {
          account_number: this.config.accountNumber,
          fund_account_id: input.fundAccountId,
          amount: input.amountPaise,
          currency: 'INR',
          mode: input.mode,
          purpose: 'payout',
          reference_id: input.referenceId,
          narration: input.narration?.slice(0, 30),
          queue_if_low_balance: true,
        },
        // RazorpayX-native idempotency: retries with the same key return the original payout.
        { headers: { 'X-Payout-Idempotency': input.referenceId } },
      );
      return {
        success: true,
        provider: this.name,
        payoutId: res.data.id as string,
        status: this.mapStatus(res.data.status as string),
        utr: res.data.utr ?? undefined,
      };
    } catch (err) {
      return { success: false, provider: this.name, status: 'failed', error: this.axiosError(err) };
    }
  }

  async getPayoutStatus(payoutId: string): Promise<PayoutResult> {
    try {
      const res = await this.http.get(`/payouts/${payoutId}`);
      return {
        success: true,
        provider: this.name,
        payoutId,
        status: this.mapStatus(res.data.status as string),
        utr: res.data.utr ?? undefined,
      };
    } catch (err) {
      return { success: false, provider: this.name, payoutId, error: this.axiosError(err) };
    }
  }

  private mapStatus(status: string): PayoutStatus {
    switch (status) {
      case 'processed':
        return 'processed';
      case 'reversed':
      case 'cancelled':
        return 'reversed';
      case 'rejected':
      case 'failed':
        return 'failed';
      case 'processing':
        return 'processing';
      default:
        return 'queued';
    }
  }

  private axiosError(err: unknown): string {
    const anyErr = err as { response?: { data?: { error?: { description?: string } } }; message?: string };
    const message = anyErr.response?.data?.error?.description ?? anyErr.message ?? 'request_failed';
    this.logger.error(`RazorpayX request failed: ${message}`);
    return String(message);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { BeneficiaryInput, BeneficiaryResult, PayoutInput, PayoutProvider, PayoutResult } from './payout.types';

/**
 * Development payout provider: instantly "processes" payouts in memory.
 * Failure fixture: account numbers ending in "0000" fail beneficiary
 * creation; payout amounts of exactly 1 paise fail the payout.
 */
@Injectable()
export class DevPayoutProvider implements PayoutProvider {
  readonly name = 'dev';
  readonly movesRealMoney = false;
  private readonly logger = new Logger('DevPayoutProvider');
  private readonly payouts = new Map<string, PayoutResult>();

  async createBeneficiary(input: BeneficiaryInput): Promise<BeneficiaryResult> {
    if (input.type === 'bank_account' && input.accountNumber?.endsWith('0000')) {
      return { success: false, provider: this.name, error: 'invalid_account' };
    }
    const contactId = `dev_cont_${randomBytes(6).toString('hex')}`;
    const fundAccountId = `dev_fa_${randomBytes(6).toString('hex')}`;
    this.logger.log(`[DEV PAYOUT] Beneficiary for ${input.referenceId}: ${fundAccountId} (${input.type})`);
    return { success: true, provider: this.name, contactId, fundAccountId };
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    if (input.amountPaise === 1) {
      return { success: false, provider: this.name, status: 'failed', error: 'payout_failed_fixture' };
    }
    const payoutId = `dev_pout_${randomBytes(6).toString('hex')}`;
    const result: PayoutResult = {
      success: true,
      provider: this.name,
      payoutId,
      status: 'processed',
      utr: `DEVUTR${Date.now()}`,
    };
    this.payouts.set(payoutId, result);
    this.logger.log(
      `[DEV PAYOUT] ₹${(input.amountPaise / 100).toFixed(2)} → ${input.fundAccountId} via ${input.mode} (ref ${input.referenceId})`,
    );
    return result;
  }

  async getPayoutStatus(payoutId: string): Promise<PayoutResult> {
    return (
      this.payouts.get(payoutId) ?? {
        success: false,
        provider: this.name,
        payoutId,
        error: 'payout_not_found',
      }
    );
  }
}

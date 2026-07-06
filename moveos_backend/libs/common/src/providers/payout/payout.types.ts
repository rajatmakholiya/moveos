export const PAYOUT_PROVIDER = 'PAYOUT_PROVIDER';

export type PayoutStatus = 'queued' | 'processing' | 'processed' | 'reversed' | 'failed';

export interface BeneficiaryInput {
  name: string;
  phone: string;
  email?: string;
  /** Bank transfer details (required for type 'bank_account'). */
  accountNumber?: string;
  ifsc?: string;
  /** UPI VPA (required for type 'vpa'). */
  vpa?: string;
  type: 'bank_account' | 'vpa';
  /** Our-side id (driverId) for provider-side reference/notes. */
  referenceId: string;
}

export interface BeneficiaryResult {
  success: boolean;
  provider: string;
  /** Provider contact id (RazorpayX contact). */
  contactId?: string;
  /** Provider fund-account id — persist this; payouts are made against it. */
  fundAccountId?: string;
  error?: string;
}

export interface PayoutInput {
  fundAccountId: string;
  amountPaise: number;
  mode: 'IMPS' | 'NEFT' | 'UPI';
  /** Idempotency + reconciliation key (e.g. walletLedger entry id). */
  referenceId: string;
  narration?: string;
}

export interface PayoutResult {
  success: boolean;
  provider: string;
  payoutId?: string;
  status?: PayoutStatus;
  /** Bank UTR once processed. */
  utr?: string;
  error?: string;
}

/**
 * Swappable payout boundary (RazorpayX-shaped). Selected via PAYOUT_PROVIDER
 * env ('dev' | 'razorpayx').
 */
export interface PayoutProvider {
  readonly name: string;
  readonly movesRealMoney: boolean;
  createBeneficiary(input: BeneficiaryInput): Promise<BeneficiaryResult>;
  createPayout(input: PayoutInput): Promise<PayoutResult>;
  getPayoutStatus(payoutId: string): Promise<PayoutResult>;
}

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  KYC_PROVIDER,
  KycProvider,
  PAYOUT_PROVIDER,
  PayoutProvider,
  PrismaService,
} from '@common/index';
import { AccountType, KycStatus, PayoutStatus, WalletEntryType } from '@prisma/client';
import { SetupPayoutProfileDto, RequestPayoutDto } from './dto/payout.dto';

// Minimum payout: ₹100. Prevents fee-burning micro-payouts.
const MIN_PAYOUT_PAISE = 10_000;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KYC_PROVIDER) private readonly kyc: KycProvider,
    @Inject(PAYOUT_PROVIDER) private readonly payouts: PayoutProvider,
  ) {}

  /**
   * Register (or replace) the driver's payout destination.
   * Bank details are penny-drop verified, then registered with the payout
   * provider. Only the masked account number is persisted on our side.
   */
  async setupPayoutProfile(driverId: string, dto: SetupPayoutProfileDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { phone: true, email: true } } },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const verification = await this.kyc.validateBankAccount(dto.accountNumber, dto.ifsc, dto.accountHolderName);
    if (verification.status === 'FAILED') {
      throw new BadRequestException({
        message: 'Bank account verification failed. Please check the account number and IFSC.',
        error_code: 'bank_verification_failed',
        details: verification.error,
      });
    }

    const beneficiary = await this.payouts.createBeneficiary({
      name: dto.accountHolderName,
      phone: driver.user.phone,
      email: driver.user.email ?? undefined,
      accountNumber: dto.accountNumber,
      ifsc: dto.ifsc,
      vpa: dto.vpa,
      type: 'bank_account',
      referenceId: driverId,
    });
    if (!beneficiary.success) {
      throw new BadRequestException({
        message: 'Could not register the payout account. Please try again.',
        error_code: 'beneficiary_creation_failed',
        details: beneficiary.error,
      });
    }

    const verified = verification.status === 'VERIFIED';
    const profile = await this.prisma.driverPayoutProfile.upsert({
      where: { driverId },
      create: {
        driverId,
        accountHolderName: dto.accountHolderName,
        accountNumberMasked: this.maskAccount(dto.accountNumber),
        ifsc: dto.ifsc.toUpperCase(),
        vpa: dto.vpa ?? null,
        providerContactId: beneficiary.contactId ?? null,
        providerFundAccountId: beneficiary.fundAccountId ?? null,
        verificationStatus: verified ? KycStatus.APPROVED : KycStatus.PENDING,
        bankVerifiedAt: verified ? new Date() : null,
        registeredName: verification.registeredName ?? null,
        metadataJson: { provider: verification.provider, providerRef: verification.providerRef } as any,
      },
      update: {
        accountHolderName: dto.accountHolderName,
        accountNumberMasked: this.maskAccount(dto.accountNumber),
        ifsc: dto.ifsc.toUpperCase(),
        vpa: dto.vpa ?? null,
        providerContactId: beneficiary.contactId ?? null,
        providerFundAccountId: beneficiary.fundAccountId ?? null,
        verificationStatus: verified ? KycStatus.APPROVED : KycStatus.PENDING,
        bankVerifiedAt: verified ? new Date() : null,
        registeredName: verification.registeredName ?? null,
        metadataJson: { provider: verification.provider, providerRef: verification.providerRef } as any,
      },
    });

    return {
      profile: this.toProfileView(profile),
      // NEEDS_REVIEW → manual approval by admin before payouts flow
      requiresManualReview: !verified,
    };
  }

  async getPayoutProfile(driverId: string) {
    const profile = await this.prisma.driverPayoutProfile.findUnique({ where: { driverId } });
    return { profile: profile ? this.toProfileView(profile) : null };
  }

  /**
   * Move wallet balance to the driver's bank. Funds are reserved (ledger
   * DEBIT) atomically with the payout row; a failed provider call writes a
   * compensating CREDIT so the balance is never silently wrong.
   */
  async requestPayout(driverId: string, dto: RequestPayoutDto) {
    const profile = await this.prisma.driverPayoutProfile.findUnique({ where: { driverId } });
    if (!profile || profile.verificationStatus !== KycStatus.APPROVED || !profile.providerFundAccountId) {
      throw new BadRequestException({
        message: 'Set up and verify your bank account before requesting a payout.',
        error_code: 'payout_profile_missing',
      });
    }

    const balance = await this.walletBalancePaise(driverId);
    const amount = dto.amountPaise ?? balance;
    if (amount < MIN_PAYOUT_PAISE) {
      throw new BadRequestException({
        message: `Minimum payout is ₹${MIN_PAYOUT_PAISE / 100}.`,
        error_code: 'payout_below_minimum',
      });
    }
    if (amount > balance) {
      throw new BadRequestException({
        message: 'Payout amount exceeds wallet balance.',
        error_code: 'insufficient_balance',
      });
    }

    // Reserve the funds + create the payout row atomically
    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.driverPayout.create({
        data: {
          driverId,
          amount,
          mode: dto.mode ?? 'IMPS',
          status: PayoutStatus.QUEUED,
        },
      });
      await tx.walletLedger.create({
        data: {
          accountType: AccountType.DRIVER,
          accountId: driverId,
          amount,
          entryType: WalletEntryType.DEBIT,
          refType: 'PAYOUT',
          refId: created.id,
        },
      });
      return created;
    });

    const result = await this.payouts.createPayout({
      fundAccountId: profile.providerFundAccountId,
      amountPaise: amount,
      mode: (dto.mode ?? 'IMPS') as 'IMPS' | 'NEFT' | 'UPI',
      referenceId: payout.id,
      narration: 'Pahadi Rides payout',
    });

    if (!result.success) {
      // Compensate the reserved funds and surface the failure
      await this.prisma.$transaction([
        this.prisma.driverPayout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.FAILED, failureReason: result.error ?? 'provider_error' },
        }),
        this.prisma.walletLedger.create({
          data: {
            accountType: AccountType.DRIVER,
            accountId: driverId,
            amount,
            entryType: WalletEntryType.CREDIT,
            refType: 'PAYOUT_REVERSAL',
            refId: payout.id,
          },
        }),
      ]);
      throw new BadRequestException({
        message: 'Payout could not be processed. Your balance has not been deducted.',
        error_code: 'payout_failed',
        details: result.error,
      });
    }

    const updated = await this.prisma.driverPayout.update({
      where: { id: payout.id },
      data: {
        status: this.mapProviderStatus(result.status),
        providerPayoutId: result.payoutId ?? null,
        utr: result.utr ?? null,
      },
    });

    this.logger.log(`Payout ${payout.id} (${amount} paise) for driver ${driverId}: ${updated.status}`);
    return { payout: updated, balanceAfterPaise: balance - amount };
  }

  async listPayouts(driverId: string) {
    const payouts = await this.prisma.driverPayout.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { payouts };
  }

  private async walletBalancePaise(driverId: string): Promise<number> {
    const credit = await this.prisma.walletLedger.aggregate({
      where: { accountId: driverId, accountType: AccountType.DRIVER, entryType: WalletEntryType.CREDIT },
      _sum: { amount: true },
    });
    const debit = await this.prisma.walletLedger.aggregate({
      where: { accountId: driverId, accountType: AccountType.DRIVER, entryType: WalletEntryType.DEBIT },
      _sum: { amount: true },
    });
    return Number(credit._sum.amount ?? 0) - Number(debit._sum.amount ?? 0);
  }

  private mapProviderStatus(status?: string): PayoutStatus {
    switch (status) {
      case 'processed':
        return PayoutStatus.PROCESSED;
      case 'processing':
        return PayoutStatus.PROCESSING;
      case 'reversed':
        return PayoutStatus.REVERSED;
      case 'failed':
        return PayoutStatus.FAILED;
      default:
        return PayoutStatus.QUEUED;
    }
  }

  private maskAccount(accountNumber: string): string {
    const digits = accountNumber.replace(/\s/g, '');
    return `XXXX${digits.slice(-4)}`;
  }

  private toProfileView(profile: {
    driverId: string;
    accountHolderName: string;
    accountNumberMasked: string;
    ifsc: string;
    vpa: string | null;
    verificationStatus: KycStatus;
    bankVerifiedAt: Date | null;
    registeredName: string | null;
  }) {
    return {
      driverId: profile.driverId,
      accountHolderName: profile.accountHolderName,
      accountNumberMasked: profile.accountNumberMasked,
      ifsc: profile.ifsc,
      vpa: profile.vpa,
      verificationStatus: profile.verificationStatus,
      bankVerifiedAt: profile.bankVerifiedAt,
      registeredName: profile.registeredName,
    };
  }
}

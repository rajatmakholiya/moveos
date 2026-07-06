import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  AadhaarHolder,
  AadhaarOtpInitResult,
  DrivingLicenseDetails,
  KycProvider,
  KycResult,
  VehicleRcDetails,
} from './kyc.types';

/**
 * Development KYC provider: deterministic auto-verification so the entire
 * onboarding + compliance flow can run locally without a HyperVerge account.
 *
 * Failure fixtures (for testing rejection paths):
 * - Any identifier ending in "0000"  → FAILED
 * - Any identifier ending in "9999"  → NEEDS_REVIEW
 * - Dev Aadhaar OTP is always 123456
 */
@Injectable()
export class DevKycProvider implements KycProvider {
  readonly name = 'dev';
  readonly performsRealVerification = false;
  private readonly logger = new Logger('DevKycProvider');

  async aadhaarGenerateOtp(aadhaarNumber: string): Promise<AadhaarOtpInitResult> {
    if (this.isFailureFixture(aadhaarNumber)) {
      return { success: false, provider: this.name, error: 'aadhaar_not_found' };
    }
    const referenceId = `dev-aadhaar-${randomBytes(8).toString('hex')}`;
    this.logger.log(`[DEV KYC] Aadhaar OTP for ${this.mask(aadhaarNumber)} → 123456 (ref ${referenceId})`);
    return { success: true, provider: this.name, referenceId };
  }

  async aadhaarVerifyOtp(referenceId: string, otp: string): Promise<KycResult & { holder?: AadhaarHolder }> {
    if (otp !== '123456') {
      return { success: false, status: 'FAILED', provider: this.name, providerRef: referenceId, error: 'invalid_otp' };
    }
    return {
      success: true,
      status: 'VERIFIED',
      provider: this.name,
      providerRef: referenceId,
      holder: {
        name: 'Dev Verified Holder',
        dob: '1990-01-01',
        gender: 'M',
        address: 'Dev Lane, Dehradun, Uttarakhand 248001',
      },
    };
  }

  async verifyDrivingLicense(dlNumber: string, dob: string): Promise<KycResult & { license?: DrivingLicenseDetails }> {
    const fixture = this.fixtureOutcome(dlNumber);
    if (fixture) return fixture;
    return {
      success: true,
      status: 'VERIFIED',
      provider: this.name,
      providerRef: `dev-dl-${randomBytes(6).toString('hex')}`,
      license: {
        holderName: 'Dev Verified Holder',
        dlNumber,
        issueDate: '2015-06-01',
        // Far-future expiry so dev drivers never trip the expiry gate.
        expiryDate: '2035-06-01',
        vehicleClasses: ['LMV', 'TRANS'],
      },
      details: { dob },
    };
  }

  async verifyVehicleRc(registrationNumber: string): Promise<KycResult & { rc?: VehicleRcDetails }> {
    const fixture = this.fixtureOutcome(registrationNumber);
    if (fixture) return fixture;
    return {
      success: true,
      status: 'VERIFIED',
      provider: this.name,
      providerRef: `dev-rc-${randomBytes(6).toString('hex')}`,
      rc: {
        registrationNumber,
        ownerName: 'Dev Verified Owner',
        makeModel: 'MAHINDRA BOLERO',
        fuelType: 'DIESEL',
        registrationDate: '2021-04-15',
        fitnessUpto: '2036-04-14',
        insuranceUpto: '2027-04-14',
      },
    };
  }

  async faceMatch(_selfieBase64: string, _referenceBase64: string): Promise<KycResult & { matchScore?: number }> {
    return {
      success: true,
      status: 'VERIFIED',
      provider: this.name,
      providerRef: `dev-face-${randomBytes(6).toString('hex')}`,
      matchScore: 92,
    };
  }

  async validateBankAccount(
    accountNumber: string,
    _ifsc: string,
    holderName: string,
  ): Promise<KycResult & { nameMatch?: boolean; registeredName?: string }> {
    const fixture = this.fixtureOutcome(accountNumber);
    if (fixture) return fixture;
    return {
      success: true,
      status: 'VERIFIED',
      provider: this.name,
      providerRef: `dev-bank-${randomBytes(6).toString('hex')}`,
      nameMatch: true,
      registeredName: holderName,
    };
  }

  private fixtureOutcome(identifier: string): (KycResult & Record<string, never>) | null {
    if (this.isFailureFixture(identifier)) {
      return { success: false, status: 'FAILED', provider: this.name, error: 'verification_failed' } as KycResult &
        Record<string, never>;
    }
    if (identifier.replace(/\D/g, '').endsWith('9999')) {
      return { success: false, status: 'NEEDS_REVIEW', provider: this.name, error: 'manual_review_required' } as KycResult &
        Record<string, never>;
    }
    return null;
  }

  private isFailureFixture(identifier: string): boolean {
    return identifier.replace(/\D/g, '').endsWith('0000');
  }

  private mask(value: string): string {
    return `XXXX-XXXX-${value.slice(-4)}`;
  }
}

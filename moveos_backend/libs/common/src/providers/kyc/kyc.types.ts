export const KYC_PROVIDER = 'KYC_PROVIDER';

export type KycOutcome = 'VERIFIED' | 'FAILED' | 'NEEDS_REVIEW';

export interface KycResult {
  success: boolean;
  status: KycOutcome;
  provider: string;
  /** Provider-side transaction/reference id — persist for audit. */
  providerRef?: string;
  error?: string;
  /** Raw provider payload worth persisting in KycRecord.metadataJson. */
  details?: Record<string, unknown>;
}

export interface AadhaarOtpInitResult {
  success: boolean;
  provider: string;
  /** Handle to pass back into aadhaarVerifyOtp. */
  referenceId?: string;
  error?: string;
}

export interface AadhaarHolder {
  name?: string;
  dob?: string;
  gender?: string;
  address?: string;
  photoBase64?: string;
}

export interface DrivingLicenseDetails {
  holderName?: string;
  dlNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  vehicleClasses?: string[];
}

export interface VehicleRcDetails {
  registrationNumber?: string;
  ownerName?: string;
  makeModel?: string;
  fuelType?: string;
  registrationDate?: string;
  fitnessUpto?: string;
  insuranceUpto?: string;
}

/**
 * Swappable KYC verification boundary (HyperVerge-shaped). Selected via
 * KYC_PROVIDER env ('dev' | 'hyperverge'). The dev provider auto-verifies
 * with deterministic fixtures so full onboarding flows run locally.
 */
export interface KycProvider {
  readonly name: string;
  readonly performsRealVerification: boolean;

  /** Aadhaar OTP flow — sends OTP to the Aadhaar-linked mobile. */
  aadhaarGenerateOtp(aadhaarNumber: string): Promise<AadhaarOtpInitResult>;
  aadhaarVerifyOtp(referenceId: string, otp: string): Promise<KycResult & { holder?: AadhaarHolder }>;

  /** Driving licence verification against the RTO (Sarathi) registry. */
  verifyDrivingLicense(dlNumber: string, dob: string): Promise<KycResult & { license?: DrivingLicenseDetails }>;

  /** Vehicle RC verification against the Vahan registry. */
  verifyVehicleRc(registrationNumber: string): Promise<KycResult & { rc?: VehicleRcDetails }>;

  /** Selfie vs reference photo face match with liveness. Score in [0, 100]. */
  faceMatch(selfieBase64: string, referenceBase64: string): Promise<KycResult & { matchScore?: number }>;

  /** Bank account penny-drop validation. */
  validateBankAccount(
    accountNumber: string,
    ifsc: string,
    holderName: string,
  ): Promise<KycResult & { nameMatch?: boolean; registeredName?: string }>;
}

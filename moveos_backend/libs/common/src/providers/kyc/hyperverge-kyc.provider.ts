import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import {
  AadhaarHolder,
  AadhaarOtpInitResult,
  DrivingLicenseDetails,
  KycProvider,
  KycResult,
  VehicleRcDetails,
} from './kyc.types';

export interface HypervergeConfig {
  appId: string;
  appKey: string;
  baseUrl?: string;
  /** Face-match confidence threshold (0-100) below which we return NEEDS_REVIEW. */
  faceMatchThreshold?: number;
}

/**
 * HyperVerge KYC provider. Endpoint shapes follow the HyperVerge India KYC
 * API suite (Aadhaar OKYC, RTO/Sarathi DL, Vahan RC, face match, penny drop).
 * Configure via HYPERVERGE_APP_ID, HYPERVERGE_APP_KEY, HYPERVERGE_BASE_URL.
 *
 * NOTE: exact response fields can differ per HyperVerge contract/version —
 * the response mapping below is defensive and stores the raw payload in
 * `details` so nothing is lost if field names shift.
 */
@Injectable()
export class HypervergeKycProvider implements KycProvider {
  readonly name = 'hyperverge';
  readonly performsRealVerification = true;
  private readonly logger = new Logger('HypervergeKycProvider');
  private readonly http: AxiosInstance;
  private readonly faceMatchThreshold: number;

  constructor(config: HypervergeConfig) {
    this.faceMatchThreshold = config.faceMatchThreshold ?? 75;
    this.http = axios.create({
      baseURL: config.baseUrl ?? 'https://ind.idv.hyperverge.co/v1',
      timeout: 30_000,
      headers: {
        appId: config.appId,
        appKey: config.appKey,
        'content-type': 'application/json',
      },
    });
  }

  async aadhaarGenerateOtp(aadhaarNumber: string): Promise<AadhaarOtpInitResult> {
    try {
      const res = await this.http.post('/aadhaar/generateOtp', {
        aadhaarNumber,
        transactionId: randomUUID(),
        consent: 'yes',
      });
      const result = res.data?.result ?? res.data;
      return {
        success: this.isSuccess(res.data),
        provider: this.name,
        referenceId: result?.requestId ?? result?.referenceId ?? res.data?.metadata?.requestId,
        error: this.isSuccess(res.data) ? undefined : this.errorOf(res.data),
      };
    } catch (err) {
      return { success: false, provider: this.name, error: this.axiosError(err) };
    }
  }

  async aadhaarVerifyOtp(referenceId: string, otp: string): Promise<KycResult & { holder?: AadhaarHolder }> {
    try {
      const res = await this.http.post('/aadhaar/verifyOtp', { requestId: referenceId, otp });
      const ok = this.isSuccess(res.data);
      const details = (res.data?.result?.details ?? res.data?.result ?? {}) as Record<string, any>;
      return {
        success: ok,
        status: ok ? 'VERIFIED' : 'FAILED',
        provider: this.name,
        providerRef: referenceId,
        error: ok ? undefined : this.errorOf(res.data),
        details: res.data,
        holder: ok
          ? {
              name: details.name ?? details.fullName,
              dob: details.dob ?? details.dateOfBirth,
              gender: details.gender,
              address: typeof details.address === 'string' ? details.address : JSON.stringify(details.address ?? ''),
              photoBase64: details.photo ?? details.image,
            }
          : undefined,
      };
    } catch (err) {
      return { success: false, status: 'FAILED', provider: this.name, error: this.axiosError(err) };
    }
  }

  async verifyDrivingLicense(dlNumber: string, dob: string): Promise<KycResult & { license?: DrivingLicenseDetails }> {
    try {
      const res = await this.http.post('/checkDL', { dlNumber, dob, transactionId: randomUUID() });
      const ok = this.isSuccess(res.data);
      const details = (res.data?.result?.details ?? res.data?.result ?? {}) as Record<string, any>;
      return {
        success: ok,
        status: ok ? 'VERIFIED' : 'FAILED',
        provider: this.name,
        providerRef: res.data?.metadata?.requestId,
        error: ok ? undefined : this.errorOf(res.data),
        details: res.data,
        license: ok
          ? {
              holderName: details.name ?? details.holderName,
              dlNumber: details.dlNumber ?? dlNumber,
              issueDate: details.issueDate ?? details.doi,
              expiryDate: details.validUpto ?? details.expiryDate ?? details.nonTransportValidUpto,
              vehicleClasses: details.vehicleClasses ?? details.covDetails ?? [],
            }
          : undefined,
      };
    } catch (err) {
      return { success: false, status: 'FAILED', provider: this.name, error: this.axiosError(err) };
    }
  }

  async verifyVehicleRc(registrationNumber: string): Promise<KycResult & { rc?: VehicleRcDetails }> {
    try {
      const res = await this.http.post('/checkRC', { rcNumber: registrationNumber, transactionId: randomUUID() });
      const ok = this.isSuccess(res.data);
      const details = (res.data?.result?.details ?? res.data?.result ?? {}) as Record<string, any>;
      return {
        success: ok,
        status: ok ? 'VERIFIED' : 'FAILED',
        provider: this.name,
        providerRef: res.data?.metadata?.requestId,
        error: ok ? undefined : this.errorOf(res.data),
        details: res.data,
        rc: ok
          ? {
              registrationNumber: details.rcNumber ?? registrationNumber,
              ownerName: details.ownerName ?? details.owner,
              makeModel: details.makerModel ?? details.model,
              fuelType: details.fuelType,
              registrationDate: details.registrationDate,
              fitnessUpto: details.fitnessUpto,
              insuranceUpto: details.insuranceUpto ?? details.insuranceValidity,
            }
          : undefined,
      };
    } catch (err) {
      return { success: false, status: 'FAILED', provider: this.name, error: this.axiosError(err) };
    }
  }

  async faceMatch(selfieBase64: string, referenceBase64: string): Promise<KycResult & { matchScore?: number }> {
    try {
      const res = await this.http.post('/photo/verifyPair', {
        image1: selfieBase64,
        image2: referenceBase64,
        transactionId: randomUUID(),
      });
      const ok = this.isSuccess(res.data);
      const details = (res.data?.result?.details ?? res.data?.result ?? {}) as Record<string, any>;
      const rawScore = Number(details.matchScore ?? details.match_score ?? details.confidence ?? 0);
      // Normalize 0-1 confidence scales to 0-100.
      const matchScore = rawScore > 0 && rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);
      const status: KycResult['status'] = !ok
        ? 'FAILED'
        : matchScore >= this.faceMatchThreshold
          ? 'VERIFIED'
          : 'NEEDS_REVIEW';
      return {
        success: status === 'VERIFIED',
        status,
        provider: this.name,
        providerRef: res.data?.metadata?.requestId,
        error: ok ? undefined : this.errorOf(res.data),
        details: res.data,
        matchScore,
      };
    } catch (err) {
      return { success: false, status: 'FAILED', provider: this.name, error: this.axiosError(err) };
    }
  }

  async validateBankAccount(
    accountNumber: string,
    ifsc: string,
    holderName: string,
  ): Promise<KycResult & { nameMatch?: boolean; registeredName?: string }> {
    try {
      const res = await this.http.post('/bankAccountVerification', {
        accountNumber,
        ifsc,
        name: holderName,
        transactionId: randomUUID(),
      });
      const ok = this.isSuccess(res.data);
      const details = (res.data?.result?.details ?? res.data?.result ?? {}) as Record<string, any>;
      const registeredName = details.registeredName ?? details.beneficiaryName ?? details.nameAtBank;
      const nameMatch = details.nameMatch ?? details.name_match ?? undefined;
      return {
        success: ok,
        status: ok ? (nameMatch === false ? 'NEEDS_REVIEW' : 'VERIFIED') : 'FAILED',
        provider: this.name,
        providerRef: res.data?.metadata?.requestId,
        error: ok ? undefined : this.errorOf(res.data),
        details: res.data,
        nameMatch: typeof nameMatch === 'boolean' ? nameMatch : undefined,
        registeredName,
      };
    } catch (err) {
      return { success: false, status: 'FAILED', provider: this.name, error: this.axiosError(err) };
    }
  }

  private isSuccess(payload: any): boolean {
    const status = payload?.status ?? payload?.result?.status;
    return status === 'success' || status === 'SUCCESS' || payload?.statusCode === 200;
  }

  private errorOf(payload: any): string {
    return payload?.error ?? payload?.result?.message ?? payload?.message ?? 'hyperverge_verification_failed';
  }

  private axiosError(err: unknown): string {
    const anyErr = err as { response?: { data?: any }; message?: string };
    const message = anyErr.response?.data?.error ?? anyErr.response?.data?.message ?? anyErr.message ?? 'request_failed';
    this.logger.error(`HyperVerge request failed: ${message}`);
    return String(message);
  }
}

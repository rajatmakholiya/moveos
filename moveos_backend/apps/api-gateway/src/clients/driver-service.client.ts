import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@common/http/http.module';

@Injectable()
export class DriverServiceClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService, private readonly http: HttpClientService) {
    this.baseUrl = this.config.get<string>('DRIVER_SERVICE_URL') ?? 'http://localhost:3001/api';
  }

  goOnline(driverId: string) {
    return this.http.post(`${this.baseUrl}/drivers/go-online`, { driverId });
  }

  goOffline(driverId: string) {
    return this.http.post(`${this.baseUrl}/drivers/go-offline`, { driverId });
  }

  getProfile(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}`);
  }

  getComplianceStatus(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/compliance`);
  }

  getEarningsSummary(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/earnings`);
  }

  getWalletBalance(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/wallet`);
  }

  getVehicles(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/vehicles`);
  }

  getOperatingContexts(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/operating-contexts`);
  }

  selectOperatingContext(driverId: string, contextId: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/operating-context`, { contextId });
  }

  getOperationalVehicle(driverId: string, vehicleId?: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/operational-vehicle`, {
      params: { vehicleId },
    });
  }

  createVehicle(driverId: string, body: { plate: string; type: string }) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/vehicles`, body);
  }

  activateVehicle(driverId: string, vehicleId?: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/vehicles/active`, { vehicleId });
  }

  requestVehicleDocumentUpload(driverId: string, vehicleId: string, type: string, filename?: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/vehicles/${vehicleId}/documents/upload-request`, { type, filename });
  }

  createVehicleDocument(driverId: string, vehicleId: string, type: string, url: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/vehicles/${vehicleId}/documents`, { type, url });
  }

  requestDocumentUpload(driverId: string, type: string, filename?: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/documents/upload-request`, { type, filename });
  }

  createDocument(driverId: string, type: string, url: string) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/documents`, { type, url });
  }

  submitKyc(driverId: string, body: object) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/kyc`, body);
  }

  getWalletLedger(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/wallet/ledger`);
  }

  // Payouts
  setupPayoutProfile(driverId: string, body: object) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/payout-profile`, body);
  }

  getPayoutProfile(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/payout-profile`);
  }

  requestPayout(driverId: string, body: object) {
    return this.http.post(`${this.baseUrl}/drivers/${driverId}/payouts`, body);
  }

  listPayouts(driverId: string) {
    return this.http.get(`${this.baseUrl}/drivers/${driverId}/payouts`);
  }
}

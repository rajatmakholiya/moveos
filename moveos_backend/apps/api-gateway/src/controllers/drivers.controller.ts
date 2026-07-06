import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { DriverServiceClient } from '../clients/driver-service.client';
import { ActivateVehicleDto, CreateVehicleDto, DocumentUploadRequestDto, DriverDocumentDto, SubmitDriverKycDto, VehicleDocumentDto } from '../dto/driver.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller()
export class DriversController {
  constructor(private readonly driverClient: DriverServiceClient) {}

  @Post('drivers/me/go-online')
  goOnline(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.goOnline(driverId);
  }

  @Post('drivers/me/go-offline')
  goOffline(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.goOffline(driverId);
  }

  @Get('drivers/me')
  me(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getProfile(driverId);
  }

  @Get('compliance/me/status')
  compliance(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getComplianceStatus(driverId);
  }

  @Get('driver/compliance')
  driverCompliance(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getComplianceStatus(driverId);
  }

  @Get('earnings/me/summary')
  earnings(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getEarningsSummary(driverId);
  }

  @Get('driver/earnings')
  driverEarnings(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getEarningsSummary(driverId);
  }

  @Get('wallet/me/balance')
  wallet(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getWalletBalance(driverId);
  }

  @Get('wallet/me/ledger')
  walletLedger(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getWalletLedger(driverId);
  }

  @Get('drivers/me/vehicles')
  vehicles(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getVehicles(driverId);
  }

  @Get('drivers/me/operating-contexts')
  operatingContexts(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getOperatingContexts(driverId);
  }

  @Post('drivers/me/operating-context')
  selectOperatingContext(@Req() req: any, @Body() body: { contextId: string }) {
    const driverId = this.getDriverId(req);
    return this.driverClient.selectOperatingContext(driverId, body.contextId);
  }

  @Post('drivers/me/vehicles')
  createVehicle(@Req() req: any, @Body() body: CreateVehicleDto) {
    const driverId = this.getDriverId(req);
    return this.driverClient.createVehicle(driverId, body);
  }

  @Post('drivers/me/vehicles/active')
  activateVehicle(@Req() req: any, @Body() body: ActivateVehicleDto) {
    const driverId = this.getDriverId(req);
    return this.driverClient.activateVehicle(driverId, body.vehicleId);
  }

  // Static segment declared before :vehicleId/documents to take precedence.
  @Post('drivers/me/vehicles/:vehicleId/documents/upload-request')
  requestVehicleDocumentUpload(@Req() req: any, @Body() body: DocumentUploadRequestDto, @Param('vehicleId') vehicleId: string) {
    const driverId = this.getDriverId(req);
    return this.driverClient.requestVehicleDocumentUpload(driverId, vehicleId, body.type, body.filename);
  }

  @Post('drivers/me/vehicles/:vehicleId/documents')
  createVehicleDocument(@Req() req: any, @Body() body: VehicleDocumentDto, @Param('vehicleId') vehicleId: string) {
    const driverId = this.getDriverId(req);
    return this.driverClient.createVehicleDocument(driverId, vehicleId, body.type, body.url);
  }

  @Post('drivers/me/documents/upload-request')
  requestDocumentUpload(@Req() req: any, @Body() body: DocumentUploadRequestDto) {
    const driverId = this.getDriverId(req);
    return this.driverClient.requestDocumentUpload(driverId, body.type, body.filename);
  }

  @Post('drivers/me/documents')
  createDocument(@Req() req: any, @Body() body: DriverDocumentDto) {
    const driverId = this.getDriverId(req);
    return this.driverClient.createDocument(driverId, body.type, body.url);
  }

  @Post('drivers/me/kyc')
  submitKyc(@Req() req: any, @Body() body: SubmitDriverKycDto) {
    const driverId = this.getDriverId(req);
    return this.driverClient.submitKyc(driverId, body);
  }

  // ── Payouts ────────────────────────────────────────────────────────────────

  @Post('drivers/me/payout-profile')
  setupPayoutProfile(
    @Req() req: any,
    @Body() body: { accountHolderName: string; accountNumber: string; ifsc: string; vpa?: string },
  ) {
    const driverId = this.getDriverId(req);
    return this.driverClient.setupPayoutProfile(driverId, body);
  }

  @Get('drivers/me/payout-profile')
  getPayoutProfile(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.getPayoutProfile(driverId);
  }

  @Post('drivers/me/payouts')
  requestPayout(@Req() req: any, @Body() body: { amountPaise?: number; mode?: string }) {
    const driverId = this.getDriverId(req);
    return this.driverClient.requestPayout(driverId, body);
  }

  @Get('drivers/me/payouts')
  listPayouts(@Req() req: any) {
    const driverId = this.getDriverId(req);
    return this.driverClient.listPayouts(driverId);
  }

  private getDriverId(req: any): string {
    return req.user?.driverId ?? req.user?.sub;
  }
}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DriverService } from './driver.service';
import { PayoutService } from './payout.service';
import { ActivateVehicleDto, CreateVehicleDto, DriverIdDto, DriverDocumentDto, DocumentUploadRequestDto, SelectOperatingContextDto, SubmitDriverKycDto, VehicleDocumentDto } from './dto/driver.dto';
import { RequestPayoutDto, SetupPayoutProfileDto } from './dto/payout.dto';

@Controller('drivers')
export class DriverController {
  constructor(
    private readonly driverService: DriverService,
    private readonly payoutService: PayoutService,
  ) {}

  // ── Payouts ────────────────────────────────────────────────────────────────

  @Post(':driverId/payout-profile')
  setupPayoutProfile(@Param('driverId') driverId: string, @Body() body: SetupPayoutProfileDto) {
    return this.payoutService.setupPayoutProfile(driverId, body);
  }

  @Get(':driverId/payout-profile')
  getPayoutProfile(@Param('driverId') driverId: string) {
    return this.payoutService.getPayoutProfile(driverId);
  }

  @Post(':driverId/payouts')
  requestPayout(@Param('driverId') driverId: string, @Body() body: RequestPayoutDto) {
    return this.payoutService.requestPayout(driverId, body);
  }

  @Get(':driverId/payouts')
  listPayouts(@Param('driverId') driverId: string) {
    return this.payoutService.listPayouts(driverId);
  }

  @Post('go-online')
  goOnline(@Body() body: DriverIdDto) {
    return this.driverService.goOnline(body.driverId);
  }

  @Post('go-offline')
  goOffline(@Body() body: DriverIdDto) {
    return this.driverService.goOffline(body.driverId);
  }

  @Get(':driverId')
  getDriver(@Param('driverId') driverId: string) {
    return this.driverService.getProfile(driverId);
  }

  @Get(':driverId/compliance')
  complianceStatus(@Param('driverId') driverId: string) {
    return this.driverService.getComplianceStatus(driverId);
  }

  @Get(':driverId/earnings')
  earningsSummary(@Param('driverId') driverId: string) {
    return this.driverService.getEarningsSummary(driverId);
  }

  @Get(':driverId/wallet')
  walletBalance(@Param('driverId') driverId: string) {
    return this.driverService.getWalletBalance(driverId);
  }

  @Get(':driverId/wallet/ledger')
  walletLedger(@Param('driverId') driverId: string) {
    return this.driverService.getWalletLedger(driverId);
  }

  @Get(':driverId/vehicles')
  getVehicles(@Param('driverId') driverId: string) {
    return this.driverService.getVehicles(driverId);
  }

  @Get(':driverId/operating-contexts')
  getOperatingContexts(@Param('driverId') driverId: string) {
    return this.driverService.getOperatingContexts(driverId);
  }

  @Post(':driverId/operating-context')
  selectOperatingContext(@Param('driverId') driverId: string, @Body() body: SelectOperatingContextDto) {
    return this.driverService.selectOperatingContext(driverId, body.contextId);
  }

  @Get(':driverId/operational-vehicle')
  getOperationalVehicle(@Param('driverId') driverId: string) {
    return this.driverService.getOperationalVehicle(driverId);
  }

  @Post(':driverId/vehicles')
  createVehicle(@Param('driverId') driverId: string, @Body() body: CreateVehicleDto) {
    return this.driverService.createVehicle(driverId, body);
  }

  @Post(':driverId/vehicles/active')
  activateVehicle(@Param('driverId') driverId: string, @Body() body: ActivateVehicleDto) {
    return this.driverService.activateVehicle(driverId, body.vehicleId);
  }

  // Static segment must be declared before :vehicleId/documents to avoid ambiguity.
  @Post(':driverId/vehicles/:vehicleId/documents/upload-request')
  requestVehicleDocumentUpload(
    @Param('vehicleId') vehicleId: string,
    @Body() body: DocumentUploadRequestDto,
  ) {
    return this.driverService.requestVehicleDocumentUploadUrl(vehicleId, body.type, body.filename);
  }

  @Post(':driverId/vehicles/:vehicleId/documents')
  createVehicleDocument(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: VehicleDocumentDto,
  ) {
    return this.driverService.createVehicleDocumentMetadata(driverId, vehicleId, body.type, body.url);
  }

  @Post(':driverId/documents/upload-request')
  requestDocumentUpload(
    @Param('driverId') driverId: string,
    @Body() body: DocumentUploadRequestDto,
  ) {
    return this.driverService.requestDocumentUploadUrl(driverId, body.type, body.filename);
  }

  @Post(':driverId/documents')
  createDocument(@Param('driverId') driverId: string, @Body() body: DriverDocumentDto) {
    return this.driverService.createDocumentMetadata(driverId, body.type, body.url);
  }

  @Post(':driverId/kyc')
  submitKyc(@Param('driverId') driverId: string, @Body() body: SubmitDriverKycDto) {
    return this.driverService.submitKyc(driverId, body);
  }
}

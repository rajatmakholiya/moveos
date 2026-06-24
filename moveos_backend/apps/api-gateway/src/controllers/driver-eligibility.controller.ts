import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { DriverRideEligibilityService } from '../services/driver-ride-eligibility.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller('driver')
export class DriverEligibilityController {
  constructor(private readonly eligibilityService: DriverRideEligibilityService) {}

  /**
   * Soft eligibility check — never throws 4xx; always 200 with eligible + blockReasons.
   * Use from PWA before showing the accept button and before each ride action.
   */
  @Get('vehicles/:vehicleId/eligibility')
  async checkVehicleEligibility(
    @Req() req: any,
    @Param('vehicleId') vehicleId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const driverId: string = req.user?.driverId ?? req.user?.sub;
    const result = await this.eligibilityService.checkEligibility({
      driverUserId: req.user.sub,
      driverId,
      vehicleId,
      organizationId,
    });

    if (result.eligible) {
      const { eligible: _e, ...contextRest } = result.context!;
      return { success: true, data: { eligible: true, ...contextRest } };
    }

    return { success: true, data: { eligible: false, blockReasons: result.blockReasons } };
  }
}

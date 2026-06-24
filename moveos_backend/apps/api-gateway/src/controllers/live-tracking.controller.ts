import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@common/index';
import { LiveTrackingService } from '../services/live-tracking.service';

/**
 * Live fleet tracking for admins.
 *
 *  - SUPER_ADMIN / ADMIN  → every in-progress trip; filter by organization and/or vehicle.
 *  - ORG operators        → automatically scoped to their organization(s).
 *
 * Returns a point-in-time snapshot (vehicle position + pickup/drop stop sequence).
 * Continuous position updates are streamed over the WebSocket gateway: the client
 * subscribes to `track:drivers` with the driverIds from this snapshot.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class LiveTrackingController {
  constructor(private readonly tracking: LiveTrackingService) {}

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/live-tracking')
  getAdminLiveTracking(
    @Req() req: any,
    @Query('organizationId') organizationId?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.tracking
      .getActiveTrips(req.user, { organizationId, vehicleId })
      .then((data) => ({ status: 'ok', data }));
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/live-tracking/trips/:tripId')
  getAdminTripDetail(@Req() req: any, @Param('tripId') tripId: string) {
    return this.tracking.getTripDetail(req.user, tripId).then((trip) => ({ status: 'ok', data: { trip } }));
  }

  // ── Schedule tracking (planner) ──────────────────────────────────────────
  // Trips for a chosen day (default today) with pickup/drop stops + last-known
  // driver position, for planning ahead and handling offline bookings.

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/schedule-tracking')
  getAdminScheduleTracking(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('organizationId') organizationId?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.tracking
      .getScheduledByDate(req.user, { date, organizationId, vehicleId })
      .then((data) => ({ status: 'ok', data }));
  }

  @Roles('ORG_ADMIN', 'SUPER_ADMIN', 'ADMIN')
  @Get('organizations/:organizationId/schedule-tracking')
  getOrgScheduleTracking(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Query('date') date?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.tracking
      .getScheduledByDate(req.user, { date, organizationId, vehicleId })
      .then((data) => ({ status: 'ok', data }));
  }

  // Org-operator scoped — JWT role is ORG_ADMIN (member of the org); the service
  // enforces that the caller belongs to the organization being tracked.
  @Roles('ORG_ADMIN', 'SUPER_ADMIN', 'ADMIN')
  @Get('organizations/:organizationId/live-tracking')
  getOrgLiveTracking(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.tracking
      .getActiveTrips(req.user, { organizationId, vehicleId })
      .then((data) => ({ status: 'ok', data }));
  }

  @Roles('ORG_ADMIN', 'SUPER_ADMIN', 'ADMIN')
  @Get('organizations/:organizationId/live-tracking/trips/:tripId')
  getOrgTripDetail(@Req() req: any, @Param('tripId') tripId: string) {
    return this.tracking.getTripDetail(req.user, tripId).then((trip) => ({ status: 'ok', data: { trip } }));
  }
}

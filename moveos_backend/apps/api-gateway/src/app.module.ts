import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppConfigModule, AuthModule, FileModule, HttpClientModule, PrismaModule, ProvidersModule, RedisModule } from '@common/index';
import { RateLimitMiddleware, RequestIdMiddleware } from './middleware/rate-limit.middleware';
import { AuthController } from './auth/auth.controller';
import { DriversController } from './controllers/drivers.controller';
import { TelemetryController } from './controllers/telemetry.controller';
import { RidesController } from './controllers/rides.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { HealthController } from './controllers/health.controller';
import { DriverServiceClient } from './clients/driver-service.client';
import { TelemetryServiceClient } from './clients/telemetry-service.client';
import { RideServiceClient } from './clients/ride-service.client';
import { DispatchServiceClient } from './clients/dispatch-service.client';
import { NotificationServiceClient } from './clients/notification-service.client';
import { GatewayEventsGateway } from './gateway/events.gateway';
import { OnboardingController } from './controllers/onboarding.controller';
import { OnboardingServiceClient } from './clients/onboarding-service.client';
import { LocationController } from './controllers/location.controller';
import { LocationServiceClient } from './clients/location-service.client';
import { BookingsController } from './controllers/bookings.controller';
import { BookingServiceClient } from './clients/booking-service.client';
import { SchedulingServiceClient } from './clients/scheduling-service.client';
import { DriverTripsController, TripsController } from './controllers/trips.controller';
import { AdminRoutesController, RoutesController } from './controllers/routes.controller';
import { PassengerController } from './controllers/passenger.controller';
import { AdminTransportRequestsController, DriverBookingsController, DriverRequestsController, RequestsController } from './controllers/requests.controller';
import { GeoController } from './controllers/geo.controller';
import { OrganizationsController } from './controllers/organizations.controller';
import { DriverInvitationsController } from './controllers/driver-invitations.controller';
import { ClustersController } from './controllers/clusters.controller';
import { DriverKycController } from './controllers/driver-kyc.controller';
import { DriverOnboardingController } from './controllers/driver-onboarding.controller';
import { DriverVerificationController } from './controllers/driver-verification.controller';
import { VehicleDriverAssignmentsController } from './controllers/vehicle-driver-assignments.controller';
import { FaresController } from './controllers/fares.controller';
import { RatingsController } from './controllers/ratings.controller';
import { FeatureFlagsController } from './controllers/feature-flags.controller';
import { FilesController } from './controllers/files.controller';
import { DriverEligibilityController } from './controllers/driver-eligibility.controller';
import { DriverRideEligibilityService } from './services/driver-ride-eligibility.service';
import { LiveTrackingController } from './controllers/live-tracking.controller';
import { LiveTrackingService } from './services/live-tracking.service';

@Module({
  imports: [AppConfigModule, AuthModule, FileModule, HttpClientModule, PrismaModule, ProvidersModule, RedisModule],
  controllers: [
    AuthController,
    DriversController,
    TelemetryController,
    RidesController,
    NotificationsController,
    HealthController,
    OnboardingController,
    LocationController,
    BookingsController,
    TripsController,
    DriverTripsController,
    RoutesController,
    PassengerController,
    RequestsController,
    DriverRequestsController,
    DriverBookingsController,
    AdminTransportRequestsController,
    GeoController,
    OrganizationsController,
    DriverInvitationsController,
    ClustersController,
    DriverKycController,
    DriverOnboardingController,
    DriverVerificationController,
    VehicleDriverAssignmentsController,
    FaresController,
    RatingsController,
    AdminRoutesController,
    FeatureFlagsController,
    FilesController,
    DriverEligibilityController,
    LiveTrackingController,
  ],
  providers: [
    DriverServiceClient,
    TelemetryServiceClient,
    RideServiceClient,
    DispatchServiceClient,
    NotificationServiceClient,
    GatewayEventsGateway,
    OnboardingServiceClient,
    LocationServiceClient,
    BookingServiceClient,
    SchedulingServiceClient,
    DriverRideEligibilityService,
    LiveTrackingService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}

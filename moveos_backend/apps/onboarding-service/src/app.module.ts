import { Module } from '@nestjs/common';
import { AppConfigModule, PrismaModule, RedisModule, AuthModule } from '@common/index';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingTokenGuard } from './guards/onboarding-token.guard';
import { IdempotencyService } from './idempotency/idempotency.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, AuthModule],
  controllers: [OnboardingController, HealthController],
  providers: [OnboardingService, OnboardingTokenGuard, IdempotencyService],
})
export class AppModule {}

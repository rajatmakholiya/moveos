import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { OnboardingServiceClient } from '../clients/onboarding-service.client';
import { ConsentsDto, CreateSessionDto, ProfileDto } from '../dto/onboarding.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingClient: OnboardingServiceClient) {}

  @Post('session')
  createSession(
    @Body() body: CreateSessionDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.onboardingClient.createSession(body, idempotencyKey);
  }

  @Post('profile')
  profile(
    @Body() body: ProfileDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const token = this.extractToken(authorization);
    return this.onboardingClient.submitProfile(token, body, idempotencyKey);
  }

  @Post('consents')
  consents(
    @Body() body: ConsentsDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const token = this.extractToken(authorization);
    return this.onboardingClient.submitConsents(token, body, idempotencyKey);
  }

  @Get('context')
  context(
    @Headers('authorization') authorization?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const token = this.extractToken(authorization);
    const parsedLat = lat ? Number(lat) : undefined;
    const parsedLng = lng ? Number(lng) : undefined;
    return this.onboardingClient.fetchContext(
      token,
      Number.isFinite(parsedLat) ? parsedLat : undefined,
      Number.isFinite(parsedLng) ? parsedLng : undefined,
    );
  }

  @Post('complete')
  complete(
    @Body() body: Partial<ProfileDto>,
    @Headers('authorization') authorization?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const token = this.extractToken(authorization);
    return this.onboardingClient.complete(token, body, idempotencyKey);
  }

  private extractToken(header?: string) {
    if (!header) {
      throw new UnauthorizedException('Missing onboarding token');
    }
    return header;
  }
}

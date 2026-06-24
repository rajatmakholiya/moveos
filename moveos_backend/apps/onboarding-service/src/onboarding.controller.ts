import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateSessionDto, ProfileDto, ConsentsDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { OnboardingTokenGuard } from './guards/onboarding-token.guard';
import { IdempotencyService } from './idempotency/idempotency.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('session')
  async createSession(
    @Body() body: CreateSessionDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const replay = await this.idempotency.replay(idempotencyKey);
    if (replay) return replay.response;
    const result = await this.onboardingService.createSession(body);
    await this.idempotency.persist(idempotencyKey, 'POST', '/onboarding/session', 200, result);
    return result;
  }

  @UseGuards(OnboardingTokenGuard)
  @Post('profile')
  async profile(
    @Req() req: any,
    @Body() body: ProfileDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const replay = await this.idempotency.replay(idempotencyKey);
    if (replay) return replay.response;
    const result = await this.onboardingService.handleProfile(req.onboardingSession, body);
    await this.idempotency.persist(idempotencyKey, 'POST', '/onboarding/profile', 200, result);
    return result;
  }

  @UseGuards(OnboardingTokenGuard)
  @Post('consents')
  async consents(
    @Req() req: any,
    @Body() body: ConsentsDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const replay = await this.idempotency.replay(idempotencyKey);
    if (replay) return replay.response;
    const result = await this.onboardingService.recordConsents(req.onboardingSession, body);
    await this.idempotency.persist(idempotencyKey, 'POST', '/onboarding/consents', 200, result);
    return result;
  }

  @UseGuards(OnboardingTokenGuard)
  @Get('context')
  async context(@Req() req: any, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const parsedLat = lat ? Number(lat) : undefined;
    const parsedLng = lng ? Number(lng) : undefined;
    return this.onboardingService.getContext(req.onboardingSession, parsedLat, parsedLng);
  }

  @UseGuards(OnboardingTokenGuard)
  @Post('complete')
  async complete(
    @Req() req: any,
    @Body() body: Partial<ProfileDto>,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const replay = await this.idempotency.replay(idempotencyKey);
    if (replay) return replay.response;
    const result = await this.onboardingService.complete(req.onboardingSession, body);
    await this.idempotency.persist(idempotencyKey, 'POST', '/onboarding/complete', 200, result);
    return result;
  }
}

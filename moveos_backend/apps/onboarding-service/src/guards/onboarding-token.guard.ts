import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { OnboardingService } from '../onboarding.service';

@Injectable()
export class OnboardingTokenGuard implements CanActivate {
  constructor(private readonly onboardingService: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { onboardingSession?: any }>();
    const authHeader = req.headers['authorization'] as string | undefined;
    const token = this.extractBearer(authHeader);
    if (!token) {
      throw new UnauthorizedException('Missing onboarding token');
    }
    const session = await this.onboardingService.validateSessionToken(token);
    (req as any).onboardingSession = session;
    return true;
  }

  private extractBearer(header?: string) {
    if (!header) return null;
    if (header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return header;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppRole } from './roles.decorator';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: AppRole;
  driverId?: string;
  passengerId?: string;
  organizationIds?: string[];
  defaultOrganizationId?: string;
  orgRole?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // RIDER was the old role label for passengers. Normalize to PASSENGER so all
    // guard checks can use a single canonical value.
    if ((payload.role as string) === 'RIDER') {
      return { ...payload, role: 'PASSENGER' as AppRole };
    }
    return payload;
  }
}

import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsNumberString, IsOptional, IsString, IsUrl, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  PORT!: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  REDIS_URL!: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'DRIVER_SERVICE_URL must be a valid url' })
  DRIVER_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'RIDE_SERVICE_URL must be a valid url' })
  RIDE_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'DISPATCH_SERVICE_URL must be a valid url' })
  DISPATCH_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'TELEMETRY_SERVICE_URL must be a valid url' })
  TELEMETRY_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'NOTIFICATION_SERVICE_URL must be a valid url' })
  NOTIFICATION_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'ONBOARDING_SERVICE_URL must be a valid url' })
  ONBOARDING_SERVICE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'LOCATION_SERVICE_URL must be a valid url' })
  LOCATION_SERVICE_URL?: string;

  @IsOptional()
  @IsString()
  OLA_MAPS_API_KEY?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'OLA_MAPS_BASE_URL must be a valid url' })
  OLA_MAPS_BASE_URL?: string;

  @IsOptional()
  @IsNumberString()
  LOCATION_CACHE_TTL_SECONDS?: string;
}

const INSECURE_JWT_SECRETS = new Set(['supersecret', 'replace-with-secure-secret', 'changeme', 'secret', 'password']);

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Config validation error: ${errors.map((err) => Object.values(err.constraints ?? {})).join(', ')}`,
    );
  }

  const nodeEnv = (config['NODE_ENV'] as string | undefined) ?? 'development';
  if (nodeEnv !== 'test' && INSECURE_JWT_SECRETS.has(validatedConfig.JWT_SECRET)) {
    const message =
      '[MoveOS] JWT_SECRET is set to a known-insecure default. ' +
      'Generate a secure value with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"';
    if (nodeEnv === 'production') {
      throw new Error(message);
    }
    console.warn(`\x1b[33mWARN\x1b[0m [Bootstrap] ${message}`);
  }

  return validatedConfig;
}

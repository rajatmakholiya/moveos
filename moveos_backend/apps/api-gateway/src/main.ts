import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ApiExceptionFilter, ApiResponseInterceptor } from '@common/index';

const SERVICE_URL_VARS = [
  'DRIVER_SERVICE_URL',
  'RIDE_SERVICE_URL',
  'DISPATCH_SERVICE_URL',
  'TELEMETRY_SERVICE_URL',
  'NOTIFICATION_SERVICE_URL',
  'ONBOARDING_SERVICE_URL',
  'LOCATION_SERVICE_URL',
  'SCHEDULING_SERVICE_URL',
  'BOOKING_SERVICE_URL',
] as const;

function validateServiceUrls(): void {
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const key of SERVICE_URL_VARS) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else if (!/^https?:\/\//i.test(value)) {
      malformed.push(`${key}="${value}"`);
    }
  }

  if (missing.length === 0 && malformed.length === 0) return;

  const lines = ['[MoveOS] Service URL configuration errors:'];
  if (missing.length > 0) lines.push(`  Missing: ${missing.join(', ')}`);
  if (malformed.length > 0) lines.push(`  Malformed (must start with http:// or https://): ${malformed.join('; ')}`);
  lines.push('  Copy apps/api-gateway/.env.example to apps/api-gateway/.env and set the values.');

  const message = lines.join('\n');
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  Logger.warn(message, 'Bootstrap');
}

async function bootstrap() {
  validateServiceUrls();
  const app = await NestFactory.create(AppModule);
  const defaultLocalCorsOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3010',
    'http://localhost:3011',
    'http://localhost:3020',
    'http://localhost:3030',
    'http://localhost:3031',
    'http://localhost:3032',
    'http://localhost:4000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3010',
    'http://127.0.0.1:3032',
    'http://127.0.0.1:4000',
  ];
  const configuredCorsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigins = Array.from(new Set([...(configuredCorsOrigins ?? []), ...defaultLocalCorsOrigins]));

  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Driver API Gateway')
    .setDescription('Driver app surface')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`API Gateway running on http://localhost:${port}`);
  Logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();

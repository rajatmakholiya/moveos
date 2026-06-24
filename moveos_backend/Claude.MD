# MoveOS / Pahadi Rides — CLAUDE.md

## Stack
NestJS monorepo, Prisma + PostgreSQL, Redis, Supabase hosting.
New frontend: Next.js 14 PWA (App Router, Tailwind, server components).

## What is confirmed working
- apps/api-gateway: JWT auth, role guards, Swagger, Ola Maps proxy routes
- apps/onboarding-service: session, OTP, consents, JWT issuance for DRIVER role
- libs/common: shared Prisma client, Redis client, HTTP client, auth guards

## What exists but is NOT battle-tested — do not modify unless a prompt explicitly says to
- apps/ride-service, apps/dispatch-service, apps/telemetry-service,
  apps/notification-service

## What does not exist yet — this is all new work
- apps/scheduling-service (port 3008)
- apps/booking-service    (port 3009)
- apps/invoice-service    (port 3010)
- apps/whatsapp-service   (port 3011)
- PWA frontend (separate Next.js app in apps/pwa/)

## Domain model (Pahadi Rides layer)
This is NOT urban ride-hail. Driver posts a scheduled trip with seat inventory.
Passengers browse and book seats into it. No dynamic dispatch.
Seat types: FRONT (₹2,500 base) | BACK (₹2,000 base).
Trip flow: OPEN → DEPARTED → COMPLETED | CANCELLED
Booking flow: CONFIRMED → COMPLETED | CANCELLED

## Conventions to follow
- Every service: app.setGlobalPrefix('api'), port from env PORT
- DTOs: class-validator, @IsPhoneNumber() for phones (E.164)
- Internal calls: gateway injects x-driver-id or x-passenger-id from JWT
- Prisma: always use libs/common/src/prisma — never instantiate PrismaClient directly
- Redis: always use libs/common/src/redis
- Money: always stored in paise (integer), never floats
- Env validation: follow the pattern in libs/common/src/config/env.validation.ts
- New service env vars go in apps/{service}/.env.example

## Do not
- Modify prisma/schema.prisma enums that already exist (UserRole, UserStatus etc.)
- Change the auth flow in onboarding-service
- Add dependencies not already in package.json without saying so explicitly
# MoveOS Driver Backend Scaffold

Production-focused NestJS monorepo for the driver-facing side of a ride-sharing platform. Services run independently with clear boundaries and HTTP calls via the API Gateway. Prisma targets PostgreSQL; Redis is used for geospatial + real-time driver state and atomic ride acceptance.

## Apps
- api-gateway (port 3000): REST surface for the driver app, Socket.IO gateway, Swagger docs.
- onboarding-service (3006): Centralized onboarding/profile/consent flow for drivers/admins; issues short-lived onboarding tokens and final JWTs.
- driver-service (3001): Driver profile/status/compliance, earnings + wallet read models.
- ride-service (3002): Ride lifecycle + audit events.
- dispatch-service (3003): Offer creation hooks + accept/reject race using Redis SETNX.
- telemetry-service (3004): Location and heartbeat ingestion, updates Redis GEO/state.
- notification-service (3005): Device token registry + push placeholder.

## Data
- Prisma schema lives at `prisma/schema.prisma` (users, drivers, vehicles, assignments, rides, rideEvents, driverDocuments, vehicleDocuments, payments, walletLedgers).
- Redis wrapper exposes geo add, driver state, active ride, atomic accept, heartbeat tracking.

## Prerequisites
- Node.js 18+
- Docker + Docker Compose

## Setup & Run
1) Install deps and generate Prisma client
```bash
npm install
npm run prisma:generate
```
2) Start infra
```bash
npm run docker:up
```
3) Create per-service env files
```bash
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/driver-service/.env.example apps/driver-service/.env
cp apps/ride-service/.env.example apps/ride-service/.env
cp apps/dispatch-service/.env.example apps/dispatch-service/.env
cp apps/telemetry-service/.env.example apps/telemetry-service/.env
cp apps/notification-service/.env.example apps/notification-service/.env
cp apps/onboarding-service/.env.example apps/onboarding-service/.env
cp apps/location-service/.env.example apps/location-service/.env
```
4) Run services (in separate terminals or with the helper)
```bash
npm run start:dev:all
# or individual
npm run start:dev:driver-service
npm run start:dev:ride-service
npm run start:dev:dispatch-service
npm run start:dev:telemetry-service
npm run start:dev:notification-service
npm run start:dev:onboarding-service
npm run start:dev:location-service
npm run start:dev:api-gateway
```
- Swagger is at `http://localhost:3000/docs`
- Socket.IO namespace: `ws` with rooms `driver:{driverId}` and `ride:{rideId}`.

## Service Contracts (driver-facing)
- Onboarding: `POST /api/onboarding/session`, `POST /api/onboarding/profile`, `POST /api/onboarding/consents`, `GET /api/onboarding/context`, `POST /api/onboarding/complete` (idempotent via `X-Idempotency-Key`, onboarding token auth).
- POST /api/auth/otp/request, /api/auth/otp/verify (OTP stub, returns JWT)
- POST /api/drivers/me/go-online, /go-offline
- GET /api/drivers/me
- POST /api/drivers/me/documents
- GET /api/compliance/me/status
- GET /api/earnings/me/summary
- GET /api/wallet/me/balance
- POST /api/telemetry/location, /api/telemetry/heartbeat
- POST /api/rides/:rideId/accept|reject (dispatch)
- POST /api/rides/:rideId/arrived|start|complete|cancel
- POST /api/notifications/device-token

## Secrets

Every service requires a strong `JWT_SECRET`. Generate one before first run:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set the same value in each service's `.env` file. All services must share the same secret — a token signed by onboarding-service must verify in api-gateway and driver-service.

**Rules:**
- Never commit a real secret to source control.
- Never use `supersecret` or any other placeholder value outside a local dev environment.
- In production the service will **refuse to start** if `JWT_SECRET` is a known-insecure default.
- In development it will log a warning and continue — replace it before deploying.

## Notes
- API Gateway calls downstream services over HTTP (axios via Nest `HttpService`). Base URLs are configured via `DRIVER_SERVICE_URL`, `RIDE_SERVICE_URL`, etc.
- Env validation is enforced via `libs/common/src/config/env.validation.ts`.
- Use `ENV_FILE=...` start scripts to load per-service `.env` automatically.
- Business logic lives in services; controllers stay thin; each app exposes `/api/health`.
- For production hardening, add persistence for OTPs/tokens and tighten ride state transition rules.

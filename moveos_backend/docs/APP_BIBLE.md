# MoveOS Driver Backend App Bible

Last updated: May 12, 2026

This document is the operating guide for the current MoveOS driver backend. It explains the end goal of the application, service architecture, data model, local setup, API contracts, authentication flows, Postman collection usage, and known caveats.

## 1. Product Goal

MoveOS is a driver-facing ride platform backend. The current application is a NestJS monorepo that exposes a single API Gateway for the driver app and splits business responsibilities into dedicated services.

The end-to-end product flow is:

1. A driver starts onboarding from the mobile app.
2. The backend creates a short-lived onboarding session and token.
3. The driver submits profile details and verifies their phone with OTP.
4. The driver records required consents.
5. The backend completes onboarding, creates or links the user and driver profile, and returns JWT auth tokens.
6. The authenticated driver can go online, submit location and heartbeat updates, register a device token, view driver/compliance/wallet data, and progress ride lifecycle actions.
7. Dispatch uses Redis to handle atomic ride offer acceptance.
8. Location APIs proxy Ola Maps capabilities through the API Gateway.

The API Gateway is the external surface. Downstream services are internal boundaries and are called by the gateway over HTTP.

## 2. Repository Map

- `apps/api-gateway`: public REST API, JWT auth, role guards, Swagger docs, Socket.IO gateway, downstream HTTP clients.
- `apps/onboarding-service`: onboarding sessions, OTP issuance/verification, consent capture, final auth token creation.
- `apps/driver-service`: driver profile, online/offline state, compliance, earnings, wallet, document metadata.
- `apps/telemetry-service`: driver location and heartbeat ingestion into Redis.
- `apps/dispatch-service`: offer accept/reject and atomic winner selection using Redis.
- `apps/ride-service`: ride lifecycle transitions and ride audit events.
- `apps/notification-service`: device token registration and push placeholder.
- `apps/location-service`: Ola Maps proxy, caching, geofence and routing integrations.
- `libs/common`: shared auth, config, HTTP client, Prisma, Redis, events, and location DTOs.
- `prisma/schema.prisma`: database schema.
- `postman/full-flow.postman.json`: complete gateway-driven Postman collection.
- `postman/onboarding-service.postman.json`: focused onboarding-service collection.

## 3. Runtime Topology

| Service | Port | Public? | Responsibility |
| --- | ---: | --- | --- |
| API Gateway | `3000` | Yes | Public driver API, auth guards, downstream routing, Swagger, websocket rooms |
| Driver Service | `3001` | Internal | Driver profile/status/compliance/wallet/documents |
| Ride Service | `3002` | Internal | Ride status transitions and ride events |
| Dispatch Service | `3003` | Internal | Accept/reject ride offers, Redis atomic accept |
| Telemetry Service | `3004` | Internal | Location and heartbeat ingestion |
| Notification Service | `3005` | Internal | Device token registration |
| Onboarding Service | `3006` | Internal | Session, OTP, profile, consents, completion |
| Location Service | `3007` | Internal | Ola Maps proxy and cache |

Every app sets `app.setGlobalPrefix('api')`, so service routes are under `/api/...`.

## 4. Infrastructure

### PostgreSQL

Prisma uses PostgreSQL via `DATABASE_URL`. The schema includes users, drivers, vehicles, rides, wallet ledger, onboarding sessions, consents, verification attempts, feature flags, referrals, and idempotency keys.

Local default:

```bash
postgresql://postgres:postgres@localhost:5432/moveos
```

If you are using a local Postgres user instead of Docker, make sure the `moveos` database exists:

```bash
createdb moveos
npx prisma migrate deploy
```

### Redis

Redis is used for:

- Driver state: `driver:{driverId}:state`
- Active ride: `driver:{driverId}:activeRide`
- Driver heartbeat: `driver:{driverId}:heartbeat`
- Driver geolocation: `drivers:geo`
- Atomic ride acceptance: `ride:{rideId}:acceptedBy`

Local default:

```bash
redis://localhost:6379
```

### Docker Compose

The repo includes `docker-compose.yml` for Postgres and Redis:

```bash
npm run docker:up
npm run docker:down
```

If ports `5432` or `6379` are already in use, Docker Compose will fail to bind those ports. Either stop the conflicting services or point `.env` files at the existing Postgres/Redis instances.

## 5. Environment Variables

Shared required values:

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/moveos
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecret
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d
```

API Gateway downstream URLs:

```bash
DRIVER_SERVICE_URL=http://localhost:3001/api
RIDE_SERVICE_URL=http://localhost:3002/api
DISPATCH_SERVICE_URL=http://localhost:3003/api
TELEMETRY_SERVICE_URL=http://localhost:3004/api
NOTIFICATION_SERVICE_URL=http://localhost:3005/api
ONBOARDING_SERVICE_URL=http://localhost:3006/api
LOCATION_SERVICE_URL=http://localhost:3007/api
```

Location service additionally requires:

```bash
OLA_MAPS_API_KEY=your_key_here
OLA_MAPS_BASE_URL=https://api.olamaps.io
LOCATION_CACHE_TTL_SECONDS=300
```

The app validates env values through `libs/common/src/config/env.validation.ts`.

## 6. Local Setup

Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate
```

Create service env files:

```bash
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/driver-service/.env.example apps/driver-service/.env
cp apps/ride-service/.env.example apps/ride-service/.env
cp apps/dispatch-service/.env.example apps/dispatch-service/.env
cp apps/telemetry-service/.env.example apps/telemetry-service/.env
cp apps/notification-service/.env.example apps/notification-service/.env
cp apps/onboarding-service/.env.example apps/onboarding-service/.env
```

Create and migrate database:

```bash
npm run docker:up
npx prisma migrate deploy
```

Run everything:

```bash
npm run start:dev:all
```

Run only the gateway:

```bash
npm run start:dev:api-gateway
```

Run individual services:

```bash
npm run start:dev:driver-service
npm run start:dev:ride-service
npm run start:dev:dispatch-service
npm run start:dev:telemetry-service
npm run start:dev:notification-service
npm run start:dev:onboarding-service
npm run start:dev:location-service
```

Build check:

```bash
npm run build
```

Swagger:

```text
http://localhost:3000/docs
```

## 7. Authentication Model

There are two auth flows in the current backend.

### 7.1 Onboarding Token

Used only during onboarding.

Flow:

1. `POST /api/onboarding/session` returns `onboardingToken`.
2. Send it as `Authorization: Bearer <onboardingToken>` to:
   - `POST /api/onboarding/profile`
   - `POST /api/onboarding/consents`
   - `GET /api/onboarding/context`
   - `POST /api/onboarding/complete`

The onboarding service stores only a SHA-256 hash of the token.

Session rules:

- TTL: 15 minutes.
- Completed sessions cannot be reused.
- Expired sessions are marked `EXPIRED`.

### 7.2 JWT Auth Token

Used after onboarding completion or auth OTP verification.

Send:

```http
Authorization: Bearer <auth_token>
```

Protected gateway endpoints require role `DRIVER`.

JWT payload shape:

```json
{
  "sub": "user_or_driver_id",
  "phone": "+919876543210",
  "role": "DRIVER",
  "driverId": "driver_id_when_available"
}
```

### 7.3 Auth OTP Stub

The API Gateway has a development OTP stub:

- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`

It stores OTPs in memory. Restarting the gateway clears OTPs. Use the returned `devOtpCode` for local testing.

## 8. Postman End-to-End Testing

Primary collection:

```text
postman/full-flow.postman.json
```

Import this into Postman and run requests top-to-bottom.

The collection now:

- Generates a fresh valid Indian E.164 phone number each run.
- Generates a fresh device fingerprint.
- Saves `onboarding_token` from Create Session.
- Saves `onboarding_otp` from Profile request OTP in non-production.
- Uses that OTP in Profile verify OTP.
- Saves `auth_token`, `refresh_token`, `user_id`, and `driver_id` from Complete.
- Uses `auth_token` for protected driver, telemetry, ride, notification, and location requests.
- Includes valid JSON payloads for Location DTO validation.

Important collection variables:

| Variable | Purpose |
| --- | --- |
| `api_gateway` | Base gateway URL, default `http://localhost:3000` |
| `onboarding_token` | Saved from onboarding session |
| `onboarding_otp` | Saved from onboarding OTP request |
| `auth_token` | Saved from onboarding completion or auth OTP verify |
| `refresh_token` | Saved with auth token |
| `driver_id` | Saved from onboarding completion or auth OTP |
| `driver_phone` | Generated before Create Session |
| `ride_id` | Must point at an existing `Ride` row for ride-service lifecycle endpoints |
| `lat`, `lng` | Coordinates for context, telemetry, and location APIs |
| `project_id` | Ola geofence project ID |
| `place_id` | Ola place details ID |
| `photo_reference` | Ola photo reference |

Known Postman caveats:

- Ride lifecycle endpoints need an existing `Ride` row because there is no public create-ride endpoint in this backend.
- Location endpoints need `location-service` running with a valid `OLA_MAPS_API_KEY`.
- Onboarding OTP exposes `devOtpCode` only when `NODE_ENV !== production`.

## 9. Gateway API Reference

All endpoints below are called through:

```text
{{api_gateway}} = http://localhost:3000
```

### 9.1 Health

#### `GET /api/health`

Checks gateway process health.

Expected response:

```json
{
  "status": "ok"
}
```

## 10. Onboarding APIs

Gateway controller: `apps/api-gateway/src/controllers/onboarding.controller.ts`

Downstream service: `apps/onboarding-service`

### 10.1 Create Session

```http
POST /api/onboarding/session
Content-Type: application/json
```

Optional idempotency header:

```http
X-Idempotency-Key: {{$randomUUID}}
```

Request:

```json
{
  "deviceFingerprint": "device-fp-123",
  "referralCode": "MOVEOS-DEMO",
  "appVersion": "1.0.0",
  "locale": "en-IN",
  "timezone": "Asia/Kolkata",
  "deviceModel": "Postman Desktop",
  "osVersion": "macOS",
  "role": "DRIVER"
}
```

Validation:

- `deviceFingerprint`: required string.
- `role`: optional enum, one of `DRIVER`, `ADMIN`, `RIDER`.
- Other fields are optional strings.

Response:

```json
{
  "status": "ok",
  "data": {
    "sessionId": "cmp1nms0g0000i8tydlfchuxi",
    "onboardingToken": "eda7089dd3ef5620791e1074727d7312bc0b8a6ff99aa2c3",
    "expiresIn": 900,
    "flags": {
      "enableLocationNudge": true,
      "enableWalletPrompt": false
    },
    "role": "DRIVER"
  }
}
```

Side effects:

- Creates `OnboardingSession`.
- Stores token hash, feature flags, TTL, device data, locale/timezone.

### 10.2 Profile - Request OTP

```http
POST /api/onboarding/profile
Authorization: Bearer <onboardingToken>
Content-Type: application/json
```

Request:

```json
{
  "name": "Driver One",
  "phone": "+919876543210",
  "email": "driver.one@example.com",
  "resend": true,
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Validation:

- `name`: required string.
- `phone`: required valid international phone number.
- `email`: optional string.
- `otp`: optional string.
- `resend`: optional boolean.

Behavior:

- If `resend` is true or `otp` is missing, the service issues an OTP.
- OTP send rate limit: 5 sends per hour per phone/device.
- OTP TTL: 10 minutes.

Response in development:

```json
{
  "status": "pending_otp",
  "data": {
    "otpExpiresIn": 599,
    "nextHint": "verify_phone",
    "devOtpCode": "123456"
  }
}
```

In production, `devOtpCode` is omitted.

### 10.3 Profile - Verify OTP

```http
POST /api/onboarding/profile
Authorization: Bearer <onboardingToken>
Content-Type: application/json
```

Request:

```json
{
  "name": "Driver One",
  "phone": "+919876543210",
  "email": "driver.one@example.com",
  "otp": "123456",
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Behavior:

- Verifies OTP hash against the active onboarding session.
- Rejects expired OTP.
- Rejects phone mismatch.
- Verification attempt rate limit: 3 attempts per 10 minutes.
- Creates or updates `User`.
- Links `OnboardingSession.userId`.

Response:

```json
{
  "status": "ok",
  "data": {
    "userId": "user_id",
    "phoneVerified": true,
    "emailVerified": true,
    "nextHint": "collect_consents",
    "role": "DRIVER"
  }
}
```

### 10.4 Consents

```http
POST /api/onboarding/consents
Authorization: Bearer <onboardingToken>
Content-Type: application/json
```

Request:

```json
{
  "locationPermission": "granted",
  "notificationsOptIn": true,
  "marketingOptIn": true,
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Validation:

- `locationPermission`: `granted`, `denied`, or `limited`.
- `notificationsOptIn`: boolean.
- `marketingOptIn`: boolean.
- `timestampOverride`: optional ISO 8601 string.

Response:

```json
{
  "status": "ok",
  "data": {
    "locationPermission": "granted",
    "notificationsOptIn": true,
    "marketingOptIn": true,
    "timestamps": {
      "recordedAt": "2026-05-11T20:28:48.000Z"
    },
    "nextHint": "ready_to_complete"
  }
}
```

Side effects:

- Creates three `OnboardingConsent` rows: location, notifications, marketing.

### 10.5 Context

```http
GET /api/onboarding/context?lat=12.9716&lng=77.5946
Authorization: Bearer <onboardingToken>
```

Response:

```json
{
  "status": "ok",
  "data": {
    "pickupHints": [
      {
        "label": "Nearest pickup",
        "lat": 12.9716,
        "lng": 77.5946
      }
    ],
    "topDestinations": [
      {
        "label": "Home",
        "lat": 12.9716,
        "lng": 77.5946
      }
    ],
    "schemes": [
      {
        "id": "cashback_5",
        "title": "5% cashback on wallet reloads",
        "expiresInHours": 48
      }
    ],
    "featureFlags": {
      "enableLocationNudge": true,
      "enableWalletPrompt": false
    },
    "cacheTtl": 30
  }
}
```

### 10.6 Complete Onboarding

```http
POST /api/onboarding/complete
Authorization: Bearer <onboardingToken>
```

Preconditions:

- Phone OTP verified.
- Session has a phone.
- Location, notifications, and marketing consents exist.

Behavior:

- Ensures or creates `User`.
- Marks user `ACTIVE`.
- For driver role, upserts `Driver`.
- Signs access and refresh JWTs.
- Marks onboarding session `COMPLETED`.

Response:

```json
{
  "status": "ok",
  "data": {
    "authToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "userId": "user_id",
    "driverId": "driver_id",
    "userStatus": "ACTIVE",
    "nextHint": "load_wallet"
  }
}
```

## 11. Auth OTP APIs

Gateway-only development auth stub.

### 11.1 Request OTP

```http
POST /api/auth/otp/request
Content-Type: application/json
```

Request:

```json
{
  "phone": "+919876543210"
}
```

Response:

```json
{
  "devOtpCode": "123456",
  "driverId": "drv_1715450000000"
}
```

### 11.2 Verify OTP

```http
POST /api/auth/otp/verify
Content-Type: application/json
```

Request:

```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

Response:

```json
{
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "driverId": "drv_1715450000000",
  "role": "DRIVER"
}
```

## 12. Driver APIs

All driver endpoints require:

```http
Authorization: Bearer <authToken>
```

The JWT must contain role `DRIVER`.

Gateway controller: `apps/api-gateway/src/controllers/drivers.controller.ts`

Downstream service: `apps/driver-service`

### 12.1 Go Online

```http
POST /api/drivers/me/go-online
```

Behavior:

- Resolves driver ID from JWT.
- Ensures driver exists. In local development, the driver service can bootstrap a placeholder user/driver if missing.
- Updates driver status to `ONLINE`.
- Writes Redis key `driver:{driverId}:state = ONLINE`.

Response:

```json
{
  "driverId": "driver_id",
  "status": "ONLINE"
}
```

### 12.2 Go Offline

```http
POST /api/drivers/me/go-offline
```

Behavior:

- Updates driver status to `OFFLINE`.
- Writes Redis state.
- Clears active ride key.

Response:

```json
{
  "driverId": "driver_id",
  "status": "OFFLINE"
}
```

### 12.3 Driver Profile

```http
GET /api/drivers/me
```

Response includes driver, user, and vehicle assignments:

```json
{
  "id": "driver_id",
  "userId": "user_id",
  "name": "Driver One",
  "rating": 5,
  "kycStatus": "PENDING",
  "complianceStatus": "CLEAR",
  "status": "ONLINE",
  "user": {
    "id": "user_id",
    "phone": "+919876543210",
    "role": "DRIVER",
    "status": "ACTIVE"
  },
  "vehicles": []
}
```

### 12.4 Compliance Status

```http
GET /api/compliance/me/status
```

Response:

```json
{
  "driverId": "driver_id",
  "kycStatus": "PENDING",
  "complianceStatus": "CLEAR"
}
```

### 12.5 Earnings Summary

```http
GET /api/earnings/me/summary
```

Response:

```json
{
  "driverId": "driver_id",
  "totalEarnings": 0
}
```

Calculation:

```text
sum(wallet credits) - sum(wallet debits)
```

### 12.6 Wallet Balance

```http
GET /api/wallet/me/balance
```

Response:

```json
{
  "driverId": "driver_id",
  "balance": 0
}
```

### 12.7 Create Document Placeholder

```http
POST /api/drivers/me/documents
Content-Type: application/json
```

Request:

```json
{
  "type": "license"
}
```

Response:

```json
{
  "document": {
    "id": "document_id",
    "driverId": "driver_id",
    "type": "license",
    "status": "PENDING",
    "url": "https://signed-upload.example/driver/driver_id/license"
  },
  "uploadUrl": "https://signed-upload.example/driver/driver_id/license"
}
```

## 13. Telemetry APIs

All telemetry endpoints require driver JWT auth.

Gateway controller: `apps/api-gateway/src/controllers/telemetry.controller.ts`

Downstream service: `apps/telemetry-service`

### 13.1 Send Location

```http
POST /api/telemetry/location
Authorization: Bearer <authToken>
Content-Type: application/json
```

Request:

```json
{
  "lat": 12.9716,
  "lng": 77.5946
}
```

Behavior:

- Gateway injects `driverId` from JWT.
- Telemetry service writes Redis GEO entry.
- Sets driver state to `ONLINE`.
- Emits `driver.location.updated` internal event.

Response:

```json
{
  "driverId": "driver_id",
  "lat": 12.9716,
  "lng": 77.5946
}
```

### 13.2 Heartbeat

```http
POST /api/telemetry/heartbeat
Authorization: Bearer <authToken>
```

The gateway ignores request body and injects `driverId`.

Response:

```json
{
  "driverId": "driver_id",
  "lastSeenAt": "2026-05-11T20:28:48.000Z"
}
```

## 14. Dispatch and Ride APIs

All ride endpoints require driver JWT auth.

Gateway controller: `apps/api-gateway/src/controllers/rides.controller.ts`

Downstream services:

- Accept/reject: `apps/dispatch-service`
- Arrived/start/complete/cancel: `apps/ride-service`

Important limitation:

- The current backend does not expose a create-ride API.
- `:rideId` must already exist in the `Ride` table for ride-service lifecycle endpoints.
- Dispatch accept/reject does not require a DB ride row; it uses Redis.

### 14.1 Accept Offer

```http
POST /api/rides/:rideId/accept
Authorization: Bearer <authToken>
```

Behavior:

- Gateway injects `driverId`.
- Dispatch service calls Redis `SET ride:{rideId}:acceptedBy <driverId> NX`.
- First accept wins.

Response:

```json
{
  "rideId": "ride_id",
  "driverId": "driver_id",
  "winner": true
}
```

### 14.2 Reject Offer

```http
POST /api/rides/:rideId/reject
Authorization: Bearer <authToken>
```

Response:

```json
{
  "rideId": "ride_id",
  "driverId": "driver_id"
}
```

### 14.3 Arrived

```http
POST /api/rides/:rideId/arrived
Authorization: Bearer <authToken>
```

Behavior:

- Finds ride.
- Updates status to `ARRIVED`.
- Sets `driverId` if not already assigned.
- Creates `RideEvent` with type `ride.arrived`.
- Sets Redis active ride for the driver.

Response: updated `Ride`.

### 14.4 Start

```http
POST /api/rides/:rideId/start
Authorization: Bearer <authToken>
Content-Type: application/json
```

Request:

```json
{
  "riderOtp": "1234"
}
```

Behavior:

- Requires `riderOtp` length 4 to 6.
- Updates status to `STARTED`.
- Sets `startedAt`.
- Creates `RideEvent` with type `ride.started`.
- Sets Redis active ride.

Response: updated `Ride`.

### 14.5 Complete

```http
POST /api/rides/:rideId/complete
Authorization: Bearer <authToken>
```

Behavior:

- Updates status to `COMPLETED`.
- Sets `completedAt`.
- Creates `RideEvent` with type `ride.completed`.
- Clears Redis active ride.

Response: updated `Ride`.

### 14.6 Cancel

```http
POST /api/rides/:rideId/cancel
Authorization: Bearer <authToken>
Content-Type: application/json
```

Request:

```json
{
  "reason": "rider no-show"
}
```

Behavior:

- Updates status to `CANCELLED`.
- Sets `cancelledAt`.
- Creates `RideEvent` with type `ride.cancelled`.

Response: updated `Ride`.

## 15. Notification API

Requires driver JWT auth.

Gateway controller: `apps/api-gateway/src/controllers/notifications.controller.ts`

Downstream service: `apps/notification-service`

### 15.1 Register Device Token

```http
POST /api/notifications/device-token
Authorization: Bearer <authToken>
Content-Type: application/json
```

Request:

```json
{
  "token": "postman-device-token-123"
}
```

Gateway injects `driverId`.

Response:

```json
{
  "driverId": "driver_id",
  "token": "postman-device-token-123",
  "status": "registered"
}
```

Current implementation stores tokens in memory only.

## 16. Location APIs

Requires driver JWT auth at the gateway.

Gateway controller: `apps/api-gateway/src/controllers/location.controller.ts`

Downstream service: `apps/location-service`

The location service requires `OLA_MAPS_API_KEY`. It caches successful responses through `LocationCacheService` and deduplicates concurrent identical requests in memory.

Coordinate shape:

```json
{
  "lat": 12.9716,
  "lng": 77.5946
}
```

### 16.1 Directions

```http
POST /api/location/directions
```

Request:

```json
{
  "origin": { "lat": 12.9716, "lng": 77.5946 },
  "destination": { "lat": 12.9752, "lng": 77.6245 },
  "waypoints": [{ "lat": 12.9721, "lng": 77.5961 }],
  "mode": "driving",
  "alternatives": false,
  "steps": true,
  "overview": "full",
  "language": "en",
  "trafficMetadata": false,
  "routePreference": "fastest",
  "basic": true
}
```

Enums:

- `mode`: `driving`, `walking`, `bike`, `auto`
- `routePreference`: `fastest`, `shortest`
- `overview`: `full`, `simplified`, `false`

### 16.2 Distance Matrix

```http
POST /api/location/distance-matrix
```

Request:

```json
{
  "origins": [{ "lat": 12.9716, "lng": 77.5946 }],
  "destinations": [{ "lat": 12.9752, "lng": 77.6245 }],
  "mode": "driving",
  "routePreference": "fastest",
  "basic": true
}
```

### 16.3 Route Optimizer

```http
POST /api/location/route-optimizer
```

Request:

```json
{
  "locations": [
    { "lat": 12.9716, "lng": 77.5946 },
    { "lat": 12.9752, "lng": 77.6245 },
    { "lat": 12.9352, "lng": 77.6245 }
  ],
  "source": "first",
  "destination": "last",
  "roundTrip": false,
  "mode": "driving",
  "steps": true,
  "overview": "full",
  "language": "en",
  "trafficMetadata": false,
  "routePreference": "fastest"
}
```

Validation:

- `locations`: 2 to 25 coordinates.
- `source`: `first` or `any`.
- `destination`: `last` or `any`.

### 16.4 Fleet Planner

```http
POST /api/location/fleet-planner
```

Request:

```json
{
  "strategy": "optimal",
  "routePreference": "fastest",
  "input": {
    "vehicles": [
      {
        "id": "vehicle-1",
        "start": [77.5946, 12.9716],
        "capacity": [4]
      }
    ],
    "jobs": [
      {
        "id": 1,
        "location": [77.6245, 12.9752],
        "delivery": [1]
      }
    ]
  },
  "inputFilename": "postman-demo.json"
}
```

Enums:

- `strategy`: `optimal`, `fair`

### 16.5 Snap To Road

```http
POST /api/location/snap-to-road
```

Request:

```json
{
  "points": [
    { "lat": 12.9716, "lng": 77.5946 },
    { "lat": 12.9721, "lng": 77.5961 }
  ],
  "enhancePath": false
}
```

Validation:

- `points`: 1 to 50 coordinates.

### 16.6 Nearest Roads

```http
POST /api/location/nearest-roads
```

Request:

```json
{
  "mode": "DRIVING",
  "points": [{ "lat": 12.9716, "lng": 77.5946 }],
  "radius": 100
}
```

Enums:

- `mode`: `DRIVING`, `WALKING`, `BICYCLING`, `TRANSIT`

### 16.7 Speed Limits

```http
POST /api/location/speed-limits
```

Request:

```json
{
  "points": [
    { "lat": 12.9716, "lng": 77.5946 },
    { "lat": 12.9721, "lng": 77.5961 }
  ],
  "snapStrategy": "snaptoroad"
}
```

Enums:

- `snapStrategy`: `snaptoroad`, `nearestroad`

### 16.8 Places Autocomplete

```http
POST /api/location/places/autocomplete
```

Request:

```json
{
  "input": "Kempegowda airport",
  "location": { "lat": 12.9716, "lng": 77.5946 },
  "radius": 5000,
  "strictbounds": false,
  "language": "en"
}
```

### 16.9 Place Details

```http
POST /api/location/places/details
```

Request:

```json
{
  "placeId": "ChIJbU60yXAWrjsR4E9-UejD3_g",
  "language": "en"
}
```

### 16.10 Place Details Advanced

```http
POST /api/location/places/details-advanced
```

Request:

```json
{
  "placeId": "ChIJbU60yXAWrjsR4E9-UejD3_g",
  "language": "en"
}
```

### 16.11 Nearby Search

```http
POST /api/location/places/nearby
```

Request:

```json
{
  "location": { "lat": 12.9716, "lng": 77.5946 },
  "types": "fuel_station",
  "language": "en",
  "radius": 1000,
  "withCentroid": false,
  "rankBy": "popular",
  "limit": 5
}
```

Enums:

- `rankBy`: `popular`, `distance`
- `limit`: minimum 5, maximum 50

### 16.12 Nearby Search Advanced

```http
POST /api/location/places/nearby-advanced
```

Request is the same shape as Nearby Search.

### 16.13 Text Search

```http
POST /api/location/places/text-search
```

Request:

```json
{
  "input": "airport bangalore",
  "location": { "lat": 12.9716, "lng": 77.5946 },
  "radius": 5000,
  "types": "airport",
  "size": 5,
  "language": "en"
}
```

### 16.14 Address Validation

```http
POST /api/location/places/address-validation
```

Request:

```json
{
  "address": "12 MG Road, Bengaluru, Karnataka, India"
}
```

### 16.15 Place Photo

```http
POST /api/location/places/photo
```

Request:

```json
{
  "photoReference": "photo_reference",
  "maxWidth": 400,
  "maxHeight": 300
}
```

If Ola returns binary data, the service returns base64:

```json
{
  "data": "base64_encoded_image"
}
```

### 16.16 Geocode

```http
POST /api/location/geocode
```

Request:

```json
{
  "address": "MG Road Bengaluru Karnataka India",
  "language": "English"
}
```

### 16.17 Reverse Geocode

```http
POST /api/location/reverse-geocode
```

Request:

```json
{
  "latlng": { "lat": 12.9716, "lng": 77.5946 },
  "language": "en"
}
```

### 16.18 Create Geofence

```http
POST /api/location/geofence
```

Request:

```json
{
  "name": "Postman Demo Geofence",
  "type": "circle",
  "status": "active",
  "projectId": "moveos-postman-demo",
  "coordinates": [[77.5946, 12.9716]],
  "radius": 200
}
```

Enums:

- `type`: `polygon`, `circle`
- `status`: `active`, `inactive`

### 16.19 Update Geofence

```http
PUT /api/location/geofence/:id
```

Request shape is the same as Create Geofence.

### 16.20 Get Geofence

```http
GET /api/location/geofence/:id
```

### 16.21 Delete Geofence

```http
DELETE /api/location/geofence/:id
```

### 16.22 List Geofences

```http
POST /api/location/geofences
```

Request:

```json
{
  "page": 1,
  "size": 10,
  "projectId": "moveos-postman-demo"
}
```

### 16.23 Geofence Status

```http
POST /api/location/geofence/status
```

Request:

```json
{
  "geofenceId": "geofence_id",
  "coordinates": { "lat": 12.9716, "lng": 77.5946 }
}
```

## 17. Internal Service Contracts

These routes are normally called by the API Gateway, not directly by clients.

### 17.1 Driver Service

Base URL:

```text
http://localhost:3001/api
```

Routes:

- `POST /drivers/go-online` with `{ "driverId": "driver_id" }`
- `POST /drivers/go-offline` with `{ "driverId": "driver_id" }`
- `GET /drivers/:driverId`
- `GET /drivers/:driverId/compliance`
- `GET /drivers/:driverId/earnings`
- `GET /drivers/:driverId/wallet`
- `POST /drivers/:driverId/documents` with `{ "type": "license" }`

### 17.2 Telemetry Service

Base URL:

```text
http://localhost:3004/api
```

Routes:

- `POST /telemetry/location` with `{ "driverId": "driver_id", "lat": 12.9716, "lng": 77.5946 }`
- `POST /telemetry/heartbeat` with `{ "driverId": "driver_id" }`

### 17.3 Dispatch Service

Base URL:

```text
http://localhost:3003/api
```

Routes:

- `POST /dispatch/rides/:rideId/accept` with `{ "driverId": "driver_id" }`
- `POST /dispatch/rides/:rideId/reject` with `{ "driverId": "driver_id" }`

### 17.4 Ride Service

Base URL:

```text
http://localhost:3002/api
```

Routes:

- `POST /rides/:rideId/arrived` with `{ "driverId": "driver_id" }`
- `POST /rides/:rideId/start` with `{ "driverId": "driver_id", "riderOtp": "1234" }`
- `POST /rides/:rideId/complete` with `{ "driverId": "driver_id" }`
- `POST /rides/:rideId/cancel` with `{ "driverId": "driver_id", "reason": "rider no-show" }`

### 17.5 Notification Service

Base URL:

```text
http://localhost:3005/api
```

Routes:

- `POST /notifications/device-token` with `{ "driverId": "driver_id", "token": "device-token" }`

### 17.6 Onboarding Service

Base URL:

```text
http://localhost:3006/api
```

Routes mirror the gateway onboarding routes:

- `POST /onboarding/session`
- `POST /onboarding/profile`
- `POST /onboarding/consents`
- `GET /onboarding/context`
- `POST /onboarding/complete`

### 17.7 Location Service

Base URL:

```text
http://localhost:3007/api
```

Routes mirror gateway `/api/location/...`.

## 18. WebSocket Gateway

The API Gateway includes a Socket.IO gateway.

Connection query params:

- `driverId`: joins room `driver:{driverId}`
- `rideId`: joins room `ride:{rideId}`

Client event:

```text
joinRide
```

Payload:

```json
{
  "rideId": "ride_id"
}
```

Server emits:

- `ride.offer`
- `ride.status.updated`

Room patterns:

- Driver room: `driver:{driverId}`
- Ride room: `ride:{rideId}`

## 19. Data Model Summary

Important Prisma models:

- `User`: phone, role, name, email, user status.
- `Driver`: linked to user, status, KYC/compliance, rating.
- `Vehicle`: plate, type, compliance/status.
- `DriverVehicleAssignment`: active driver-vehicle relation.
- `Ride`: rider, driver, vehicle, status, pickup/drop/pricing JSON, lifecycle timestamps.
- `RideEvent`: append-only ride audit event.
- `Payment`: ride payment status and method.
- `WalletLedger`: driver/rider wallet credits and debits.
- `DriverDocument` and `VehicleDocument`: document metadata.
- `OnboardingSession`: token hash, device fingerprint, OTP state, phone/profile data, status, feature flags.
- `OnboardingConsent`: location/notification/marketing consent records.
- `VerificationAttempt`: OTP send/verify rate-limit audit.
- `IdempotencyKey`: idempotent onboarding request replay storage.
- `FeatureFlagAssignment`: future user/device feature flag assignment.
- `Referral`: referral code tracking.

Important enums:

- `UserRole`: `DRIVER`, `ADMIN`, `RIDER`
- `UserStatus`: `PENDING`, `ACTIVE`, `INACTIVE`
- `DriverStatus`: `OFFLINE`, `ONLINE`, `BUSY`
- `RideStatus`: `REQUESTED`, `OFFERED`, `ACCEPTED`, `ARRIVED`, `STARTED`, `COMPLETED`, `CANCELLED`
- `OnboardingSessionStatus`: `ACTIVE`, `COMPLETED`, `EXPIRED`
- `VerificationAttemptType`: `SEND`, `VERIFY`

## 20. Idempotency

Onboarding controller supports `X-Idempotency-Key` on:

- `POST /api/onboarding/session`
- `POST /api/onboarding/profile`
- `POST /api/onboarding/consents`
- `POST /api/onboarding/complete`

If a matching key exists, the previous response is replayed.

Current storage:

- PostgreSQL table `IdempotencyKey`
- Stored fields: key, method, path, status code, response JSON, createdAt

Important testing note:

- The full-flow Postman collection has idempotency headers disabled by default so repeated manual testing creates fresh state.

## 21. Error Patterns

Common errors:

- `401 Missing onboarding token`: protected onboarding call without `Authorization`.
- `401 Invalid onboarding token`: token hash not found.
- `401 Onboarding session expired`: session TTL passed.
- `400 OTP not requested`: verify called before request OTP.
- `400 OTP expired`: OTP TTL passed.
- `400 Invalid OTP`: wrong OTP.
- `400 Too many attempts`: rate limit exceeded.
- `409 Phone mismatch`: verify phone differs from OTP-request phone.
- `409 Phone already registered under another role`: same phone exists with a different role.
- `404 Driver not found`: driver profile/status requested for missing driver, unless local bootstrap path creates it.
- `404 Ride not found`: ride lifecycle endpoint called with non-existent ride ID.
- `500 OLA_MAPS_API_KEY is required`: location service started without required key.

## 22. Current Changes Captured in This Bible

Recent important corrections:

- Replaced unsupported `@IsPhoneNumber('ZZ')` with `@IsPhoneNumber()` in API Gateway DTOs.
- Phone values now need international E.164 format, for example `+919876543210`.
- Fixed `postman/full-flow.postman.json` so it can run top-to-bottom:
  - dynamic valid phone and device fingerprint generation,
  - saved onboarding token and OTP,
  - saved auth token, refresh token, user ID, driver ID,
  - valid telemetry heartbeat payload,
  - valid Location DTO payload shapes,
  - geofence request payloads with required fields.
- Confirmed onboarding session creation works once the `moveos` database exists and migrations are applied.

## 23. Known Gaps and Next Steps

Current known product/backend gaps:

- No public create-ride endpoint. Ride lifecycle tests require pre-seeded `Ride` rows.
- Auth OTP stub stores OTP in memory. Use persistent OTP storage before production.
- Notification tokens are stored in memory. Use a persistent device-token table before production.
- Push delivery is a placeholder.
- Driver-service local bootstrap creates placeholder user/driver for missing IDs; production should remove or restrict that behavior.
- Ride transition rules are permissive. Production should validate legal status transitions.
- Location service depends on external Ola Maps API availability and credentials.
- No automated test suite is currently configured beyond `npm run build`.

## 24. Recommended End-to-End Smoke Test

Run all core services:

```bash
npm run start:dev:all
```

In Postman:

1. Import `postman/full-flow.postman.json`.
2. Confirm `api_gateway = http://localhost:3000`.
3. Run the Onboarding folder top-to-bottom.
4. Run Driver folder.
5. Run Telemetry folder.
6. Run Notifications folder.
7. Run Location folder only if `location-service` has `OLA_MAPS_API_KEY`.
8. Run Ride folder only after setting `ride_id` to an existing row in the `Ride` table.

Minimal successful backend smoke path:

1. `POST /api/onboarding/session`
2. `POST /api/onboarding/profile` without OTP
3. `POST /api/onboarding/profile` with returned `devOtpCode`
4. `POST /api/onboarding/consents`
5. `GET /api/onboarding/context`
6. `POST /api/onboarding/complete`
7. `POST /api/drivers/me/go-online`
8. `POST /api/telemetry/location`
9. `POST /api/telemetry/heartbeat`
10. `POST /api/notifications/device-token`


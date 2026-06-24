# MoveOS / Pahadi Rides Frontend API Binding

Last updated: May 12, 2026

This document is the frontend binding contract for the current API Gateway. Frontend clients should call the API Gateway only:

```text
http://localhost:3000/api
```

Downstream services are internal implementation details unless a backend engineer is testing them directly.

## 1. E2E Readiness

The backend is not yet ready for a clean full end-to-end Pahadi Rides app test from a fresh checkout.

What is testable now:

- Driver onboarding through the gateway.
- Passenger onboarding through the gateway if the database schema has the latest passenger changes applied.
- Public route listing and trip search.
- Booking creation, lookup, passenger booking list, payment confirm, and cancel through the gateway.
- Existing driver status, telemetry, notifications, ride dispatch/lifecycle, and location proxy APIs.

What is missing or blocking:

- `npm run build` currently fails. Current blockers are strict DTO property initialization errors, one Redis `set(..., 'NX', 'EX', 30)` typing error, and a Razorpay order amount typing issue.
- `prisma/schema.prisma` includes `PASSENGER`, `Passenger`, and passenger booking relations, but the current `20260512125724_pahadi_rides` migration does not include all of those schema changes. A fresh DB migration needs to be amended or regenerated before reliable E2E testing.
- `npm run start:dev:all` does not start `scheduling-service` or `booking-service`; start them separately for Pahadi flows.
- There is no frontend/gateway endpoint to create routes. Routes must be seeded directly in DB or an admin route-management API must be added.
- There is no gateway endpoint for driver trip creation, driver trips, trip cancellation, or manifest. The scheduling service has internal endpoints for those, but the gateway only exposes public trip read/search.
- Passenger auth is only available via onboarding with `role: "PASSENGER"`. The gateway dev OTP stub still issues only `DRIVER` tokens.
- The `passenger/*` gateway routes require role `PASSENGER`, but the generic `bookings/*` routes accept any valid JWT and infer `passengerId` from `passengerId`, `agentId`, or `sub`.
- Booking service requires `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` at startup even when testing `CASH` bookings.
- Invoice PDF generation exists as an injectable service, but there is no HTTP endpoint yet to download an invoice.
- Notification device tokens are in-memory only.
- Ride lifecycle still needs pre-seeded `Ride` rows; there is no public create-ride endpoint.
- Location APIs require `location-service` with a valid `OLA_MAPS_API_KEY`.

Minimum backend steps before a full frontend smoke test:

1. Fix TypeScript build blockers.
2. Amend/regenerate Prisma migrations and run them.
3. Seed at least one active `Route`.
4. Create a driver through onboarding or seed one.
5. Expose gateway driver scheduling endpoints or create trips via the internal scheduling service.
6. Start gateway, onboarding, driver, scheduling, booking, Redis, and Postgres.
7. Add Razorpay test credentials to `apps/booking-service/.env`.

## 2. Runtime Services

| Service | Local URL | Required for |
| --- | --- | --- |
| API Gateway | `http://localhost:3000/api` | All frontend calls |
| Driver Service | `http://localhost:3001/api` | Driver profile/status |
| Ride Service | `http://localhost:3002/api` | Ride lifecycle |
| Dispatch Service | `http://localhost:3003/api` | Ride offer accept/reject |
| Telemetry Service | `http://localhost:3004/api` | Location and heartbeat |
| Notification Service | `http://localhost:3005/api` | Device token registration |
| Onboarding Service | `http://localhost:3006/api` | Driver/passenger onboarding |
| Location Service | `http://localhost:3007/api` | Maps/location proxy |
| Scheduling Service | `http://localhost:3008/api` | Routes/trips |
| Booking Service | `http://localhost:3009/api` | Seat bookings/payments |

For Pahadi passenger booking flows, run:

```bash
npm run start:dev:api-gateway
npm run start:dev:onboarding-service
npm run start:dev:scheduling-service
npm run start:dev:booking-service
npm run start:dev:driver-service
```

Run Redis/Postgres before services:

```bash
npm run docker:up
npx prisma migrate deploy
npx prisma generate
```

## 3. Auth Model

### 3.1 Onboarding Token

Used only during onboarding.

Send:

```http
Authorization: Bearer <onboardingToken>
```

### 3.2 App JWT

Used after onboarding completion.

Send:

```http
Authorization: Bearer <authToken>
```

Expected payloads:

Driver:

```json
{
  "sub": "user_id",
  "phone": "+919876543210",
  "role": "DRIVER",
  "driverId": "driver_id"
}
```

Passenger:

```json
{
  "sub": "user_id",
  "phone": "+919876543211",
  "role": "PASSENGER",
  "passengerId": "passenger_id"
}
```

## 4. Shared Frontend Types

```ts
type UserRole = 'DRIVER' | 'ADMIN' | 'RIDER' | 'PASSENGER';
type SeatType = 'FRONT' | 'BACK';
type LuggageSize = 'SMALL' | 'LARGE' | 'OVERSIZED';
type PaymentMethod = 'UPI' | 'CASH' | 'CARD' | 'WALLET';
type PaymentStatus = 'INITIATED' | 'AUTHORIZED' | 'SETTLED' | 'FAILED' | 'PENDING' | 'PAID' | 'REFUNDED';
type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
type TripStatus = 'DRAFT' | 'OPEN' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
```

Amounts are stored and returned in paise. The frontend should format `123400` as `₹1,234`.

## 5. Health

### `GET /health`

Response:

```json
{
  "status": "ok"
}
```

## 6. Onboarding APIs

### `POST /onboarding/session`

Creates a short-lived onboarding session.

Body:

```json
{
  "deviceFingerprint": "web-device-123",
  "role": "PASSENGER",
  "appVersion": "1.0.0",
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Use `role: "DRIVER"` for driver onboarding.

Response:

```json
{
  "status": "ok",
  "data": {
    "sessionId": "session_id",
    "onboardingToken": "token",
    "expiresIn": 900,
    "flags": {
      "enableLocationNudge": true,
      "enableWalletPrompt": false
    },
    "role": "PASSENGER"
  }
}
```

### `POST /onboarding/profile`

Requests or verifies OTP.

Headers:

```http
Authorization: Bearer <onboardingToken>
```

Request OTP body:

```json
{
  "name": "Passenger One",
  "phone": "+919876543211",
  "email": "passenger.one@example.com",
  "resend": true,
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Development response:

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

Verify OTP body:

```json
{
  "name": "Passenger One",
  "phone": "+919876543211",
  "email": "passenger.one@example.com",
  "otp": "123456",
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

Response:

```json
{
  "status": "ok",
  "data": {
    "userId": "user_id",
    "phoneVerified": true,
    "emailVerified": true,
    "nextHint": "ready_to_complete",
    "role": "PASSENGER"
  }
}
```

For `DRIVER`, `nextHint` is `collect_consents`.

### `POST /onboarding/consents`

Required for driver onboarding. Passenger onboarding currently skips this requirement.

Headers:

```http
Authorization: Bearer <onboardingToken>
```

Body:

```json
{
  "locationPermission": "granted",
  "notificationsOptIn": true,
  "marketingOptIn": false,
  "locale": "en-IN",
  "timezone": "Asia/Kolkata"
}
```

### `GET /onboarding/context?lat=29.5829&lng=80.2182`

Headers:

```http
Authorization: Bearer <onboardingToken>
```

Returns feature flags, pickup hints, destinations, and scheme hints.

### `POST /onboarding/complete`

Headers:

```http
Authorization: Bearer <onboardingToken>
```

Passenger response:

```json
{
  "status": "ok",
  "data": {
    "authToken": "jwt",
    "refreshToken": "jwt",
    "userId": "user_id",
    "driverId": null,
    "passengerId": "passenger_id",
    "userStatus": "ACTIVE",
    "nextHint": "browse_trips"
  }
}
```

Driver response includes `driverId` and `nextHint` such as `load_wallet`.

## 7. Development Driver Auth Stub

This is driver-only and in-memory. Do not use it for passenger flows.

### `POST /auth/otp/request`

Body:

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

### `POST /auth/otp/verify`

Body:

```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "driverId": "drv_1715450000000",
  "role": "DRIVER"
}
```

## 8. Pahadi Public Route and Trip APIs

### `GET /routes`

Public. Lists active Pahadi routes.

Response:

```json
[
  {
    "id": "route_id",
    "name": "Pithoragarh \u2192 Dehradun",
    "originLabel": "Pithoragarh",
    "destinationLabel": "Dehradun",
    "distanceKm": 450,
    "estimatedHours": 12,
    "isActive": true,
    "baseFrontPrice": 180000,
    "baseBackPrice": 140000,
    "createdAt": "2026-05-12T07:30:00.000Z"
  }
]
```

### `GET /trips/available?routeId=<routeId>&date=YYYY-MM-DD&seatType=FRONT`

Public. `seatType` is optional.

Response:

```json
[
  {
    "id": "trip_id",
    "routeId": "route_id",
    "driverId": "driver_id",
    "departureAt": "2026-05-15T02:30:00.000Z",
    "frontSeatsTotal": 1,
    "backSeatsTotal": 4,
    "frontSeatsBooked": 0,
    "backSeatsBooked": 1,
    "status": "OPEN",
    "departurePoint": "Pithoragarh Bus Stand",
    "luggagePolicy": "free",
    "notes": null,
    "createdAt": "2026-05-12T07:30:00.000Z",
    "route": {
      "name": "Pithoragarh \u2192 Dehradun",
      "baseFrontPrice": 180000,
      "baseBackPrice": 140000
    },
    "driver": {
      "name": "Driver One"
    },
    "frontSeatsRemaining": 1,
    "backSeatsRemaining": 3
  }
]
```

### `GET /trips/:tripId`

Public.

Response includes route, driver name, booking count, and remaining seats.

## 9. Pahadi Booking APIs

All booking endpoints require:

```http
Authorization: Bearer <authToken>
```

Use a passenger JWT from passenger onboarding for normal frontend flows.

### `POST /bookings`

Creates a seat booking. The gateway injects `passengerId` from the JWT.

Body:

```json
{
  "tripId": "trip_id",
  "passengerName": "Passenger One",
  "passengerPhone": "+919876543211",
  "seatType": "FRONT",
  "luggageSize": "SMALL",
  "paymentMethod": "UPI",
  "emergencyContact": "+919876543212",
  "gstin": "05ABCDE1234F1Z5"
}
```

For cash:

```json
{
  "tripId": "trip_id",
  "passengerName": "Passenger One",
  "passengerPhone": "+919876543211",
  "seatType": "BACK",
  "luggageSize": "LARGE",
  "paymentMethod": "CASH"
}
```

Response:

```json
{
  "booking": {
    "id": "booking_id",
    "tripId": "trip_id",
    "passengerId": "passenger_id",
    "agentId": null,
    "passengerName": "Passenger One",
    "passengerPhone": "+919876543211",
    "seatType": "FRONT",
    "luggageSize": "SMALL",
    "luggageSurcharge": 0,
    "baseFare": 180000,
    "totalFare": 180000,
    "paymentMethod": "UPI",
    "paymentStatus": "PENDING",
    "razorpayOrderId": "order_id",
    "razorpayPaymentId": null,
    "status": "CONFIRMED",
    "emergencyContact": "+919876543212",
    "gstin": "05ABCDE1234F1Z5",
    "createdAt": "2026-05-12T07:30:00.000Z"
  },
  "fareBreakdown": {
    "baseFare": 180000,
    "luggageSurcharge": 0,
    "totalFare": 180000
  },
  "razorpayOrder": {
    "orderId": "order_id",
    "amount": 180000,
    "currency": "INR"
  }
}
```

For `CASH`, `razorpayOrder` is omitted and `paymentStatus` remains `PENDING`.

Frontend behavior:

- `UPI`: open Razorpay Checkout with `razorpayOrder.orderId`, then call payment confirm.
- `CASH`: show booking confirmed with pending cash collection.

### `GET /bookings/passenger/me`

Returns bookings for the authenticated user.

Response:

```json
[
  {
    "id": "booking_id",
    "tripId": "trip_id",
    "passengerId": "passenger_id",
    "passengerName": "Passenger One",
    "passengerPhone": "+919876543211",
    "seatType": "FRONT",
    "luggageSize": "SMALL",
    "baseFare": 180000,
    "luggageSurcharge": 0,
    "totalFare": 180000,
    "paymentMethod": "UPI",
    "paymentStatus": "PAID",
    "status": "CONFIRMED",
    "trip": {
      "id": "trip_id",
      "route": {
        "name": "Pithoragarh \u2192 Dehradun"
      }
    }
  }
]
```

### `GET /bookings/:bookingId`

Returns one booking with trip and route.

### `POST /bookings/:bookingId/payment-confirm`

Call after Razorpay Checkout success.

Body:

```json
{
  "razorpayPaymentId": "pay_123",
  "razorpaySignature": "signature"
}
```

Response is the updated booking with `paymentStatus: "PAID"`.

### `POST /bookings/:bookingId/cancel`

Body:

```json
{
  "reason": "Plan changed"
}
```

Response:

```json
{
  "bookingId": "booking_id",
  "status": "CANCELLED"
}
```

## 10. Passenger APIs

These endpoints require a JWT with `role: "PASSENGER"`.

### `GET /passenger/me`

Returns passenger profile and linked user.

### `GET /passenger/bookings`

Same purpose as `GET /bookings/passenger/me`, but role-restricted to passengers.

### `POST /passenger/bookings`

Same body as `POST /bookings`, but role-restricted to passengers.

Current frontend recommendation: prefer `/bookings` and `/bookings/passenger/me` until passenger auth and role coverage is finalized.

## 11. Driver APIs

All require a `DRIVER` JWT.

### `GET /drivers/me`

Returns driver profile.

### `POST /drivers/me/go-online`

Sets driver online.

### `POST /drivers/me/go-offline`

Sets driver offline.

### `GET /compliance/me/status`

Returns KYC/compliance status.

### `GET /earnings/me/summary`

Returns earnings summary.

### `GET /wallet/me/balance`

Returns wallet balance.

### `POST /drivers/me/documents`

Body:

```json
{
  "type": "license"
}
```

Returns a placeholder signed upload URL.

## 12. Telemetry APIs

All require a `DRIVER` JWT.

### `POST /telemetry/location`

Body:

```json
{
  "lat": 29.5829,
  "lng": 80.2182
}
```

### `POST /telemetry/heartbeat`

No body required.

## 13. Existing Ride APIs

All require a `DRIVER` JWT.

These are legacy ride-hailing APIs, not Pahadi scheduled-trip booking APIs.

```text
POST /rides/:rideId/accept
POST /rides/:rideId/reject
POST /rides/:rideId/arrived
POST /rides/:rideId/start
POST /rides/:rideId/complete
POST /rides/:rideId/cancel
```

`/start` body:

```json
{
  "riderOtp": "1234"
}
```

`/cancel` body:

```json
{
  "reason": "rider no-show"
}
```

## 14. Notifications API

Requires a `DRIVER` JWT.

### `POST /notifications/device-token`

Body:

```json
{
  "token": "fcm_or_apns_token"
}
```

## 15. Location APIs

Require JWT with `DRIVER`, `RIDER`, or `ADMIN` role. Passenger role is not currently allowed.

Available endpoints:

```text
POST   /location/directions
POST   /location/distance-matrix
POST   /location/route-optimizer
POST   /location/fleet-planner
POST   /location/snap-to-road
POST   /location/nearest-roads
POST   /location/speed-limits
POST   /location/places/autocomplete
POST   /location/places/details
POST   /location/places/details-advanced
POST   /location/places/nearby
POST   /location/places/nearby-advanced
POST   /location/places/text-search
POST   /location/places/address-validation
POST   /location/places/photo
POST   /location/geocode
POST   /location/reverse-geocode
POST   /location/geofence
PUT    /location/geofence/:id
GET    /location/geofence/:id
DELETE /location/geofence/:id
POST   /location/geofences
POST   /location/geofence/status
```

Use the DTO examples from `docs/APP_BIBLE.md` until these are narrowed for the Pahadi passenger app.

## 16. Internal Scheduling APIs Not Yet Gateway-Bound

The scheduling service exposes these internally:

```text
POST /api/scheduling/trips
GET  /api/scheduling/trips/driver/me
POST /api/scheduling/trips/:tripId/cancel
GET  /api/scheduling/trips/:tripId/manifest
```

They require `x-driver-id` headers, but the API Gateway does not currently expose frontend-safe versions that inject `driverId` from JWT. Add gateway routes before binding these from the driver frontend.

Recommended gateway additions:

```text
POST /api/driver/trips
GET  /api/driver/trips
POST /api/driver/trips/:tripId/cancel
GET  /api/driver/trips/:tripId/manifest
```

## 17. Recommended Frontend Smoke Flow

Passenger booking:

1. `POST /onboarding/session` with `role: "PASSENGER"`.
2. `POST /onboarding/profile` without OTP.
3. `POST /onboarding/profile` with `devOtpCode`.
4. `POST /onboarding/complete`; save `authToken` and `passengerId`.
5. `GET /routes`.
6. `GET /trips/available?routeId=<routeId>&date=YYYY-MM-DD`.
7. `POST /bookings`.
8. If UPI, open Razorpay Checkout and then call `POST /bookings/:bookingId/payment-confirm`.
9. `GET /bookings/passenger/me`.

Driver setup for scheduled trips, until gateway endpoints exist:

1. Driver onboarding with `role: "DRIVER"`.
2. Complete driver consents.
3. Create a trip through internal scheduling service with `x-driver-id`.
4. Use public trip APIs from the passenger app.

## 18. Error Handling Contract

The backend generally returns NestJS error shapes:

```json
{
  "statusCode": 400,
  "message": "Trip not found",
  "error": "Bad Request"
}
```

Some onboarding errors use structured payloads:

```json
{
  "statusCode": 400,
  "message": {
    "message": "Phone not verified",
    "error_code": "verification_failed"
  },
  "error": "Bad Request"
}
```

Frontend should treat `message` as `string | object | string[]`.

Common statuses:

| Status | Meaning |
| ---: | --- |
| 400 | Validation, invalid state, no seats, bad OTP |
| 401 | Missing/invalid/expired token |
| 403 | Wrong role |
| 404 | Route/trip/booking/driver not found |
| 409 | Seat lock conflict, phone role conflict |
| 500 | Missing env/config or downstream failure |


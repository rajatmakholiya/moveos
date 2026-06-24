# MoveOS Platform — Compliance & Disconnection Audit

**Date:** 2026-05-23  
**Scope:** moveos_backend (NestJS), moveos-pwa (Next.js 14), moveos-admin (Next.js 13)  
**Purpose:** Document every architectural, contractual, and operational disconnect across the three services before MVP hardening.

---

## Severity Legend

| Severity | Meaning |
|---|---|
| **P0 — Critical** | Live production risk: data corruption, auth bypass, security breach |
| **P1 — High** | Feature is broken or misleading; blocks real users or operators |
| **P2 — Medium** | Feature is incomplete or inconsistent; causes confusion or tech debt |
| **P3 — Low** | Code quality, minor inconsistency, future foot-gun |

---

## Category 1 — API Contract Mismatches

### C1.1 — Duplicate Endpoints with Divergent Guards `P1`
**Files:** `api-gateway/src/controllers/bookings.controller.ts:25`, `api-gateway/src/controllers/passenger.controller.ts:24`

Two routes serve the same passenger bookings data:
- `GET /api/bookings/passenger/me` — guarded by `JwtAuthGuard` only
- `GET /api/passenger/bookings` — guarded by `@Roles('PASSENGER')`

The PWA calls `/passenger/bookings`. A user onboarded with role `RIDER` (valid Prisma enum value) receives a 403 from the `PASSENGER`-gated route but would succeed on the duplicate. The ambiguity also exists for:
- `GET /api/compliance/me/status` vs `GET /api/driver/compliance`
- `GET /api/earnings/me/summary` vs `GET /api/driver/earnings`

**Required action:** Pick one canonical route per resource. Remove duplicates. Standardize role to `PASSENGER` for all passengers (do not issue `RIDER` tokens from onboarding).

---

### C1.2 — Driver Booking Shape Is Fabricated at the Gateway `P1`
**Files:** `api-gateway/src/controllers/requests.controller.ts:66-92`, `moveos-pwa/lib/pahadi.ts:136-170`

`GET /api/driver/bookings` synthesises a fake `bookings[]` from accepted dispatch requests with hard-coded fields: `seatType: 'BACK'`, `code: 'DR-YYYY-000001'`, `vehicleName: 'Accepted request'`. The PWA's `parseBooking()` reads `bookingCode`, `passengerPhone`, `farePaise` — none of which exist on this shape. Driver bookings in the PWA render placeholder defaults, not real data.

**Required action:** Implement a real driver bookings query from `SeatBooking` where `trip.driverId === req.user.driverId`. Remove the dispatch-request synthesiser.

---

### C1.3 — PWA Calls Endpoint That Will Always Throw a DB Null Violation `P0`
**Files:** `moveos-pwa/app/profile/page.tsx:165`, `api-gateway/src/controllers/drivers.controller.ts:75`

`POST /api/drivers/me/vehicles/:vehicleId/documents` is called from the PWA with body `{ type }` only. The backend handler calls `createVehicleDocumentMetadata(driverId, vehicleId, body.type)`. Prisma `VehicleDocument.url` is non-nullable. This will throw `P2011` on every call, meaning driver document upload is permanently broken.

**Required action:** Either add `url` to the DTO (and have the driver upload a file first), or make `VehicleDocument.url` nullable in the schema.

---

### C1.4 — `role: 'ORG_ADMIN'` Is Not in Any Role Enum `P0`
**Files:** `api-gateway/src/auth/auth.controller.ts:145`, `libs/common/src/auth/roles.decorator.ts:3`

The org-admin OTP flow signs a JWT with `role: 'ORG_ADMIN'`. This string does not appear in the Prisma `UserRole` enum or `AppRole` enum. Any `@Roles(...)` decorator added to `OrganizationsController` will silently lock out all org-admin users. RolesGuard will only bypass this for `SUPER_ADMIN`.

**Required action:** Add `ORG_ADMIN` to both `UserRole` Prisma enum and `AppRole`, then run a migration.

---

### C1.5 — PWA `api.ts` Silently Strips `/api` Prefix `P1`
**Files:** `moveos-pwa/lib/api.ts:39`

```ts
const withoutLegacyPrefix = path.replace(/^\/api(?=\/)/, '');
```

If `NEXT_PUBLIC_API_URL` is set without the `/api` suffix (the admin has no `.env.example` to guide this), every PWA request hits the wrong path and returns 404 with no useful error. The admin does not apply this strip, so the same env misconfiguration will cause different failures in each app.

**Required action:** Remove the strip. Make path handling explicit. Add `.env.example` to `moveos-admin`.

---

### C1.6 — `RequestsController` Exposes Passenger PII Publicly `P0`
**Files:** `api-gateway/src/controllers/requests.controller.ts:6-19`

`GET /api/requests` and `POST /api/requests` have **no auth guards**. The GET returns all transport requests including passenger name, phone, pickup, and dropoff. This is a DPDP Act violation in production.

**Required action:** Add `JwtAuthGuard` to `GET /api/requests`. Scope results to the requesting user's role.

---

### C1.7 — Razorpay UPI Flow Silently Fails in Dev `P1`
**Files:** `moveos-pwa/.env.local.example:2`, `moveos-pwa/app/trips/[tripId]/book/page.tsx:251`

`NEXT_PUBLIC_RAZORPAY_KEY_ID` ships empty in the example env. Razorpay checkout opens with an empty key and fails silently. There is no validation before opening the checkout modal.

**Required action:** Add a pre-flight check; throw an explicit error if `NEXT_PUBLIC_RAZORPAY_KEY_ID` is empty before opening Razorpay.

---

### C1.8 — Trip Posting: Driver vs. Org-Admin Have Divergent Vehicle Invariants `P2`
**Files:** `moveos-pwa/app/driver/post-trip/page.tsx:113-126`, `moveos-admin/lib/api.ts:263`, `api-gateway/src/controllers/organizations.controller.ts:691`

A driver-posted trip does not require `vehicleId`. An org-admin-posted trip calls `requireOrgVehicleAccess(vehicleId)`, which requires an active `DriverVehicleAssignment`. These two creation paths have different validation rules for the same data model.

**Required action:** Unify trip creation into a single backend path; enforce `vehicleId` consistently or remove the org-admin's stricter requirement.

---

## Category 2 — Type and Schema Divergence

### C2.1 — Booking Shape: Three Different Models `P1`
**Files:** `prisma/schema.prisma:651-674`, `moveos-pwa/lib/pahadi.ts:37-55`, `moveos-admin/lib/api.ts:201-212`

| Field | Prisma DB | PWA `Booking` | Admin `SeatBooking` |
|---|---|---|---|
| `baseFare` / `totalFare` | `Int` (paise) | `farePaise`, `totalPaise` (renamed) | `totalFare` only (missing `baseFare`) |
| `razorpayOrderId` | present | absent | absent |
| `gstin` | present | absent | absent |
| `luggageSurcharge` | present | absent | absent |
| `code` | absent | fabricated client-side | absent |
| `from` / `to` | absent (joined from route) | fabricated by splitting route name | absent |

The PWA constructs a presentation shape with no contractual mapping back to backend write paths. Admin cannot render fare breakdowns or issue refunds for the correct amount.

**Required action:** Define a shared `BookingDTO` (or OpenAPI schema) in the backend. Generate TypeScript types from it. Use those types in both frontends.

---

### C2.2 — `TripStatus.FULL` Is a Phantom Value `P2`
**Files:** `moveos-pwa/lib/pahadi.ts:102-103`, `prisma/schema.prisma:165-171`

The PWA validates trip status against a union that includes `'FULL'`. Prisma `TripStatus` has: `DRAFT, OPEN, DEPARTED, COMPLETED, CANCELLED`. The backend never emits `'FULL'`. This dead code path masks logic that may need to handle fully-booked trips (e.g., via `frontSeatsBooked === frontSeatsTotal`).

**Required action:** Remove `'FULL'` from the PWA type union. Handle the "no seats" display state via seat count arithmetic.

---

### C2.3 — `OrganizationDriverStatus.PENDING_DRIVER_ACCEPTANCE` Missing from Admin Types `P1`
**Files:** `prisma/schema.prisma:69-76`, `moveos-admin/lib/localStorage.ts:88-92`

Prisma has 6 driver link statuses. The admin interface enumerates only 5 (missing `PENDING_DRIVER_ACCEPTANCE`). Admin compliance review at `organizations.controller.ts:208` only allows patching to `ACTIVE | SUSPENDED | REMOVED`, so a driver stuck in `PENDING_DRIVER_ACCEPTANCE` cannot be advanced through any admin UI.

**Required action:** Add `PENDING_DRIVER_ACCEPTANCE` to admin types. Add an admin action to advance drivers from this state.

---

### C2.4 — Money Units Are Mixed `P0`
**Files:** `prisma/schema.prisma:324`, `moveos-pwa/app/trips/[tripId]/book/page.tsx:81-89`, `moveos_backend/apps/booking-service/src/booking/booking.service.ts:16-20`

CLAUDE.md mandates "always stored in paise (integer)". But:
- `SeatBooking.baseFare/totalFare` → `Int` (paise) — correct
- `Payment.amount` → `Decimal @default(0)` — **not paise, not integer**

Additionally, luggage surcharge constants are duplicated on the client (`book/page.tsx:81-89`) and backend (`booking.service.ts:16-20`). If either side changes, the displayed fare and charged amount will silently diverge.

**Required action:** Change `Payment.amount` to `Int`. Move fare constants to a single backend endpoint (`GET /api/fares/config`) that the PWA reads at booking time.

---

### C2.5 — Hardcoded Fallback Data Masks Missing Backend Data `P1`
**Files:** `moveos-pwa/lib/pahadi.ts:57-61`, `moveos-pwa/lib/pahadi.ts:115-127`

The PWA ships three hard-coded Pahadi routes (`fallbackRoutes`) shown when the backend returns 0 rows. It also fills missing driver/vehicle fields with static defaults (`driverRating: 4.8`, `driverTrips: 124`, `vehicleNumber: 'UK05TA1234'`, `frontFarePaise: 250000`). A clean DB gives users a "working" trip search backed by fiction. If a user taps one of these fake trips, the booking attempt will fail at the `tripId` lookup.

**Required action:** Remove all fallback constants. Surface explicit empty states in the UI.

---

### C2.6 — Organization Interface Missing `taxId`, `registrationNo` `P2`
**Files:** `moveos-admin/lib/api.ts:62-85`, `api-gateway/src/dto/organizations.dto.ts:218-225`

Admin's `Organization` interface omits `taxId` and `registrationNo`. The update DTO accepts them. The admin org detail page (`dashboard/org/page.tsx:461`) cannot update these fields even though they are required for GST compliance workflows.

**Required action:** Add missing fields to the admin `Organization` interface and expose them in the update form.

---

## Category 3 — Auth Flow Gaps

### C3.1 — Three In-Memory OTP Stores, Not Production-Safe `P0`
**Files:** `api-gateway/src/auth/auth.controller.ts:14-16`

```ts
private otpStore = new Map();
private adminOtpStore = new Map();
private orgOtpStore = new Map();
```

These are:
- Lost on process restart
- Not shared across gateway replicas (horizontal scaling breaks OTP verification)
- Never expire — failed OTPs accumulate forever

The onboarding-service correctly uses Redis + DB for OTPs. The gateway's `/auth/otp/*` path is a parallel, inferior implementation.

**Required action:** Move all OTP state into Redis with TTL. Remove the in-memory maps from `AuthController`.

---

### C3.2 — Legacy `/auth/otp/verify` Issues Fake Driver JWTs `P0`
**Files:** `api-gateway/src/auth/auth.controller.ts:24-44`

This endpoint signs a JWT with `sub: drv_<timestamp>` — a fake `driverId` that does not correspond to any database row. Any client that calls this endpoint receives a syntactically valid JWT that will fail every downstream service that looks up the driver by ID.

**Required action:** Remove or gate this endpoint behind `NODE_ENV === 'development'`. All auth must go through onboarding-service.

---

### C3.3 — `JWT_SECRET` Defaults to `supersecret` in Two Example Envs `P0`
**Files:** `moveos_backend/.env.example:9`, `moveos_backend/apps/api-gateway/.env.example:6`

If operators use the example env as-is in staging or production, all JWTs are signed with a public secret. Token forgery is trivial.

**Required action:** Remove the default value. Fail hard on startup if `JWT_SECRET` is not set or equals the development placeholder.

---

### C3.4 — Refresh Token Issued but Never Used `P2`
**Files:** `moveos_backend/apps/onboarding-service/src/onboarding.service.ts:487-489`, `moveos-pwa/lib/AuthContext.tsx:17-19`, `moveos-admin/lib/AuthContext.tsx:65-95`

The onboarding service issues `refreshToken` alongside `accessToken`. Neither the PWA nor admin stores or uses it. When the access token expires (typically 8h for admin, 7d for PWA), the user is silently logged out with no opportunity to reauthenticate seamlessly.

**Required action:** Implement a token refresh flow in both frontends. Store `refreshToken` securely. Wire a 401 interceptor to refresh before logging out.

---

### C3.5 — Admin Has No 401 Handler; Expired Sessions Stay Logged In `P1`
**Files:** `moveos-admin/lib/api.ts:30-39`

Admin's `request()` function throws `ApiError` on non-OK responses but never clears storage or redirects on a 401. An operator whose 8-hour SUPER_ADMIN token expires remains visually logged in; all subsequent API calls fail silently or show `[object Object]` errors.

**Required action:** Add a 401 handler in `admin/lib/api.ts` that calls `AuthContext.logout()` and redirects to `/login`.

---

### C3.6 — `devOtpCode` Exposed in Production Responses `P1`
**Files:** `api-gateway/src/auth/auth.controller.ts:53-59`

The OTP request endpoint returns `{ sent: true, devOtpCode }` without checking `NODE_ENV`. HTTP-observing attackers (man-in-transit for HTTP, or admin tool access) can read any admin's OTP directly.

**Required action:** Gate `devOtpCode` behind `process.env.NODE_ENV !== 'production'`.

---

### C3.7 — JWT Stored in `localStorage` (XSS Vulnerable) `P2`
**Files:** `moveos-pwa/lib/AuthContext.tsx:120`, `moveos-admin/lib/AuthContext.tsx:92`

Both apps store the JWT in `localStorage`. Any XSS in either Next.js app can exfiltrate the token. The backend only accepts `Authorization: Bearer`, so httpOnly cookies would require a Next.js proxy layer.

**Required action (P2 — post-MVP):** Add a Next.js API route as a thin BFF proxy. Store tokens in httpOnly cookies. Drop `localStorage` for auth.

---

## Category 4 — Data Model Gaps

### C4.1 — Admin Screens Are Mock Data, Not Live Backend `P0`
**Files:** Various under `moveos-admin/app/dashboard/`

The following admin pages are entirely backed by hardcoded or `localStorage` data. They do not call the backend:

| Admin Page | Data Source |
|---|---|
| `/dashboard` (main dashboard) | Hard-coded `revenueData`, `regionData`, `hotspots`, "Live Activity" |
| `/dashboard/drivers` | Mock array |
| `/dashboard/vehicles` | Mock array |
| `/dashboard/rides` | Mock array |
| `/dashboard/notifications` | Mock array |
| `/dashboard/challans` | Mock array |
| `/dashboard/clusters` | No API calls |
| `/dashboard/tracking` | No API calls |
| `/dashboard/settings` | Local only |
| `/dashboard/profile` | Local only |

**Only `/dashboard/organizations` and `/dashboard/org` are connected to the real backend.**

This is the single most critical compliance gap: the admin portal that SUPER_ADMIN operators use for operational decisions is showing fiction for 10 of 12 major pages.

**Required action:** Each page must be gated with a prominent "Not yet connected to backend" banner until wired. Connect in priority order: drivers → rides → tracking → challans.

---

### C4.2 — Backend Models with No Frontend Surface `P2`

The following Prisma models are fully implemented in the DB but have no UI in either frontend:

| Model | Affected Frontends | Notes |
|---|---|---|
| `Ride`, `RideEvent` | PWA, Admin | All `/api/rides/:id/{accept,reject,...}` routes exist but are unused by any frontend. Real-time ride flow is dead. |
| `Payment` | PWA, Admin | No endpoint exposes Payment rows to clients |
| `WalletLedger` | PWA, Admin | Ledger entries never exposed; only `wallet/me/balance` (single integer) is surfaced |
| `KycRecord` (driver/vehicle) | PWA | Driver has no path to submit KYC; backend model and admin review UI exist |
| `InvoiceRecord` | PWA, Admin | Invoice generation service exists; no endpoint serves it to clients |
| `FeatureFlagAssignment` | PWA, Admin | Flags are assigned during onboarding but never read by either frontend |
| `OnboardingConsent`, `VerificationAttempt` | Admin | No compliance/consent audit surface in admin |
| `Route` (create/edit) | PWA, Admin | Neither app can create a Route; route master data must be seeded via `prisma/seed.ts` |

---

### C4.3 — Stub Endpoints Return Empty Data with Live-Looking UI `P1`
**Files:** `api-gateway/src/controllers/organizations.controller.ts:734-769`

Three backend endpoints permanently return empty or synthesised data:
- `GET /organizations/:id/challans` → always `{ challans: [] }`
- `GET /organizations/:id/clusters` → synthesises fake clusters from `operatingRegions` (not a real model)
- `GET /organizations/:id/live-tracking` → `lastLocation: null` for every driver

The admin org dashboard calls all three and renders widgets as if they contain real data.

**Required action:** Either implement these endpoints or return a `501 Not Implemented` response. Remove the widgets from the admin UI until the backend is ready.

---

### C4.4 — Driver KYC Has No Submit Path from Any Client `P1`
**Files:** `prisma/schema.prisma:576-594`, `api-gateway/src/controllers/organizations.controller.ts:832`

`POST /organizations/:id/vehicles/:vehicleId/kyc` exists for vehicle KYC. There is no equivalent `POST /drivers/me/kyc` mounted. The admin can review `KycRecord` rows that don't exist yet. The driver has no UI to upload documents with URLs (see C1.3). The KYC compliance loop is open at both ends.

**Required action:** Add `POST /drivers/me/kyc` gateway route. Add a PWA KYC submission flow. Fix document URL upload (C1.3) as a prerequisite.

---

### C4.5 — Route Master Data Cannot Be Created via UI `P2`
**Files:** `moveos_backend/prisma/seed.ts`

`Route` rows (from/to city pairs, base fares) can only be inserted via the Prisma seed script. Neither the admin portal nor the PWA has a "create route" form. Adding a new intercity route requires a developer to modify `seed.ts` and run it against production — a compliance and operational risk.

**Required action:** Add `POST /admin/routes` (SUPER_ADMIN only) and a corresponding admin UI page.

---

## Category 5 — Environment and Configuration Mismatches

### C5.1 — Admin Has No `.env.example` `P1`
**Files:** `moveos-admin/` (no `.env.example` exists)

Admin's `lib/api.ts:3` defaults `API_BASE` to `http://localhost:3000/api`. The admin is built as a static export (`next.config.js: output: 'export'`), so this value is baked into the build artifact. New operators have no documented env contract.

**Required action:** Create `moveos-admin/.env.example` with `NEXT_PUBLIC_API_BASE=http://localhost:3000/api`.

---

### C5.2 — Gateway Service URL Defaults Are Inconsistent `P1`
**Files:** Various `*.client.ts` files under `api-gateway/src/`

Some service clients default to URLs **with** `/api` suffix; others default to URLs **without** it:

| Client | Default URL |
|---|---|
| `booking-service.client.ts:10` | `http://localhost:3009/api` — with suffix |
| `scheduling-service.client.ts:11` | `http://localhost:3008/api` — with suffix |
| `onboarding-service.client.ts:11` | `http://localhost:3006/api` — with suffix |
| `driver-service.client.ts:10` | `http://localhost:3001` — **no suffix** |
| `ride-service.client.ts:10` | `http://localhost:3002` — **no suffix** |
| `dispatch-service.client.ts:10` | `http://localhost:3003` — **no suffix** |
| `telemetry-service.client.ts:10` | `http://localhost:3004` — **no suffix** |
| `notification-service.client.ts:10` | `http://localhost:3005` — **no suffix** |

If `.env` is absent (e.g., CI or fresh checkout), half the gateway routes silently 404.

**Required action:** Standardize all service URLs. Pick one convention (with or without `/api`). Make startup fail if required env vars are absent.

---

### C5.3 — CORS Origins Don't Cover PWA Dev Port `P2`
**Files:** `moveos_backend/apps/api-gateway/.env.example:3`

CORS `ALLOWED_ORIGINS` lists ports `3010, 3011, 3020, 3030, 3000, 5173, 8080`. The PWA defaults to port `3001` when `3000` is taken by the gateway, which is the typical dev setup. Developers will hit CORS errors without knowing why.

**Required action:** Add `http://localhost:3001` and `http://localhost:3020` (intended PWA port) to the default CORS list. Document the intended port for each service.

---

### C5.4 — `location-service` Has No `.env.example` `P3`
**Files:** `moveos_backend/apps/location-service/`

Only a `.env` file exists, not a `.env.example`. New developers will either copy production credentials or run without the service.

**Required action:** Create `.env.example` for `location-service`.

---

## Category 6 — Feature Completeness Matrix

### C6.1 — Feature Parity Table

| Feature | Backend | PWA | Admin | Gap |
|---|---|---|---|---|
| Passenger booking (UPI) | Full | Full (Razorpay) | None | Admin cannot view payment status |
| Driver trip posting | Full | Full | Via org only | Inconsistent `vehicleId` invariant (C1.8) |
| Real-time ride flow | Stubbed (`Ride` model) | None | None | Full feature gap |
| Driver KYC | Model + admin review | None | Review only | No submit path (C4.4) |
| Vehicle KYC | Endpoint exists | None | Not wired | No submit path |
| Live tracking | `lastLocation: null` always | Polls `/telemetry/location` | Widget shows null | End-to-end broken |
| Organization KYC | Full path | None | Full review UI | Org can't self-serve |
| Clusters (fleet grouping) | Stub | None | Stub UI | Not implemented |
| Payouts / settlement | `WalletLedger` model only | Balance only | None | Full feature gap |
| Invoice generation | Service exists | "Not available" message | None | Not exposed |
| WebSocket updates | Redis pub/sub internally | Polling only | No live updates | Real-time gap |
| Push notifications | Token registration only | Registers token | None | Delivery not implemented |
| Route management | Seed only | None | None | No UI, ops risk |
| Feature flags | Assigned during onboarding | Never read | Never read | Flags are dead |
| Refresh token | Issued by onboarding | Ignored | Ignored | No session renewal (C3.4) |
| Hindi localisation | n/a | Full | English only | Admin is English-only |
| Idempotency keys | Supported in gateway | Never sent | Never sent | Booking retries risk duplicates |

---

## Category 7 — Error Handling Contracts

### C7.1 — Backend Emits Three Incompatible Error Shapes `P1`
**Files:** Throughout `organizations.controller.ts`, `auth.controller.ts`, `ValidationPipe`

| Shape | Example | When |
|---|---|---|
| String message | `{ statusCode: 400, message: "Invalid OTP", error: "Bad Request" }` | Most controllers |
| Object message | `{ statusCode: 400, message: { message: "...", error_code: "...", vehicleId: "..." }, error: "Bad Request" }` | Org controller conflict errors |
| Array message | `{ statusCode: 400, message: ["field must be a phone number"], error: "Bad Request" }` | ValidationPipe |

Admin's `request()` reads `json?.message` as a string. When it receives shape 2 (object), it renders `[object Object]` in the UI instead of the actual error.

**Required action:** Standardize on one error envelope. Use shape 1 (string) with an optional `errorCode` field at the top level. Update admin's `ApiError` parsing to handle all three shapes until migration is complete.

---

### C7.2 — PWA Auto-Retries Non-Idempotent POST on 5xx `P1`
**Files:** `moveos-pwa/lib/api.ts:138-141`

The PWA retries any 5xx response (including from `POST /bookings`) once after 1 second. The booking service holds a 30-second Redis seat lock. A 502 → retry sequence produces a `ConflictException` ("Another booking is in progress") that the user sees as a false "seat just taken" error, even though their booking may have succeeded.

**Required action:** Limit auto-retry to idempotent methods (`GET`, `HEAD`). Never auto-retry `POST`, `PUT`, `PATCH`, `DELETE`.

---

### C7.3 — Network Error Message Leaks Dev Guidance to End Users `P2`
**Files:** `moveos-pwa/lib/api.ts:131-136`

On a `TypeError` (no network), the PWA shows verbatim: `"Could not reach the API. Check that the gateway is running and CORS allows this frontend."` This is dev-only guidance.

**Required action:** Replace with a user-friendly message in production. Gate the technical message behind `NODE_ENV`.

---

### C7.4 — Response Envelope Is Non-Uniform `P2`
**Files:** Various controllers

| Controller | Response shape |
|---|---|
| Most org endpoints | `{ status: 'ok', data: { ... } }` |
| Auth controller | `{ accessToken, refreshToken, driverId, role }` — no envelope |
| Booking service | `{ bookingId, booking, fareBreakdown, razorpayOrder? }` — no envelope |
| Onboarding service | `{ status: 'pending_otp', ... }` — different status string |
| Route controller | Raw array — no envelope |

Frontends use conditional unwrapping (`payload.data?.trips`, `payload.data`, etc.) that is fragile against future shape changes.

**Required action:** Adopt a single response envelope for all success responses: `{ ok: true, data: T }`. Generate TypeScript types via a shared package or OpenAPI spec.

---

## Category 8 — Prioritized Remediation Checklist

### P0 — Fix Before Any Production Traffic

- [ ] **C3.3** — Remove `JWT_SECRET` default from all `.env.example` files; fail on startup if not set
- [ ] **C3.2** — Remove or dev-gate legacy `/auth/otp/verify` that issues fake driver JWTs
- [ ] **C3.1** — Move OTP store to Redis with TTL; remove in-memory `Map`s from `AuthController`
- [ ] **C1.6** — Add `JwtAuthGuard` to `GET /api/requests`; scope PII to authenticated users
- [ ] **C1.4** — Add `ORG_ADMIN` to `UserRole` Prisma enum and `AppRole`; run migration
- [ ] **C1.3** — Fix `VehicleDocument.url` null constraint; add file URL to DTO or make column nullable
- [ ] **C2.4** — Standardize `Payment.amount` to `Int` (paise); move surcharge constants to a backend endpoint
- [ ] **C4.1** — Add "Not connected to backend" banners to all 10 mock admin pages

### P1 — Fix Before Beta Launch

- [ ] **C4.4** — Implement `POST /drivers/me/kyc`; add PWA driver KYC submission flow
- [ ] **C4.3** — Return `501` from stub endpoints; remove corresponding admin widgets
- [ ] **C1.2** — Implement real driver bookings from `SeatBooking`; remove fabricated shape
- [ ] **C1.1** — Deduplicate `/bookings/passenger/me` vs `/passenger/bookings`; normalize `PASSENGER` role
- [ ] **C2.1** — Define canonical `BookingDTO`; generate TypeScript types from it for both frontends
- [ ] **C2.3** — Add `PENDING_DRIVER_ACCEPTANCE` to admin types; add admin action to advance state
- [ ] **C2.5** — Remove `fallbackRoutes` and all hardcoded driver/vehicle defaults from `pahadi.ts`
- [ ] **C3.5** — Add 401 handler to admin `lib/api.ts`; auto-logout on expired token
- [ ] **C3.4** — Implement refresh token flow in both PWA and admin
- [ ] **C3.6** — Gate `devOtpCode` behind `NODE_ENV !== 'production'`
- [ ] **C5.1** — Create `moveos-admin/.env.example`
- [ ] **C5.2** — Standardize all gateway service URL defaults; fail on missing env
- [ ] **C7.2** — Restrict auto-retry to idempotent HTTP methods only
- [ ] **C7.1** — Standardize backend error envelope; fix admin `[object Object]` rendering
- [ ] **C1.5** — Remove `/api` strip from `moveos-pwa/lib/api.ts`; document env var contract
- [ ] **C1.7** — Add Razorpay key pre-flight check before opening checkout modal
- [ ] **C4.5** — Add `POST /admin/routes` endpoint and admin UI for route management

### P2 — Fix Before GA

- [ ] **C2.2** — Remove `'FULL'` from PWA `TripStatus` union; handle full-trip display via seat count
- [ ] **C2.6** — Add `taxId`, `registrationNo` to admin `Organization` interface and update form
- [ ] **C6.1 WebSocket** — Implement Socket.IO gateway; replace PWA polling
- [ ] **C6.1 Invoices** — Wire invoice generation endpoint; enable download in PWA confirm page
- [ ] **C6.1 Payouts** — Implement `WalletLedger` list endpoint and payout initiation
- [ ] **C6.1 Feature Flags** — Wire `FeatureFlagAssignment` reads in both frontends
- [ ] **C7.4** — Adopt uniform `{ ok: true, data: T }` response envelope across all controllers
- [ ] **C5.3** — Add PWA dev port to default CORS origins
- [ ] **C7.3** — Replace dev-only network error message in production builds
- [ ] **C1.8** — Unify trip creation path; consistent `vehicleId` validation
- [ ] **C3.7** — Implement BFF proxy + httpOnly cookie auth (post-MVP security hardening)

### P3 — Technical Debt

- [ ] **C5.4** — Create `moveos-admin/apps/location-service/.env.example`
- [ ] **C1.9** — Align `del` vs `delete` method name in admin vs PWA API clients
- [ ] Document intended dev port for each service in a `PORTS.md` or `README.md`
- [ ] Resolve unused `Ride`/`RideEvent` flow: implement real-time ride or remove the model and routes

---

## Appendix A — File Reference Map

| Disconnect | Primary Files |
|---|---|
| Fake driver JWT | `api-gateway/src/auth/auth.controller.ts:24-44` |
| In-memory OTP | `api-gateway/src/auth/auth.controller.ts:14-16` |
| JWT_SECRET default | `moveos_backend/.env.example:9`, `apps/api-gateway/.env.example:6` |
| Unauthenticated requests GET | `api-gateway/src/controllers/requests.controller.ts:6-19` |
| ORG_ADMIN missing from enum | `libs/common/src/auth/roles.decorator.ts:3` |
| VehicleDocument null URL | `api-gateway/src/controllers/drivers.controller.ts:75` |
| Payment Decimal vs Int | `prisma/schema.prisma:324` |
| Fake booking shape | `api-gateway/src/controllers/requests.controller.ts:66-92` |
| PWA fallback data | `moveos-pwa/lib/pahadi.ts:57-127` |
| Admin mock pages | `moveos-admin/app/dashboard/*/page.tsx` |
| Stub org endpoints | `api-gateway/src/controllers/organizations.controller.ts:734-769` |
| /api strip | `moveos-pwa/lib/api.ts:39` |
| POST auto-retry | `moveos-pwa/lib/api.ts:138-141` |
| Admin error [object Object] | `moveos-admin/lib/api.ts:30-39` |
| devOtpCode leak | `api-gateway/src/auth/auth.controller.ts:53-59` |
| TripStatus FULL phantom | `moveos-pwa/lib/pahadi.ts:102-103` |
| Inconsistent service URL defaults | `api-gateway/src/clients/*.client.ts` |

# MoveOS Platform — Complete Architecture & Roadmap

> **Context:** MoveOS is a scheduled shared-seat intercity ride platform ("Pahadi Rides"), not urban ride-hail. Drivers post trips with seat inventory; passengers browse and book seats. This document covers all three codebases: `moveos_backend` (NestJS microservices), `moveos-pwa` (Next.js 14 passenger + driver app), and `moveos-admin` (Next.js 13 admin portal).

---

## Part 1 — Complete Inventory (What Exists Today)

### 1.1 Backend — `moveos_backend`

Nine NestJS microservices behind a single API gateway. PostgreSQL (Prisma ORM) + Redis.

| Service | Port | What It Does | Battle-Tested? |
|---|---|---|---|
| api-gateway | 3000 | Central REST surface, JWT auth, Swagger, Socket.IO gateway | Yes |
| onboarding-service | 3006 | OTP flow, user creation, JWT issuance | Yes |
| driver-service | 3001 | Driver profile, go-online/offline, vehicles, earnings | Partial |
| scheduling-service | 3008 | Trip CRUD, seat availability, manifest | Partial |
| booking-service | 3009 | Seat booking, Razorpay, Redis seat locks, invoice PDF | Partial |
| location-service | 3007 | Ola Maps proxy, Redis caching, geo search | Partial |
| ride-service | 3002 | Ride state transitions (arrived/start/complete) | Not tested |
| dispatch-service | 3003 | In-memory offer dispatch, accept/reject | Not tested |
| telemetry-service | 3004 | Driver location ingestion + heartbeat to Redis | Not tested |
| notification-service | 3005 | Device token registry (in-memory, stub only) | Not tested |

**Database models in schema.prisma:** User, Driver, Passenger, Vehicle, DriverVehicleAssignment, Ride, RideEvent, DriverDocument, VehicleDocument, Payment, WalletLedger, OnboardingSession, OnboardingConsent, VerificationAttempt, Referral, FeatureFlagAssignment, IdempotencyKey, Route, ScheduledTrip, SeatBooking, InvoiceRecord — 21 models.

**Real integrations:** Razorpay (order + signature verify), Ola Maps (20+ endpoints, Redis-cached).

**What is NOT integrated despite being built:** SMS provider for real OTPs (returns devOtpCode in response), push notification delivery (FCM/APNs), any KYC verification service, any payout/bank settlement.

---

### 1.2 PWA — `moveos-pwa`

Next.js 14 App Router, PWA-capable, Tailwind, Framer Motion, SWR, Leaflet maps, Razorpay payment.

**Passenger screens:** Home/search, trip search results, booking form, my bookings, booking confirmation/ticket, live location tracking, custom requests, profile.

**Driver screens:** Dashboard (online/offline, metrics), offerings (seat/vehicle/parcel/cluster tabs), post-trip form, trip manifest, requests, parcels.

**Shared:** Onboarding (welcome → phone → OTP → name → consents → complete), language toggle (EN/HI).

**Working:** Core booking flow end-to-end (search → book → pay via Razorpay or cash → view ticket). Driver can post trips, see manifest, go online/offline.

**All real-time is polling-based** (every 15s). Socket.IO gateway exists in backend but no client-side WebSocket code.

---

### 1.3 Admin Portal — `moveos-admin`

Next.js 13 static export. All data is localStorage — **zero connection to the real backend**. Shadcn/Radix UI, Recharts, Tailwind.

Pages: Dashboard, Drivers, Vehicles, Rides, Live Tracking, Clusters, Challans, Notifications, Profile, Settings.

Current state: Fully functional UI demo with dummy data. Needs to be re-wired to real backend APIs and have the two-role system (super admin + org admin) implemented.

---

## Part 2 — Critical Gaps & Broken Pieces

### 2.1 Architectural Gaps

**1. No Organization / Multi-Tenancy Model**
The database has no `Organization` or `Fleet` model. There is no concept of a group of drivers and vehicles owned by one entity. This is the biggest structural gap before any org-admin feature can be built.

**2. No Admin Authentication**
`UserRole.ADMIN` exists in the JWT enum but there is no admin-specific service, no admin login endpoint, no admin-scoped API routes. The admin portal connects to nothing.

**3. No Real OTP / SMS**
OTP is a stub. The devOtpCode is returned in the API response directly. This must be replaced with a real SMS provider (MSG91, Gupshup, Twilio) before production.

**4. No Real Push Notifications**
Notification service stores device tokens in memory (lost on restart). No FCM/APNs delivery is implemented. All driver offer notifications rely on polling.

**5. Cross-Service Events Are In-Process Only**
EventEmitter2 is used for events but it only works within the same process. In a microservices setup, ride-service and dispatch-service can't receive events from booking-service unless they share a process. Redis pub/sub channels exist in RedisService but are not wired between services.

**6. Ride Model vs ScheduledTrip Model — Two Parallel Systems**
The `Ride` table (REQUESTED→OFFERED→ACCEPTED→ARRIVED→STARTED→COMPLETED) is an on-demand dispatch model. The `ScheduledTrip` + `SeatBooking` tables are the actual scheduled seats model. These two are currently not connected. The dispatch-service and ride-service use the Ride model; the scheduling-service and booking-service use ScheduledTrip. There is no clear handoff between them, and they serve different flows. This must be clarified and unified.

**7. Driver Compliance Has No Remediation Path**
The compliance check returns CLEAR or BLOCKED but there is no flow for a driver to upload missing documents, track review status, or get unblocked. Drivers can be blocked with no path to resolution.

**8. No Bank Account / Payout Setup**
Wallet ledger exists and tracks earnings but there is no bank account collection, no beneficiary setup, no payout triggering (Razorpay/Cashfree payout API).

**9. Cash Payment Reconciliation**
Cash bookings are created with `paymentStatus: PENDING` and never settled. There is no mechanism for a driver or org admin to mark cash collected, and no settlement reporting.

**10. Cluster Feature is Locked**
The "Cluster" tab in the driver offerings screen shows "Premium upgrade required." There is no cluster service, no clustering algorithm, no database model, and no paid-feature gate in the backend.

---

### 2.2 Technical Debt

- Seat locks use a 30-second Redis NX lock — adequate but not monitored. Lock abandonment on crash needs cleanup.
- Dispatch service stores requests in-memory — restarts lose all pending requests.
- OTP rate limiting (5/hour) is per-phone+device but there is no global rate limiter on the API gateway.
- Location caching TTL is a single env var for all endpoint types — directions should cache longer than geocoding.
- All document URLs stored as plain strings with no signed URL expiry — documents on Supabase Storage would be public-readable forever.
- `InvoiceRecord.pdfUrl` stores the PDF URL but there is no service that actually generates and uploads the PDF on demand.

---

## Part 3 — The Complete Booking Flow (How It Should Work)

This is the canonical flow this system must support end-to-end.

### 3.1 Flow Model Clarification

**This platform runs two distinct flows:**

**Flow A — Scheduled Shared Ride (current focus)**
Driver publishes a trip → passengers browse and book seats → trip departs on schedule.

**Flow B — On-Demand Single Ride (secondary, future)**
Passenger requests a ride → system dispatches to nearby driver → driver accepts → ride completes.

The `ScheduledTrip` + `SeatBooking` models serve Flow A.
The `Ride` + `Dispatch` models serve Flow B.

**Everything below is Flow A (scheduled seats) since that is what the product currently is.**

---

### 3.2 Complete Scheduled Ride Flow

```
DRIVER SIDE                        PLATFORM                          PASSENGER SIDE
──────────────────────────────────────────────────────────────────────────────────

1. Driver completes KYC              
   (license + vehicle docs           
    verified by HyperVerge)          

2. Driver goes ONLINE               Redis: driver:{id}:status = ONLINE

3. Driver posts trip                 ScheduledTrip created
   - Route, date, time               status = OPEN
   - Seat inventory (front/back)     Seats available = frontTotal + backTotal
   - Pickup point, luggage policy    

4.                                   Trip appears in search results    Passenger searches by route + date
                                                                       GET /trips/available?routeId=X&date=Y

5.                                   Trip detail shown                 Passenger views trip
                                     (driver info, vehicle,            (fares, driver rating, seat types,
                                      fares, availability)              departure time)

6.                                                                      Passenger selects seat type,
                                                                        fills details (name, phone,
                                                                        emergency contact, luggage)

7.                                   Redis seat lock acquired           
                                     (30s window)                      

8a. Cash payment:                    SeatBooking created               
    status = PENDING                 paymentStatus = PENDING           
    No Razorpay order                seat count incremented            
                                     Lock released                     

8b. UPI payment:                     Razorpay order created            
    status = CONFIRMED               SeatBooking created               
    after payment confirm            paymentStatus = INITIATED         
                                     Lock released                     
                                     Passenger pays in-app             
                                     POST /bookings/:id/payment-confirm
                                     paymentStatus = PAID              

9.                                   Booking confirmed                 Passenger receives ticket
                                     Notification → driver             (booking code, seat, route,
                                      "New booking on your trip"        fare, driver name, vehicle)

10. Driver sees updated manifest     Manifest updated in real-time      

11. On departure day:                ScheduledTrip → DEPARTED           Passenger can track live
    Driver starts trip               (no intermediate step needed       location on map
    Marks trip as DEPARTED            for scheduled rides)              

12. Trip ends:                       ScheduledTrip → COMPLETED          
    Driver marks COMPLETED           SeatBooking → COMPLETED           
                                     Cash bookings → mark collected     
                                     UPI bookings → wallet credit        
                                     Invoice PDF generated              
                                     WalletLedger CREDIT entry created  

13.                                                                      Passenger prompted to rate driver
                                                                         (1-5 stars)

14. Driver sees earnings update      WalletLedger balance updated       
    in wallet                        
```

---

### 3.3 Organization-Managed Flow (Org Admin Layer)

When a driver belongs to an organization, an additional layer sits between the driver and the trip:

```
1. Org admin creates a route plan (which routes their fleet covers, which dates)
2. System auto-assigns available drivers to trips, OR org admin manually assigns
3. Driver sees assigned trip on their dashboard
4. Bookings flow identically as above (passengers don't know or care about org)
5. Org admin sees: all trips across their fleet, all bookings, cash collection status
6. Org admin can Accept or Reject bookings within a configurable window (optional)
7. Super admin sees: all orgs, aggregate stats, compliance alerts, audit log
```

---

### 3.4 Individual Owner Flow

Same as 3.2 above. No org layer. Driver IS the owner. Simpler profile, single vehicle, no admin overhead.

---

## Part 4 — Organization & Multi-Tenancy Model

### 4.1 Database Schema Changes Required

Add these models to `schema.prisma`:

```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  city        String
  adminPhone  String   // phone of the org admin user
  plan        OrgPlan  @default(BASIC)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     OrgMembership[]
  trips       ScheduledTrip[]  // indirect via drivers
}

enum OrgPlan {
  BASIC        // manual dispatch, no clustering
  GROWTH       // clustering enabled
  ENTERPRISE   // white-label + API access
}

model OrgMembership {
  id       String           @id @default(cuid())
  orgId    String
  userId   String
  role     OrgRole
  joinedAt DateTime         @default(now())
  org      Organization     @relation(fields: [orgId], references: [id])
  user     User             @relation(fields: [userId], references: [id])

  @@unique([orgId, userId])
}

enum OrgRole {
  OWNER
  ADMIN
  DISPATCHER
}
```

**Modify existing models:**

```prisma
model Driver {
  // ... existing fields ...
  orgId  String?         // null = independent owner
  org    Organization?   @relation(fields: [orgId], references: [id])
}

model ScheduledTrip {
  // ... existing fields ...
  orgId  String?
  org    Organization?   @relation(fields: [orgId], references: [id])
}
```

Add `ORG_ADMIN` to `UserRole` enum:
```prisma
enum UserRole {
  DRIVER
  ADMIN
  ORG_ADMIN   // new
  RIDER
  PASSENGER
}
```

### 4.2 New Backend Services Required

**`org-service` (Port 3010)**
- POST `/orgs` — create organization (super admin only)
- GET `/orgs` — list all organizations (super admin)
- GET `/orgs/:id` — org detail with stats
- PUT `/orgs/:id` — update org
- POST `/orgs/:id/members` — add driver/admin to org
- DELETE `/orgs/:id/members/:userId` — remove member
- GET `/orgs/:id/trips` — org-scoped trip list
- GET `/orgs/:id/bookings` — org-scoped booking list
- PUT `/orgs/:id/bookings/:bookingId/status` — org admin accept/reject booking

**`admin-service` (Port 3011)**
- POST `/admin/auth/login` — super admin login (phone + OTP, issues ADMIN-role JWT)
- POST `/admin/auth/org-login` — org admin login (phone + OTP, issues ORG_ADMIN JWT with orgId)
- GET `/admin/stats` — aggregate system stats (super admin)
- GET `/admin/audit-log` — full audit log
- GET `/admin/drivers` — all drivers across all orgs
- GET `/admin/organizations` — alias for org-service list
- GET `/admin/activity-feed` — live activity stream (SSE or WebSocket)

### 4.3 Admin Portal Connection Plan

The existing `moveos-admin` Next.js app needs to:

1. Replace all `localStorage` reads with real API calls to `admin-service` and `org-service`
2. Implement role-aware login (`/api/admin/auth/login`) that stores a real JWT
3. Super admin gets existing routes + Organizations page + Activity Monitor page
4. Org admin gets scoped routes at `/org-dashboard/*` as planned

The admin portal's UI is largely complete. The work is plumbing it to the real backend.

---

## Part 5 — Driver Onboarding & KYC (Complete Flow Design)

### 5.1 What's There Today

```
Welcome → Phone → OTP → Name → Consents → Done (JWT issued)
```

After signup, driver lands on dashboard with `kycStatus = PENDING` and `complianceStatus = CLEAR`. They can go online and post trips, but the compliance check is advisory only. There is no enforcement that a driver must have valid documents before accepting bookings.

This is a **compliance liability**. A driver with no verified license, no vehicle insurance, can accept paying passengers today.

### 5.2 Complete Onboarding Flow (Redesigned)

```
Stage 1 — IDENTITY (mandatory, blocks going online)
  ├── Phone OTP verified                ✅ (exists)
  ├── Name entered                      ✅ (exists)
  ├── Aadhaar number + OTP verify       ❌ needs build
  └── Selfie + liveness check           ❌ needs build (HyperVerge)

Stage 2 — DRIVING CREDENTIALS (mandatory, blocks accepting bookings)
  ├── Driving License upload (front+back)     ❌ needs build
  ├── DL OCR → auto-fill DL number + expiry  ❌ needs build (HyperVerge)
  └── DL verification (RTO database check)   ❌ needs build (HyperVerge/Signzy)

Stage 3 — VEHICLE REGISTRATION (mandatory per vehicle)
  ├── Vehicle registration number             ✅ (exists, no verify)
  ├── RC document upload                      ✅ (exists, no verify)
  ├── RC OCR + validation                     ❌ needs build (HyperVerge)
  ├── Vehicle insurance upload                ✅ (exists, no verify)
  ├── Insurance expiry alert (30 days)        ✅ (exists in admin)
  └── Permit upload (if intercity route)      ✅ (exists, no verify)

Stage 4 — PAYOUT SETUP (mandatory before first payout)
  ├── Bank account number + IFSC              ❌ needs build
  ├── Account holder name verify             ❌ needs build (penny drop)
  └── UPI VPA (optional, for instant payout) ❌ needs build

Stage 5 — AGREEMENTS (mandatory)
  ├── Platform terms & conditions             ❌ needs build (e-sign)
  └── Driver service agreement               ❌ needs build
```

### 5.3 HyperVerge Integration Design

HyperVerge is an AI-powered KYC provider. Integration points:

**Aadhaar Verification (Stage 1)**
```
1. Driver enters 12-digit Aadhaar number
2. POST /kyc/aadhaar/initiate → HyperVerge generates OTP to Aadhaar-linked mobile
3. Driver enters OTP
4. POST /kyc/aadhaar/verify → HyperVerge returns verified name, DOB, address, photo
5. Store in DriverKYC record, set kycStatus = AADHAAR_VERIFIED
```

**Driving License OCR + Verification (Stage 2)**
```
1. Driver uploads DL front image
2. POST /kyc/dl/ocr → HyperVerge extracts: name, DL number, validity, vehicle class
3. Show extracted data to driver for confirmation
4. POST /kyc/dl/verify → HyperVerge hits Sarathi/RTO database, returns match + validity
5. Store in DriverDocument with status APPROVED or REJECTED
6. Set kycStatus = DL_VERIFIED
```

**Face Match (Stage 1 → 2 handoff)**
```
1. After Aadhaar verification (has face photo from Aadhaar)
2. Driver takes selfie with liveness check
3. POST /kyc/face-match → HyperVerge compares selfie vs Aadhaar photo
4. Returns match confidence score (threshold: > 75%)
5. If pass → kycStatus = IDENTITY_VERIFIED
6. If fail → flag for manual review
```

**RC Verification (Stage 3)**
```
1. Driver uploads RC document
2. POST /kyc/rc/ocr → HyperVerge extracts: registration number, owner name, validity
3. POST /kyc/rc/verify → verifies via Vahan database
4. Match vehicle registration number against what driver entered
5. Store VehicleDocument with status APPROVED
```

**Backend: New `kyc-service` (Port 3012)**
```
POST /kyc/session         — start KYC session
POST /kyc/aadhaar         — initiate Aadhaar OTP
POST /kyc/aadhaar/verify  — verify Aadhaar OTP
POST /kyc/face-match      — face + liveness check
POST /kyc/dl/ocr          — DL OCR
POST /kyc/dl/verify       — DL database verify
POST /kyc/rc/ocr          — RC OCR
POST /kyc/rc/verify       — RC database verify
POST /kyc/bank/verify     — bank account penny drop
GET  /kyc/status          — current KYC completion status
```

**New Prisma Model: DriverKYC**
```prisma
model DriverKYC {
  id                  String    @id @default(cuid())
  driverId            String    @unique
  aadhaarNumber       String?   // last 4 digits only for storage
  aadhaarVerifiedAt   DateTime?
  dlNumber            String?
  dlVerifiedAt        DateTime?
  dlExpiresAt         DateTime?
  faceMatchScore      Float?
  faceMatchedAt       DateTime?
  bankAccountLast4    String?
  bankVerifiedAt      DateTime?
  overallStatus       KycStatus @default(PENDING)
  hypervergeSessionId String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  driver              Driver    @relation(fields: [driverId], references: [id])
}
```

### 5.4 Compliance Enforcement Logic

**Gate 1 — Can go online?**
Requires: `kycStatus = IDENTITY_VERIFIED` (Aadhaar + face match)

**Gate 2 — Can accept bookings?**
Requires: `kycStatus = DL_VERIFIED` + active vehicle with `vehicleDoc.RC.status = APPROVED` + `vehicleDoc.Insurance.status = APPROVED` + Insurance not expired

**Gate 3 — Can receive payouts?**
Requires: bank account verified via penny drop

**When any gate fails:** Driver dashboard shows a banner with exactly what is missing and a "Fix now" button that deep-links to the relevant step. No vague "you are blocked" messaging.

### 5.5 Onboarding Flow in PWA (New Screens Needed)

```
After name + consents (current end) →

NEW: /driver/kyc/aadhaar   — Aadhaar number input + OTP
NEW: /driver/kyc/selfie    — Camera capture + liveness prompt
NEW: /driver/kyc/dl        — DL photo upload, OCR result review
NEW: /driver/kyc/vehicle   — Vehicle plate + RC upload, Insurance upload
NEW: /driver/kyc/bank      — Bank IFSC + account number, verification
NEW: /driver/kyc/complete  — All steps done, KYC submitted

Each screen shows a progress indicator (Step X of 5).
Allow "Skip for now" only on Stage 4 (bank setup).
Gate the "Post a trip" button behind Stage 2 + 3 completion.
```

---

## Part 6 — Clusterization: Design as a Paid Feature

### 6.1 What Clustering Solves

Without clustering, the platform operates on fixed predefined Routes. A driver sets a departure from Point A to Point B. This works for major intercity corridors but misses demand from passengers who are slightly off-route or in nearby clusters.

**Clustering solves this:** When enough passengers in a geographic area have similar destination intent (same town, same day, similar time), the system groups them into a "cluster" and surfaces it to nearby drivers as a single bookable offering — higher vehicle utilization, lower per-seat cost.

### 6.2 Algorithm Design

**Input:** Pending SEAT requests (from /requests endpoint) within a configurable time window (e.g., same 4-hour departure window)

**Algorithm: DBSCAN (Density-Based Spatial Clustering)**
- Parameters: `eps` = 15km (pickup radius), `minPts` = 3 (minimum passengers to form a cluster)
- Cluster on: pickup lat/lng (origin clusters)
- Secondary filter: destination similarity (same district or within 30km)

**Output per cluster:**
```json
{
  "clusterId": "clust_xyz",
  "centroidLat": 30.7333,
  "centroidLng": 79.0667,
  "radiusKm": 12,
  "passengerCount": 4,
  "destination": "Dehradun",
  "departureWindowStart": "2024-01-15T06:00:00",
  "departureWindowEnd": "2024-01-15T10:00:00",
  "estimatedFare": 1800,
  "requestIds": ["req_1", "req_2", "req_3", "req_4"]
}
```

**Driver sees:** In their Offerings tab → Clusters section → "4 passengers from Badrinath area to Dehradun tomorrow morning. ₹1800 estimated per seat." → Driver taps Accept → trip auto-created with pickup point = cluster centroid → passengers notified to confirm or decline the cluster assignment.

### 6.3 Cluster Service Design

**New service: `cluster-service` (Port 3013)**

Runs on a schedule (every 30 minutes via BullMQ cron job):
```
1. Fetch all open SEAT requests in the next 48 hours
2. Run DBSCAN clustering
3. For each new cluster: 
   a. Create ClusterGroup record in DB
   b. Emit event → notify eligible online drivers in the area
   c. Keep cluster active for 4 hours (configurable)
4. Expired clusters: mark as EXPIRED, requests return to individual pool
```

**New Prisma Models:**
```prisma
model ClusterGroup {
  id                String          @id @default(cuid())
  status            ClusterStatus   @default(OPEN)
  centroidLat       Float
  centroidLng       Float
  radiusKm          Float
  destinationLabel  String
  departureFrom     DateTime
  departureTo       DateTime
  passengerCount    Int
  estimatedFareMin  Int             // paise
  assignedDriverId  String?
  assignedTripId    String?
  expiresAt         DateTime
  createdAt         DateTime        @default(now())
  requests          ClusterRequest[]
}

model ClusterRequest {
  id        String       @id @default(cuid())
  clusterId String
  requestId String
  status    String       // PENDING | CONFIRMED | DECLINED
  cluster   ClusterGroup @relation(fields: [clusterId], references: [id])
}

enum ClusterStatus {
  OPEN
  ASSIGNED
  DEPARTED
  EXPIRED
  CANCELLED
}
```

**API Endpoints:**
```
GET  /clusters                    — list active clusters near driver (DRIVER role, JWT)
POST /clusters/:id/accept         — driver accepts a cluster
POST /clusters/:id/reject         — driver rejects a cluster
GET  /clusters/:id/passengers     — passenger list for a cluster
POST /clusters/:id/confirm-trip   — convert cluster to ScheduledTrip
GET  /passenger/clusters          — clusters available for my requests (PASSENGER)
POST /passenger/clusters/:id/confirm — passenger confirms cluster assignment
POST /passenger/clusters/:id/opt-out — passenger opts out of cluster
```

### 6.4 Paid Feature Gate

**Plan: BASIC** (default, free)
- Cluster feature UI locked in driver offerings tab
- No cluster suggestions generated for drivers on BASIC plan orgs (or independent drivers without a plan)

**Plan: GROWTH** (₹999/month per org)
- Clustering enabled for all drivers in the org
- Cluster suggestions generated and pushed to drivers
- Analytics: cluster fill rates, average earnings boost

**Plan: ENTERPRISE** (custom pricing)
- Custom cluster parameters (radius, min passengers, time windows)
- API access to cluster data
- White-label option

**Feature flag implementation:**
- `OrgPlan.GROWTH` unlocks clusters for all org members
- Independent drivers can subscribe to "Cluster Pack" (individual plan)
- `FeatureFlagAssignment` table already exists — add `clusters_enabled: true` flag
- cluster-service checks `org.plan !== BASIC` before generating suggestions
- api-gateway returns 402 with `{ code: "FEATURE_LOCKED", upgrade_url }` if driver tries to access cluster endpoints without the plan

---

## Part 7 — Testing Scenarios

### Scenario 1: Individual Vehicle Owner (Solo Driver)

**Profile:** A driver who owns one car and drives intercity routes independently.

**Setup:**
- Registers as DRIVER via phone OTP
- Completes KYC: Aadhaar, face match, DL, RC + Insurance for their one vehicle
- No org membership, `orgId = null`
- Sets up bank account for payouts

**Flow to test:**
1. Driver posts a trip (Rishikesh → Dehradun, 8 AM tomorrow, 1 front + 3 back)
2. Passenger searches and books 1 back seat (UPI)
3. Passenger pays via Razorpay
4. Driver sees booking in manifest
5. Driver goes online on departure morning
6. Driver departs, system shows trip as DEPARTED
7. Driver shares location → passenger tracks live on map
8. Driver completes trip
9. Booking marked COMPLETED, driver sees wallet credit
10. Passenger rates driver

**Edge cases to test:**
- Driver tries to go online with expired insurance → blocked with clear message
- Passenger tries to book last remaining seat simultaneously from two devices → Redis lock ensures only one succeeds
- Driver cancels trip after 1 booking → passenger refund triggered

---

### Scenario 2: Organization with Multiple Vehicles and Drivers

**Profile:** A travel company with 5 cars and 8 drivers, one owner managing everything.

**Setup:**
- Owner registers, is promoted to ORG_ADMIN by super admin
- Organization created in admin portal: "Pahadi Travels Pvt Ltd"
- Owner invites 8 drivers → each driver completes KYC independently
- Owner assigns 5 vehicles to the org fleet
- Owner sets routes the org covers

**Flow to test:**
1. Org admin logs into `/org-dashboard`
2. Views fleet status: 4 vehicles available, 1 in service
3. A booking request comes in (passenger books a seat on a driver's trip)
4. If org has "require approval" enabled: org admin sees pending booking, approves it
5. Org admin views today's manifest across all trips (all drivers)
6. Cash collection: driver marks cash collected after trip → org admin sees settlement status
7. Super admin logs into `/dashboard`, sees this org's performance vs others

**Edge cases to test:**
- Driver in org goes offline without completing trip → org admin gets alert
- Two drivers post overlapping trips on same route at same time → both allowed (no conflict)
- Org admin tries to access another org's data → 403 response
- Org plan is BASIC, driver tries to use cluster tab → locked with upgrade CTA

---

### Scenario 3: End User / Passenger

**Profile:** A commuter who uses the app to find intercity shared rides.

**Setup:**
- Registers as PASSENGER via phone OTP
- Name only required (no documents)
- Language set to Hindi

**Flow to test:**
1. Opens app, searches Haridwar → Dehradun on a date
2. Sees trip results (multiple drivers, different times and fares)
3. Selects a trip, sees driver info + vehicle + ratings
4. Books 1 front seat, enters name + phone + emergency contact
5. Pays via UPI (Razorpay)
6. Receives booking ticket with code
7. On day of travel, uses live tracking to monitor driver
8. After trip, rates driver

**Additional scenarios:**
- Passenger cancels 4 hours before departure → cancellation policy applies (e.g., 50% refund if > 4h, 0% if < 1h)
- Passenger submits a "full vehicle request" (wants to charter entire car) → goes to driver requests queue
- Passenger's phone has poor connectivity → PWA offline mode shows last known data
- Passenger tries to book a seat already taken → seat count check rejects it

---

## Part 8 — Complete Phased Roadmap

### Phase 0 — Foundation Fixes (Weeks 1–2, ~40 hours)

Priority: things that block everything else or are embarrassing in production.

| Task | Effort | Owner Layer |
|---|---|---|
| Integrate real SMS provider (MSG91 or Gupshup) for OTP | 8h | Backend |
| Wire notification-service to FCM/APNs for push delivery | 12h | Backend |
| Fix dispatch-service to use Redis (not in-memory) for request persistence | 8h | Backend |
| Add Redis pub/sub wiring between ride-service ↔ telemetry-service ↔ notification-service | 8h | Backend |
| Document S3/Supabase Storage signed URL generation for document uploads | 4h | Backend |

---

### Phase 1 — Core Flow Completion (Weeks 3–6, ~80 hours)

Make the end-to-end passenger booking → driver trip → completion flow solid.

| Task | Effort | Layer |
|---|---|---|
| Integrate Socket.IO client in PWA (replace all polling) | 12h | PWA |
| Implement real-time driver location push to tracking page | 8h | PWA + Backend |
| Connect admin portal login to real backend (admin-service) | 8h | Admin |
| Fix invoice PDF generation — expose a working GET /bookings/:id/invoice endpoint | 8h | Backend |
| Cash booking settlement: driver marks cash collected in manifest page | 6h | PWA + Backend |
| Cancellation policy enforcement: fare rules based on hours before departure | 8h | Backend |
| Driver rating submission after trip completion | 6h | PWA + Backend |
| Trip DEPARTED state: driver taps "Start trip" in manifest, location sharing begins | 6h | PWA + Backend |
| Passenger cancellation in-app with refund trigger (Razorpay refund API) | 8h | PWA + Backend |
| End-to-end test of full Flow A (book → pay → depart → complete → rate) | 10h | QA |

---

### Phase 2 — Organization Model (Weeks 7–10, ~100 hours)

Add the multi-tenancy layer so fleet operators can manage their business.

| Task | Effort | Layer |
|---|---|---|
| Prisma schema: add Organization, OrgMembership, OrgRole, OrgPlan | 4h | Backend |
| Add orgId to Driver and ScheduledTrip, write migration | 4h | Backend |
| Build org-service (CRUD for orgs, membership management) | 20h | Backend |
| Build admin-service (auth for ADMIN and ORG_ADMIN roles) | 16h | Backend |
| Admin portal: connect login to admin-service, store real JWT | 8h | Admin |
| Admin portal: connect all pages to real API (replace localStorage) | 20h | Admin |
| Admin portal: build Organizations management page | 12h | Admin |
| Admin portal: build Activity Monitor (SSE-based live feed) | 8h | Admin |
| Org-dashboard route group in admin portal (scoped pages) | 16h | Admin |
| Booking approval workflow: org admin accept/reject pending bookings | 12h | Admin + Backend |

---

### Phase 3 — Driver KYC & Compliance (Weeks 11–14, ~90 hours)

Make driver onboarding safe and complete.

| Task | Effort | Layer |
|---|---|---|
| Prisma schema: DriverKYC model, update Driver kycStatus enum | 4h | Backend |
| Build kyc-service skeleton with HyperVerge SDK integration | 12h | Backend |
| HyperVerge Aadhaar OTP verification flow | 10h | Backend + PWA |
| HyperVerge DL OCR + RTO verification flow | 12h | Backend + PWA |
| HyperVerge face match + liveness check | 10h | Backend + PWA |
| RC OCR + Vahan verification | 10h | Backend + PWA |
| Bank account penny drop verification | 8h | Backend + PWA |
| KYC progress screens in PWA (/driver/kyc/* flow) | 12h | PWA |
| Compliance gating: enforce KYC gates before go-online / post-trip | 6h | Backend |
| Admin portal: KYC review queue for manual override (rejected items) | 6h | Admin |

---

### Phase 4 — Clusterization (Weeks 15–20, ~80 hours)

Build clustering as a paid feature, gated by org plan.

| Task | Effort | Layer |
|---|---|---|
| Prisma schema: ClusterGroup, ClusterRequest models | 4h | Backend |
| Build cluster-service with DBSCAN algorithm | 20h | Backend |
| BullMQ cron job: run clustering every 30 minutes | 6h | Backend |
| Cluster offer push to eligible drivers via Socket.IO | 8h | Backend |
| Driver Offerings → Clusters tab: show nearby cluster offers | 12h | PWA |
| Passenger: notify when request matched to cluster, confirm/opt-out | 8h | PWA |
| Plan gating: 402 response for BASIC plan cluster access | 4h | Backend |
| Org admin: upgrade plan flow in admin portal | 8h | Admin |
| Analytics: cluster fill rate, average earnings boost metric | 10h | Admin + Backend |

---

### Phase 5 — Production Hardening (Weeks 21–24, ~70 hours)

| Task | Effort | Layer |
|---|---|---|
| API rate limiting (global + per-user) on gateway | 8h | Backend |
| Idempotency key cleanup cron (purge > 7 days old) | 2h | Backend |
| Structured logging (Pino) + request tracing (correlation IDs) | 8h | Backend |
| Sentry integration in PWA + backend for crash reporting | 6h | PWA + Backend |
| Load testing: simulate 100 simultaneous seat bookings (k6) | 8h | Backend |
| Security audit: JWT secret rotation, signed S3 URLs expiry, CORS lockdown | 8h | Backend |
| E2E test suite: Playwright for critical passenger + driver flows | 16h | PWA |
| Runbook: deployment, rollback, on-call escalation | 8h | DevOps |
| Docker Compose → proper staging + production deployment (Railway/Render) | 6h | DevOps |

---

## Part 9 — Summary Table

### What We Have (Stable)
- ✅ Onboarding / OTP flow (JWT issuance working)
- ✅ Passenger seat search + booking (Razorpay integrated)
- ✅ Driver trip posting + manifest view
- ✅ Online/offline toggle
- ✅ Location caching via Ola Maps (Redis)
- ✅ Booking concurrency control (Redis seat locks)
- ✅ Invoice PDF generation (PDFKit)
- ✅ Admin portal UI (all pages, dummy data)
- ✅ PWA install + basic offline support

### What We Have (Needs Wiring / Testing)
- ⚠️ Ride lifecycle (arrived/start/complete) — built, not tested
- ⚠️ Dispatch service — built, in-memory only, not production-ready
- ⚠️ Telemetry / live tracking — built, polling works, no WebSocket
- ⚠️ Notification service — token storage, no delivery
- ⚠️ Wallet ledger — populated, no payout trigger
- ⚠️ Driver compliance check — returns status, no enforcement

### What Needs to Be Built
- ❌ Real SMS provider for OTPs
- ❌ FCM/APNs push notification delivery
- ❌ Organization / multi-tenancy model
- ❌ Admin authentication (ADMIN + ORG_ADMIN roles)
- ❌ Admin portal → real backend connection
- ❌ KYC service with HyperVerge
- ❌ Bank account verification / payout setup
- ❌ Driver onboarding KYC screens in PWA
- ❌ Socket.IO real-time in PWA (replace polling)
- ❌ Cancellation policy enforcement
- ❌ Driver rating submission
- ❌ Cash settlement flow
- ❌ Cluster service + DBSCAN algorithm
- ❌ Cluster feature UI in PWA
- ❌ Plan-gated feature access

### Total Effort Estimate
| Phase | Weeks | Hours |
|---|---|---|
| Phase 0: Foundation | 1–2 | 40 |
| Phase 1: Core flow | 3–6 | 80 |
| Phase 2: Organizations | 7–10 | 100 |
| Phase 3: KYC | 11–14 | 90 |
| Phase 4: Clustering | 15–20 | 80 |
| Phase 5: Hardening | 21–24 | 70 |
| **Total** | **24 weeks** | **~460 hours** |

With a 2-person engineering team (1 backend, 1 frontend), this maps to approximately 6 months. With 3 engineers, approximately 4 months. Each phase produces a shippable increment — Phase 1 alone is a launchable MVP for the scheduled rides use case.

---

## Part 10 — Immediate Next Steps (This Week)

1. **Pick an SMS provider** — MSG91 (Indian, cheapest), Gupshup, or Twilio. Create account, get API key, replace the stub in onboarding-service. Estimated: 4 hours.

2. **Start Prisma migration for Organization** — Add the 3 models described in Part 4.1, run `prisma migrate dev`. This unblocks all org-admin work. Estimated: 2 hours.

3. **Wire the admin portal login to a real endpoint** — Even a hardcoded super admin credential is better than localStorage. Create `POST /admin/auth/login` in admin-service, update the login page. Estimated: 4 hours.

4. **Replace polling in tracking page with Socket.IO** — One page change in PWA, one existing gateway method. Immediate UX improvement. Estimated: 4 hours.

5. **Document the HyperVerge API keys and sandbox access needed** — This is the only third-party that requires contract/procurement before we can build. Start the HyperVerge trial account signup immediately so it doesn't block Phase 3.

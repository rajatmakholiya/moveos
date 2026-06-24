# Organization Onboarding Service Context

Last updated: May 22, 2026

This document is planning context for extending MoveOS so both fleet organizations and individual drivers can onboard, manage vehicles, complete KYC/compliance, and use the same driver-facing application.

It is intentionally a context document, not an implementation plan. Use it to create a scoped engineering plan, migration sequence, and product requirements.

## 1. Current Project Structure

MoveOS currently uses a NestJS backend monorepo with one public API Gateway and multiple internal services. The existing backend already supports individual driver onboarding and driver-owned vehicle assignment.

```text
moveos_backend/
  apps/
    api-gateway/
      src/
        controllers/
          onboarding.controller.ts
          drivers.controller.ts
          bookings.controller.ts
          trips.controller.ts
          requests.controller.ts
        clients/
          onboarding-service.client.ts
          driver-service.client.ts
          scheduling-service.client.ts
          booking-service.client.ts
    onboarding-service/
      src/
        onboarding.controller.ts
        onboarding.service.ts
        dto/onboarding.dto.ts
        guards/onboarding-token.guard.ts
        idempotency/idempotency.service.ts
    driver-service/
      src/
        driver.controller.ts
        driver.service.ts
        dto/driver.dto.ts
    scheduling-service/
    booking-service/
    ride-service/
    dispatch-service/
    telemetry-service/
    notification-service/
    location-service/
  libs/
    common/
      src/
        auth/
        config/
        http/
        prisma/
        redis/
  prisma/
    schema.prisma
    migrations/
  docs/
    APP_BIBLE.md
    FRONTEND_API_BINDING.md
```

Current relevant behavior:

- `apps/onboarding-service` creates short-lived onboarding sessions, verifies phone OTP, records consents, creates or links `User`, and creates either `Driver` or `Passenger` records.
- `apps/driver-service` owns driver profile, driver status, compliance read, wallet/earnings read models, document metadata, vehicle creation, driver-vehicle assignment, and active vehicle selection.
- `apps/api-gateway` exposes driver-facing `/api/onboarding/*` and `/api/drivers/me/*` routes, then forwards to internal services.
- `prisma/schema.prisma` already has `User`, `Driver`, `Passenger`, `Vehicle`, `DriverVehicleAssignment`, `DriverDocument`, `VehicleDocument`, `OnboardingSession`, `OnboardingConsent`, and `VerificationAttempt`.

## 2. Product Goal

Support two parallel onboarding paths without splitting the driver app into separate products:

1. Individual driver path:
   A driver signs up independently, completes phone verification, consents, profile, driver KYC, vehicle registration, vehicle document submission, and chooses an active vehicle.

2. Organization fleet path:
   An organization signs up or is created by an admin, verifies business details, creates branches or depots if needed, adds drivers, adds vehicles, maps drivers to vehicles, controls assignment rules, and monitors fleet readiness.

The same `Driver` and `Vehicle` entities should power trips, rides, bookings, telemetry, dispatch, compliance, and earnings. Organization features should add ownership, membership, governance, and assignment policy rather than creating a separate driver system.

## 3. Ownership Model

The most important design decision is separating these concepts:

- User identity: who can log in.
- Driver profile: who can drive.
- Vehicle asset: what can be driven.
- Ownership: who owns or controls the vehicle.
- Assignment: which driver is allowed to use which vehicle.
- Active operation: which vehicle a driver is currently using.
- Compliance: whether the driver, vehicle, and assignment are allowed to operate.

Recommended model:

- `User` remains the login identity with roles such as `DRIVER`, `ADMIN`, `PASSENGER`, and future org roles.
- `Driver` remains the operational driver profile.
- `Vehicle` remains the operational vehicle profile.
- Add `Organization` as a legal or fleet entity.
- Add `OrganizationMember` to connect users to organizations with roles.
- Add `OrganizationDriver` or use `Driver.organizationLinks` to connect drivers to organizations.
- Add `OrganizationVehicle` or ownership fields to connect vehicles to organizations.
- Extend `DriverVehicleAssignment` to represent both individual and organization-mediated assignments.

Avoid creating separate `OrgDriver` and `IndividualDriver` tables. That will duplicate ride, telemetry, compliance, and booking integrations.

## 4. Target Service Responsibility

The existing `onboarding-service` should remain responsible for identity onboarding sessions, OTP, consents, and turning a verified phone into an authenticated user.

Organization onboarding can be handled in one of two ways:

1. Extend `onboarding-service` with organization onboarding modules.
   This is simpler initially because onboarding session, idempotency, invite, and verification flows are related.

2. Add a new `organization-service` for post-identity fleet management.
   This is cleaner as the domain grows because organization management is long-lived CRUD and policy, not only onboarding.

Recommended boundary:

- `onboarding-service`: identity onboarding, invited driver onboarding, organization signup initiation, phone OTP, org admin first-user bootstrap, onboarding state machine.
- New `organization-service`: organization profile, branches, memberships, invitations, fleet vehicles, org-driver links, assignment policies, audit events.
- Existing `driver-service`: driver profile, driver documents, vehicle documents, operational vehicle selection, compliance gating, active driver-vehicle assignment enforcement.

If the first implementation must be smaller, add organization modules inside `onboarding-service` but name the domain clearly so it can be extracted later:

```text
apps/onboarding-service/src/
  organization-onboarding/
  invitations/
  onboarding/
```

## 5. Roles And Actors

Core actors:

- Platform admin: MoveOS internal operator. Can approve organizations, resolve conflicts, inspect compliance, and override blocked states.
- Organization owner: Primary business owner. Can manage organization profile, billing, admins, drivers, vehicles, and assignments.
- Organization admin or fleet manager: Can invite drivers, add vehicles, upload documents, and map drivers to vehicles according to permissions.
- Organization driver: A driver linked to an organization. May be invited by the org or may already have an individual account.
- Individual driver: A driver not controlled by an organization. Can onboard, submit KYC, add their own vehicle, and drive independently.
- Passenger/rider: Existing passenger flow should remain unaffected.

Suggested org member roles:

```text
OWNER
ADMIN
FLEET_MANAGER
COMPLIANCE_MANAGER
DRIVER
VIEWER
```

These are not the same as `UserRole`. `UserRole` is the broad application identity. Organization roles should be scoped to one organization.

## 6. Use Cases

### 6.1 Individual Driver Onboards

Flow:

1. Driver creates onboarding session with `role: "DRIVER"` and no organization invite.
2. Driver verifies phone OTP.
3. Driver submits name/profile and consents.
4. Backend creates or links `User` and `Driver`.
5. Driver uploads KYC documents.
6. Driver creates a vehicle.
7. Driver uploads vehicle documents.
8. Compliance approves driver and vehicle.
9. Driver activates a vehicle and goes online.

Current backend already supports steps 1-4 and part of 6-9. The missing parts are production KYC workflows, document review, ownership semantics, and richer compliance status.

### 6.2 Organization Onboards First Admin

Flow:

1. Organization owner starts organization onboarding.
2. Owner verifies phone OTP.
3. Owner submits organization legal profile.
4. Owner submits required business documents.
5. Backend creates `Organization`, owner `User`, and `OrganizationMember`.
6. Organization remains `PENDING_REVIEW` until approved by platform admin or automated checks.
7. Once approved, organization can add drivers and vehicles.

Required organization data:

- Legal name
- Trade name
- Business type
- GSTIN or tax identifier if applicable
- Registration number if applicable
- Registered address
- Operating city/region
- Primary contact name, phone, email
- Payout or billing profile, when payments are in scope
- Document set: registration certificate, GST/tax document, address proof, owner ID, authorization letter if needed

### 6.3 Organization Invites A New Driver

Flow:

1. Org admin creates invitation with phone number and optional name.
2. Backend creates invitation token and stores invitation status.
3. Driver opens app through invite link or enters phone.
4. Onboarding session recognizes `organizationInviteId`.
5. Driver verifies phone OTP.
6. Backend creates or links `User` and `Driver`.
7. Backend creates org-driver link as `INVITED` or `ACTIVE`, depending on policy.
8. Driver completes personal KYC if not already approved.
9. Org can assign vehicles after driver is approved or before approval with `PENDING_COMPLIANCE` assignment status.

Important rules:

- Invite phone must match verified phone unless a platform admin overrides.
- An invite should expire.
- Re-sending invites should be idempotent by phone plus organization.
- An invited driver should not lose independent-driver capability unless explicitly restricted by policy.

### 6.4 Organization Links Existing Individual Driver

Flow:

1. Org admin invites an existing driver by phone.
2. Existing driver authenticates and accepts the organization link.
3. Backend creates `OrganizationDriver` membership.
4. Driver can switch operating context between individual and organization, if policy allows.

Important rules:

- Existing driver KYC can be reused only if the organization's compliance policy accepts it.
- Organization may require additional documents.
- Driver consent should be captured for sharing profile, KYC, telemetry, trips, and earnings data with the organization.

### 6.5 Organization Adds Vehicle

Flow:

1. Org admin creates vehicle record with plate and type.
2. Backend checks for plate uniqueness.
3. If plate exists, conflict resolution is required.
4. Org uploads vehicle documents.
5. Vehicle remains `INACTIVE` or `PENDING_COMPLIANCE`.
6. Compliance approval makes vehicle eligible for assignment.

Important rules:

- A vehicle should not silently move from an individual driver to an organization.
- Plate uniqueness must stay global.
- Ownership transfer should be an explicit workflow.
- Documents may differ by vehicle type and region.

### 6.6 Organization Assigns Driver To Vehicle

Flow:

1. Org admin selects driver and vehicle.
2. Backend validates both belong to or are linked with the organization.
3. Backend validates assignment policy.
4. Backend creates `DriverVehicleAssignment`.
5. Assignment is active for operation only when driver, vehicle, organization, and assignment compliance are clear.

Assignment modes:

- Permanent assignment: one driver primarily uses one vehicle.
- Shared vehicle: multiple drivers can be assigned but only one can be active at a time.
- Shift assignment: driver can use a vehicle only during a scheduled time window.
- Temporary assignment: limited period or single-trip use.

Current `DriverVehicleAssignment.active` is enough for individual-driver active selection, but organization fleets need additional fields such as status, source, organizationId, assignedByUserId, start/end time, and policy metadata.

### 6.7 Driver Uses Vehicle In App

Flow:

1. Driver logs in.
2. App fetches driver profile and available vehicles.
3. Backend returns vehicles from individual ownership plus organization assignments.
4. Driver selects active operating context and vehicle.
5. Backend checks compliance and assignment rules.
6. Driver goes online.

The app should support:

- "Drive independently" context.
- "Drive for Organization A" context.
- Vehicle list filtered by selected context.
- Clear blocked reasons when driver cannot go online.

### 6.8 KYC And Compliance

Compliance must evaluate multiple levels:

- User identity verification
- Driver KYC
- Driver license validity
- Driver background check, if required
- Vehicle documents: RC, insurance, permit, pollution certificate, fitness certificate
- Organization business verification
- Organization operating status
- Assignment validity
- Region/service eligibility

The final operational check should answer:

```text
Can this driver use this vehicle for this service in this operating context right now?
```

The existing `driver-service.getOperationalVehicle` is the right place to enforce the final gate before going online or accepting work, but it needs richer assignment and organization context.

## 7. Proposed Data Model Additions

Suggested Prisma additions:

```prisma
enum OrganizationStatus {
  DRAFT
  PENDING_REVIEW
  ACTIVE
  SUSPENDED
  REJECTED
}

enum OrganizationMemberRole {
  OWNER
  ADMIN
  FLEET_MANAGER
  COMPLIANCE_MANAGER
  DRIVER
  VIEWER
}

enum OrganizationMemberStatus {
  INVITED
  ACTIVE
  SUSPENDED
  REMOVED
}

enum OrganizationDriverStatus {
  INVITED
  PENDING_DRIVER_ACCEPTANCE
  PENDING_COMPLIANCE
  ACTIVE
  SUSPENDED
  REMOVED
}

enum VehicleOwnershipType {
  INDIVIDUAL
  ORGANIZATION
  LEASED
  THIRD_PARTY
}

enum AssignmentStatus {
  PENDING_COMPLIANCE
  ACTIVE
  SUSPENDED
  ENDED
}

model Organization {
  id               String             @id @default(cuid())
  legalName        String
  tradeName        String?
  status           OrganizationStatus @default(DRAFT)
  taxId            String?
  registrationNo   String?
  primaryPhone     String?
  primaryEmail     String?
  addressJson      Json?
  operatingRegions Json?
  metadataJson     Json?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
}

model OrganizationMember {
  id             String                   @id @default(cuid())
  organizationId String
  userId         String
  role           OrganizationMemberRole
  status         OrganizationMemberStatus @default(INVITED)
  invitedById    String?
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt

  @@unique([organizationId, userId])
  @@index([userId])
}

model OrganizationDriver {
  id             String                   @id @default(cuid())
  organizationId String
  driverId       String
  status         OrganizationDriverStatus @default(INVITED)
  invitedById    String?
  acceptedAt     DateTime?
  startedAt      DateTime?
  endedAt        DateTime?
  metadataJson   Json?
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt

  @@unique([organizationId, driverId])
  @@index([driverId])
}

model OrganizationInvitation {
  id                  String    @id @default(cuid())
  organizationId      String
  phone               String
  role                String
  inviteTokenHash     String    @unique
  status              String
  expiresAt           DateTime
  acceptedByUserId    String?
  acceptedAt          DateTime?
  createdByUserId     String?
  createdAt           DateTime  @default(now())
}

model OrganizationDocument {
  id             String         @id @default(cuid())
  organizationId String
  type           String
  url            String
  status         DocumentStatus @default(PENDING)
  expiresAt      DateTime?
  createdAt      DateTime       @default(now())
}
```

Suggested changes to existing models:

```prisma
model Vehicle {
  id                  String @id @default(cuid())
  organizationId      String?
  ownerDriverId       String?
  ownershipType       VehicleOwnershipType @default(INDIVIDUAL)
  // existing fields remain
}

model DriverVehicleAssignment {
  id                 String @id @default(cuid())
  organizationId     String?
  assignedByUserId   String?
  status             AssignmentStatus @default(ACTIVE)
  startsAt           DateTime?
  endsAt             DateTime?
  source             String?
  policyJson         Json?
  active             Boolean @default(false)
  // existing driverId, vehicleId, relations remain
}

model OnboardingSession {
  organizationId       String?
  organizationInviteId String?
  onboardingKind       String?
  // existing fields remain
}
```

Decisions to make during planning:

- Whether `Vehicle.organizationId` is enough, or whether a separate `OrganizationVehicle` table is needed for history and transfers.
- Whether a driver can be active in multiple organizations at once.
- Whether a vehicle can be assigned across organizations through leasing or marketplace flows.
- Whether an organization can own passenger/agent users later.

## 8. API Surface To Plan

Public gateway routes should remain the only frontend surface.

Suggested organization routes:

```text
POST   /api/organizations/onboarding/session
POST   /api/organizations/onboarding/profile
POST   /api/organizations/onboarding/business
POST   /api/organizations/onboarding/documents
POST   /api/organizations/onboarding/complete

GET    /api/organizations/me
PATCH  /api/organizations/:organizationId

POST   /api/organizations/:organizationId/invitations
GET    /api/organizations/:organizationId/invitations
POST   /api/organizations/invitations/:inviteToken/accept

GET    /api/organizations/:organizationId/drivers
POST   /api/organizations/:organizationId/drivers
PATCH  /api/organizations/:organizationId/drivers/:driverId

GET    /api/organizations/:organizationId/vehicles
POST   /api/organizations/:organizationId/vehicles
PATCH  /api/organizations/:organizationId/vehicles/:vehicleId
POST   /api/organizations/:organizationId/vehicles/:vehicleId/documents

POST   /api/organizations/:organizationId/assignments
PATCH  /api/organizations/:organizationId/assignments/:assignmentId
DELETE /api/organizations/:organizationId/assignments/:assignmentId

GET    /api/drivers/me/operating-contexts
POST   /api/drivers/me/operating-context
GET    /api/drivers/me/vehicles
POST   /api/drivers/me/vehicles/active
```

Internal service routes can mirror these behind the gateway.

## 9. Authorization Rules

Authorization should check both global user role and organization-scoped role.

Examples:

- Only `OWNER` or `ADMIN` can update organization legal profile.
- `FLEET_MANAGER` can invite drivers, add vehicles, and create assignments.
- `COMPLIANCE_MANAGER` can upload and review documents if review is internal to the org.
- `DRIVER` can see only their own assignments and org context.
- Platform admin can inspect and override all organization statuses.

Implementation note:

- Keep JWT compact. Include `sub`, broad `role`, and driver/passenger ids as today.
- Do not place all organization memberships in JWT if they can change often.
- Load org authorization from database/cache per request or use short TTL claims.

## 10. Compliance And Operational Gating

Before a driver goes online, accepts dispatch, posts a scheduled trip, or starts a ride, the backend should verify:

- Driver exists and is active.
- Driver KYC is approved.
- Driver compliance status is clear.
- Vehicle exists and is active.
- Vehicle compliance status is clear.
- Driver is assigned to vehicle.
- Assignment status is active.
- Assignment is within time window, if applicable.
- Organization is active, if assignment belongs to an organization.
- Driver is active in that organization, if assignment belongs to an organization.
- Selected service type is allowed for the driver, vehicle, and organization.

Recommended response shape for blocked states:

```json
{
  "canOperate": false,
  "blockedReasons": [
    {
      "code": "ORGANIZATION_PENDING_REVIEW",
      "message": "Organization verification is pending",
      "owner": "ORGANIZATION"
    }
  ],
  "nextActions": [
    {
      "code": "UPLOAD_VEHICLE_INSURANCE",
      "label": "Upload insurance document"
    }
  ]
}
```

## 11. Driver App Experience

The application should stay open to individual drivers. Do not force every driver into an organization.

Driver home should understand operating contexts:

- Individual context: driver-owned vehicles and personal earnings.
- Organization context: organization-assigned vehicles, org policies, fleet trips, and possibly org-owned earnings.

Minimum app states:

- No profile yet
- Profile created, KYC pending
- KYC rejected
- No vehicle available
- Vehicle document pending
- Organization invite pending acceptance
- Organization suspended
- Ready to go online

Important UX requirement:

- A driver must always understand why they cannot go online and who can fix it: driver, organization admin, or platform admin.

## 12. Admin/Fleet Experience

Organization admin should be able to:

- Complete organization profile.
- Upload organization documents.
- Invite drivers.
- See driver KYC status.
- Add vehicles.
- Upload vehicle documents.
- Assign drivers to vehicles.
- Suspend or remove drivers.
- Suspend or remove vehicles.
- View blocked reasons for every driver-vehicle pair.
- Audit assignment history.

MoveOS platform admin should be able to:

- Approve or reject organizations.
- Review organization documents.
- Resolve plate ownership conflicts.
- Override or suspend organizations, drivers, and vehicles.
- View audit logs.

## 13. Edge Cases To Plan Carefully

- Existing individual driver is invited by an organization.
- Driver leaves organization but keeps individual account.
- Organization removes driver while driver is online.
- Vehicle is assigned to two drivers for overlapping shift windows.
- Vehicle plate already exists under another driver or organization.
- Vehicle ownership transfer from individual to organization.
- Driver has approved KYC but organization requires stricter checks.
- Organization is suspended while active trips exist.
- Driver is suspended by platform but still active in org membership.
- Vehicle document expires during an active assignment.
- Phone number belongs to an existing passenger account.
- Same user needs to be both passenger and driver in future.
- Org admin invites wrong phone number.
- Invite expires after driver has started onboarding.
- Offline sync causes duplicate vehicle or assignment submissions.
- Driver changes active organization context while online.
- Scheduled trip uses a vehicle assignment that expires before departure.

## 14. Events And Audit Trail

Organization and assignment changes should emit audit events. These can start as database records and later become application events.

Important events:

- `organization.created`
- `organization.submitted_for_review`
- `organization.approved`
- `organization.suspended`
- `organization.member.invited`
- `organization.member.accepted`
- `organization.driver.linked`
- `organization.driver.suspended`
- `organization.vehicle.created`
- `organization.vehicle.document_uploaded`
- `organization.vehicle.approved`
- `driver_vehicle_assignment.created`
- `driver_vehicle_assignment.activated`
- `driver_vehicle_assignment.suspended`
- `driver_vehicle_assignment.ended`

Audit fields:

- actorUserId
- organizationId
- targetType
- targetId
- action
- beforeJson
- afterJson
- reason
- createdAt

## 15. Migration Strategy

Recommended phased rollout:

### Phase 1: Schema Foundations

- Add `Organization`, `OrganizationMember`, `OrganizationDriver`, `OrganizationInvitation`, and organization document models.
- Add organization-aware fields to `Vehicle`, `DriverVehicleAssignment`, and `OnboardingSession`.
- Keep existing individual-driver behavior unchanged.

### Phase 2: Organization Admin Bootstrap

- Add organization onboarding APIs.
- Create first owner/admin user.
- Capture organization profile and documents.
- Add platform approval status.

### Phase 3: Fleet Driver Invites

- Add invitation creation and acceptance.
- Link invited drivers to organizations.
- Reuse existing phone OTP and driver creation flow.
- Capture consent for sharing driver data with organization.

### Phase 4: Org Vehicles And Assignments

- Add org vehicle CRUD.
- Add org vehicle documents.
- Add driver-vehicle assignment policy.
- Extend `driver-service.getVehicles` to include individual plus org-assigned vehicles.

### Phase 5: Operational Context

- Add driver operating contexts.
- Require selected context before going online if driver has more than one context.
- Extend compliance gate to include organization and assignment validity.

### Phase 6: Review, Audit, And Hardening

- Add audit events.
- Add document review workflows.
- Add conflict resolution for vehicle ownership.
- Add tests for org and individual paths.

## 16. Testing Matrix

Minimum test coverage for planning:

- Individual driver can onboard without organization fields.
- Passenger onboarding remains unaffected.
- Organization owner can create organization onboarding session and complete first admin setup.
- Organization can invite a new driver.
- Existing individual driver can accept organization invite.
- Organization can add vehicle and assign it to linked driver.
- Driver cannot activate organization vehicle without valid organization link.
- Driver cannot go online with suspended organization.
- Driver cannot go online with expired assignment window.
- Driver can still operate individually after leaving an organization, if they have valid individual vehicle.
- Duplicate vehicle plate returns explicit conflict.
- Idempotency works for invite creation, vehicle creation, and assignment creation.

## 17. Open Product Decisions

- Can one phone number own multiple roles: passenger, driver, org admin?
- Should `UserRole` become multi-role instead of a single enum?
- Can a driver work for multiple organizations at once?
- Can one vehicle be leased or shared across organizations?
- Who receives earnings for organization trips: driver wallet, organization wallet, or split ledger?
- Does organization KYC approval block all drivers or only org-owned vehicles?
- Does an organization control driver documents, or only view driver-submitted documents?
- What happens to active trips when organization, vehicle, driver, or assignment is suspended?
- What service types are available to org fleets versus individual drivers?
- Does the organization onboarding need billing and contracts in the first release?

## 18. Planning Recommendation

The safest plan is to preserve the current individual driver path and add organization context as an overlay:

- Keep `Driver` and `Vehicle` as shared operational models.
- Add organization ownership and membership models.
- Extend assignment instead of replacing it.
- Keep final operational checks in `driver-service`.
- Use `onboarding-service` for identity and invite acceptance.
- Add `organization-service` when organization CRUD and fleet management become substantial.

This approach keeps the app open for independent drivers while allowing organizations to manage fleets, map drivers to vehicles, and enforce KYC/compliance without breaking existing ride, dispatch, telemetry, booking, and scheduling flows.

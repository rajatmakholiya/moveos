DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationStatus') THEN
    CREATE TYPE "OrganizationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationMemberRole') THEN
    CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'FLEET_MANAGER', 'COMPLIANCE_MANAGER', 'DRIVER', 'VIEWER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationMemberStatus') THEN
    CREATE TYPE "OrganizationMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationDriverStatus') THEN
    CREATE TYPE "OrganizationDriverStatus" AS ENUM ('INVITED', 'PENDING_DRIVER_ACCEPTANCE', 'PENDING_COMPLIANCE', 'ACTIVE', 'SUSPENDED', 'REMOVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleOwnershipType') THEN
    CREATE TYPE "VehicleOwnershipType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION', 'LEASED', 'THIRD_PARTY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssignmentStatus') THEN
    CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING_COMPLIANCE', 'ACTIVE', 'SUSPENDED', 'ENDED');
  END IF;
END $$;

ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "ownerDriverId" TEXT,
  ADD COLUMN IF NOT EXISTS "ownershipType" "VehicleOwnershipType" NOT NULL DEFAULT 'INDIVIDUAL';

ALTER TABLE "DriverVehicleAssignment"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "policyJson" JSONB;

CREATE INDEX IF NOT EXISTS "DriverVehicleAssignment_organizationId_idx" ON "DriverVehicleAssignment"("organizationId");

ALTER TABLE "OnboardingSession"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "organizationInviteId" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingKind" TEXT;

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'DRAFT',
  "taxId" TEXT,
  "registrationNo" TEXT,
  "primaryPhone" TEXT,
  "primaryEmail" TEXT,
  "addressJson" JSONB,
  "operatingRegions" JSONB,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Organization_status_idx" ON "Organization"("status");

CREATE TABLE IF NOT EXISTS "OrganizationMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationMemberRole" NOT NULL,
  "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'INVITED',
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

CREATE TABLE IF NOT EXISTS "OrganizationDriver" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "status" "OrganizationDriverStatus" NOT NULL DEFAULT 'INVITED',
  "invitedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDriver_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationDriver_organizationId_driverId_key" ON "OrganizationDriver"("organizationId", "driverId");
CREATE INDEX IF NOT EXISTS "OrganizationDriver_driverId_idx" ON "OrganizationDriver"("driverId");

CREATE TABLE IF NOT EXISTS "OrganizationVehicle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "ownershipType" "VehicleOwnershipType" NOT NULL DEFAULT 'ORGANIZATION',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationVehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationVehicle_organizationId_vehicleId_key" ON "OrganizationVehicle"("organizationId", "vehicleId");
CREATE INDEX IF NOT EXISTS "OrganizationVehicle_vehicleId_idx" ON "OrganizationVehicle"("vehicleId");

CREATE TABLE IF NOT EXISTS "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "inviteTokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedByUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_inviteTokenHash_key" ON "OrganizationInvitation"("inviteTokenHash");
CREATE INDEX IF NOT EXISTS "OrganizationInvitation_organizationId_phone_idx" ON "OrganizationInvitation"("organizationId", "phone");

CREATE TABLE IF NOT EXISTS "OrganizationDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrganizationDocument_organizationId_type_idx" ON "OrganizationDocument"("organizationId", "type");

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "organizationId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "action" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

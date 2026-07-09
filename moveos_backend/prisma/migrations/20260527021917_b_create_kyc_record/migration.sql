-- Repair migration: the KycRecord model (and its enums) were introduced during
-- development via `prisma db push` and never captured as a migration, which
-- breaks fresh deploys — the very next migration (vehicle_master_fields)
-- backfills Vehicle.kycStatus FROM "KycRecord". This recreates that DDL at the
-- correct point in the chain. Guards (IF NOT EXISTS / duplicate_object) keep it
-- a no-op on databases where db push already created the objects.

DO $$ BEGIN
  CREATE TYPE "KycEntityType" AS ENUM ('ORGANIZATION', 'DRIVER', 'VEHICLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KycDocumentType" AS ENUM (
    'GST_CERTIFICATE',
    'PAN_CARD',
    'AADHAAR',
    'TRADE_LICENSE',
    'VEHICLE_REGISTRATION',
    'VEHICLE_INSURANCE',
    'POLLUTION_CERTIFICATE',
    'DRIVING_LICENSE',
    'BANK_ACCOUNT',
    'CANCELLED_CHEQUE',
    'INCORPORATION_CERTIFICATE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "KycRecord" (
    "id" TEXT NOT NULL,
    "entityType" "KycEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "documentNo" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KycRecord_entityType_entityId_idx" ON "KycRecord"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "KycRecord_status_idx" ON "KycRecord"("status");

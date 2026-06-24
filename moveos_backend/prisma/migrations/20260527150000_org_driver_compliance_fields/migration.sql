-- Step 4: Compliance/activation fields on OrganizationDriver for super admin verification flow

ALTER TABLE "OrganizationDriver"
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBySuperAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "complianceApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "complianceRejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "complianceRejectionReason" TEXT;

-- Add driver-specific fields to OrganizationInvitation
ALTER TABLE "OrganizationInvitation"
  ADD COLUMN IF NOT EXISTS "invitedName"        TEXT,
  ADD COLUMN IF NOT EXISTS "invitedEmail"       TEXT,
  ADD COLUMN IF NOT EXISTS "note"               TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- Additional indexes for driver invitation query patterns
CREATE INDEX IF NOT EXISTS "OrganizationInvitation_organizationId_phone_status_idx"
  ON "OrganizationInvitation"("organizationId", "phone", "status");

CREATE INDEX IF NOT EXISTS "OrganizationInvitation_status_idx"
  ON "OrganizationInvitation"("status");

CREATE INDEX IF NOT EXISTS "OrganizationInvitation_expiresAt_idx"
  ON "OrganizationInvitation"("expiresAt");

CREATE INDEX IF NOT EXISTS "OrganizationInvitation_createdByUserId_idx"
  ON "OrganizationInvitation"("createdByUserId");

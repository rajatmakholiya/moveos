-- Add publicInviteRef: non-sensitive reusable URL reference for invite links
ALTER TABLE "OrganizationInvitation"
  ADD COLUMN IF NOT EXISTS "publicInviteRef" TEXT;

-- Unique index on publicInviteRef (used for fast lookup + uniqueness enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_publicInviteRef_key"
  ON "OrganizationInvitation"("publicInviteRef");

-- OTP state columns stored per-invitation (self-contained invite OTP flow)
ALTER TABLE "OrganizationInvitation"
  ADD COLUMN IF NOT EXISTS "otpCodeHash"     TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiresAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "otpLastSentAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "otpAttemptCount" INTEGER NOT NULL DEFAULT 0;

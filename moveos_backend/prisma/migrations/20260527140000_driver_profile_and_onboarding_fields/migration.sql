-- Step 3: Driver profile fields on Driver table + onboardingSubmittedAt on OrganizationDriver

ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "dob" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "currentAddressJson" JSONB,
  ADD COLUMN IF NOT EXISTS "permanentAddressJson" JSONB,
  ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT,
  ADD COLUMN IF NOT EXISTS "profilePhotoFileId" TEXT;

ALTER TABLE "OrganizationDriver"
  ADD COLUMN IF NOT EXISTS "onboardingSubmittedAt" TIMESTAMP(3);

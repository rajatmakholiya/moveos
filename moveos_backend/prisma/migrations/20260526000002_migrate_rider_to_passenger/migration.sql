-- Migrate all users with legacy RIDER role to canonical PASSENGER role.
-- RIDER was used before PASSENGER was established. All new passenger onboarding
-- already issues PASSENGER tokens; this migration brings existing data in line.
-- The RIDER enum value is intentionally kept in the UserRole type so that
-- any cached tokens containing role='RIDER' can still be decoded — they are
-- normalized to PASSENGER at JWT validation time in jwt.strategy.ts.
UPDATE "User"
SET role = 'PASSENGER'::"UserRole"
WHERE role = 'RIDER'::"UserRole";

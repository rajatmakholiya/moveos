-- Add ORG_ADMIN to UserRole enum (C1.4)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ORG_ADMIN'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'ORG_ADMIN';
  END IF;
END $$;

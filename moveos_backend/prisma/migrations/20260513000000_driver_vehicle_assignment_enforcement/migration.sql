ALTER TABLE "ScheduledTrip"
  ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;

CREATE INDEX IF NOT EXISTS "ScheduledTrip_vehicleId_idx" ON "ScheduledTrip"("vehicleId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ScheduledTrip_vehicleId_fkey'
  ) THEN
    ALTER TABLE "ScheduledTrip"
      ADD CONSTRAINT "ScheduledTrip_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

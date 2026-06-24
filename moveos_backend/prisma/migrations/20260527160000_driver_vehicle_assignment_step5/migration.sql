-- Step 5: Vehicle-driver assignment enrichment
-- Add assignmentType, note, removalReason fields and supporting indexes
-- Uses IF NOT EXISTS guards so this is safe to replay on already-migrated databases.

ALTER TABLE "DriverVehicleAssignment"
  ADD COLUMN IF NOT EXISTS "assignmentType"  TEXT NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN IF NOT EXISTS "note"            TEXT,
  ADD COLUMN IF NOT EXISTS "removalReason"   TEXT;

-- Supporting indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "DriverVehicleAssignment_orgId_vehicleId_status_idx"
  ON "DriverVehicleAssignment" ("organizationId", "vehicleId", "status");

CREATE INDEX IF NOT EXISTS "DriverVehicleAssignment_orgId_driverId_status_idx"
  ON "DriverVehicleAssignment" ("organizationId", "driverId", "status");

CREATE INDEX IF NOT EXISTS "DriverVehicleAssignment_vehicleId_type_status_idx"
  ON "DriverVehicleAssignment" ("vehicleId", "assignmentType", "status");

CREATE INDEX IF NOT EXISTS "DriverVehicleAssignment_driverId_status_idx"
  ON "DriverVehicleAssignment" ("driverId", "status");

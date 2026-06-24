ALTER TABLE "Route"
  ADD COLUMN "fromCity" TEXT,
  ADD COLUMN "toCity" TEXT,
  ADD COLUMN "routeName" TEXT,
  ADD COLUMN "baseFarePaise" INTEGER,
  ADD COLUMN "estimatedDurationMinutes" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "metadataJson" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "Route"
SET
  "fromCity" = "originLabel",
  "toCity" = "destinationLabel",
  "routeName" = "name",
  "baseFarePaise" = "baseBackPrice",
  "estimatedDurationMinutes" = "estimatedHours" * 60,
  "status" = CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'INACTIVE' END,
  "updatedAt" = "createdAt"
WHERE "fromCity" IS NULL;

ALTER TABLE "Route"
  ALTER COLUMN "fromCity" SET NOT NULL,
  ALTER COLUMN "toCity" SET NOT NULL,
  ALTER COLUMN "routeName" SET NOT NULL,
  ALTER COLUMN "baseFarePaise" SET NOT NULL,
  ALTER COLUMN "estimatedDurationMinutes" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE UNIQUE INDEX "Route_fromCity_toCity_key" ON "Route"("fromCity", "toCity");
CREATE INDEX "Route_status_idx" ON "Route"("status");

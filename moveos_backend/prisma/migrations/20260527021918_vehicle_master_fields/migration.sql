-- Add production-grade vehicle master fields while preserving existing records.
CREATE TYPE "VehicleDocumentStatus" AS ENUM ('MISSING', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

ALTER TABLE "Vehicle"
  ADD COLUMN "vehicleNumber" TEXT,
  ADD COLUMN "vehicleType" TEXT,
  ADD COLUMN "fuelType" TEXT,
  ADD COLUMN "make" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "variant" TEXT,
  ADD COLUMN "manufacturingYear" INTEGER,
  ADD COLUMN "registrationDate" TIMESTAMP(3),
  ADD COLUMN "registrationState" TEXT,
  ADD COLUMN "chassisNumber" TEXT,
  ADD COLUMN "engineNumber" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "totalSeats" INTEGER,
  ADD COLUMN "frontSeats" INTEGER,
  ADD COLUMN "backSeats" INTEGER,
  ADD COLUMN "luggageCapacityKg" INTEGER,
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerPhone" TEXT,
  ADD COLUMN "ownerAddress" TEXT,
  ADD COLUMN "commercialPermitNumber" TEXT,
  ADD COLUMN "permitValidFrom" TIMESTAMP(3),
  ADD COLUMN "permitValidTill" TIMESTAMP(3),
  ADD COLUMN "fitnessCertificateNumber" TEXT,
  ADD COLUMN "fitnessValidTill" TIMESTAMP(3),
  ADD COLUMN "pollutionCertificateNumber" TEXT,
  ADD COLUMN "pollutionValidTill" TIMESTAMP(3),
  ADD COLUMN "insurancePolicyNumber" TEXT,
  ADD COLUMN "insuranceValidTill" TIMESTAMP(3),
  ADD COLUMN "documentStatus" "VehicleDocumentStatus" NOT NULL DEFAULT 'MISSING',
  ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';

UPDATE "Vehicle"
SET
  "vehicleNumber" = "plate",
  "vehicleType" = "type",
  "documentStatus" = CASE
    WHEN EXISTS (SELECT 1 FROM "VehicleDocument" vd WHERE vd."vehicleId" = "Vehicle"."id") THEN 'PENDING'::"VehicleDocumentStatus"
    ELSE 'MISSING'::"VehicleDocumentStatus"
  END,
  "kycStatus" = CASE
    WHEN EXISTS (SELECT 1 FROM "KycRecord" kr WHERE kr."entityType" = 'VEHICLE' AND kr."entityId" = "Vehicle"."id" AND kr."status" = 'APPROVED') THEN 'APPROVED'::"KycStatus"
    WHEN EXISTS (SELECT 1 FROM "KycRecord" kr WHERE kr."entityType" = 'VEHICLE' AND kr."entityId" = "Vehicle"."id" AND kr."status" = 'REJECTED') THEN 'REJECTED'::"KycStatus"
    WHEN EXISTS (SELECT 1 FROM "KycRecord" kr WHERE kr."entityType" = 'VEHICLE' AND kr."entityId" = "Vehicle"."id") THEN 'PENDING'::"KycStatus"
    ELSE 'NOT_SUBMITTED'::"KycStatus"
  END;

CREATE UNIQUE INDEX "Vehicle_vehicleNumber_key" ON "Vehicle"("vehicleNumber");

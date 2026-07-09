-- CreateEnum
CREATE TYPE "OrgPlanTier" AS ENUM ('SOLO', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TransportRequestType" AS ENUM ('SEAT', 'FULL_VEHICLE', 'PARCEL');

-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('OPEN', 'ASSIGNED', 'DEPARTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PROCESSED', 'REVERSED', 'FAILED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- DropIndex
DROP INDEX "ScheduledTrip_vehicleId_idx";

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "independentSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "planTier" "OrgPlanTier" NOT NULL DEFAULT 'SOLO',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "OrganizationDocument" ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "ScheduledTrip" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "departedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SeatBooking" ADD COLUMN     "arrivedAtPickupAt" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "noShowReason" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "refundAmount" INTEGER,
ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverRating" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "passengerId" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "driverId" TEXT,
    "passengerId" TEXT,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayoutProfile" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "vpa" TEXT,
    "providerContactId" TEXT,
    "providerFundAccountId" TEXT,
    "verificationStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "bankVerifiedAt" TIMESTAMP(3),
    "registeredName" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayoutProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayout" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "providerPayoutId" TEXT,
    "utr" TEXT,
    "failureReason" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "type" "TransportRequestType" NOT NULL DEFAULT 'SEAT',
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "routeId" TEXT,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "pickupJson" JSONB,
    "dropoffJson" JSONB,
    "requestedFor" TIMESTAMP(3) NOT NULL,
    "passengerId" TEXT,
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "parcelDetails" TEXT,
    "budgetPaise" INTEGER,
    "agreedAmountPaise" INTEGER,
    "acceptedByDriverId" TEXT,
    "rejectedByJson" JSONB,
    "bookingId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterGroup" (
    "id" TEXT NOT NULL,
    "status" "ClusterStatus" NOT NULL DEFAULT 'OPEN',
    "centroidLat" DOUBLE PRECISION NOT NULL,
    "centroidLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "departureFrom" TIMESTAMP(3) NOT NULL,
    "departureTo" TIMESTAMP(3) NOT NULL,
    "passengerCount" INTEGER NOT NULL,
    "estimatedFareMin" INTEGER NOT NULL,
    "assignedDriverId" TEXT,
    "assignedTripId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClusterGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterRequest" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripEvent_tripId_idx" ON "TripEvent"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverRating_bookingId_key" ON "DriverRating"("bookingId");

-- CreateIndex
CREATE INDEX "DriverRating_driverId_idx" ON "DriverRating"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_driverId_idx" ON "DeviceToken"("driverId");

-- CreateIndex
CREATE INDEX "DeviceToken_passengerId_idx" ON "DeviceToken"("passengerId");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayoutProfile_driverId_key" ON "DriverPayoutProfile"("driverId");

-- CreateIndex
CREATE INDEX "DriverPayout_driverId_idx" ON "DriverPayout"("driverId");

-- CreateIndex
CREATE INDEX "DriverPayout_status_idx" ON "DriverPayout"("status");

-- CreateIndex
CREATE INDEX "TransportRequest_status_type_idx" ON "TransportRequest"("status", "type");

-- CreateIndex
CREATE INDEX "TransportRequest_passengerId_idx" ON "TransportRequest"("passengerId");

-- CreateIndex
CREATE INDEX "TransportRequest_acceptedByDriverId_idx" ON "TransportRequest"("acceptedByDriverId");

-- CreateIndex
CREATE INDEX "TransportRequest_requestedFor_idx" ON "TransportRequest"("requestedFor");

-- CreateIndex
CREATE INDEX "ClusterGroup_status_expiresAt_idx" ON "ClusterGroup"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ClusterRequest_requestId_idx" ON "ClusterRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterRequest_clusterId_requestId_key" ON "ClusterRequest"("clusterId", "requestId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "Organization_createdById_idx" ON "Organization"("createdById");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDriver" ADD CONSTRAINT "OrganizationDriver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDriver" ADD CONSTRAINT "OrganizationDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationVehicle" ADD CONSTRAINT "OrganizationVehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationVehicle" ADD CONSTRAINT "OrganizationVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocument" ADD CONSTRAINT "OrganizationDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "ScheduledTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRating" ADD CONSTRAINT "DriverRating_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "SeatBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterRequest" ADD CONSTRAINT "ClusterRequest_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ClusterGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterRequest" ADD CONSTRAINT "ClusterRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DriverVehicleAssignment_orgId_driverId_status_idx" RENAME TO "DriverVehicleAssignment_organizationId_driverId_status_idx";

-- RenameIndex
ALTER INDEX "DriverVehicleAssignment_orgId_vehicleId_status_idx" RENAME TO "DriverVehicleAssignment_organizationId_vehicleId_status_idx";

-- RenameIndex
ALTER INDEX "DriverVehicleAssignment_vehicleId_type_status_idx" RENAME TO "DriverVehicleAssignment_vehicleId_assignmentType_status_idx";

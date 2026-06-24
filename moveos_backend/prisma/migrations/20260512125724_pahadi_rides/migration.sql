-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'OPEN', 'DEPARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatType" AS ENUM ('FRONT', 'BACK');

-- CreateEnum
CREATE TYPE "LuggageSize" AS ENUM ('SMALL', 'LARGE', 'OVERSIZED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'UPI';

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "estimatedHours" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseFrontPrice" INTEGER NOT NULL,
    "baseBackPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTrip" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "frontSeatsTotal" INTEGER NOT NULL DEFAULT 1,
    "backSeatsTotal" INTEGER NOT NULL DEFAULT 4,
    "frontSeatsBooked" INTEGER NOT NULL DEFAULT 0,
    "backSeatsBooked" INTEGER NOT NULL DEFAULT 0,
    "status" "TripStatus" NOT NULL DEFAULT 'OPEN',
    "departurePoint" TEXT NOT NULL,
    "luggagePolicy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatBooking" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "passengerId" TEXT,
    "agentId" TEXT,
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "seatType" "SeatType" NOT NULL,
    "luggageSize" "LuggageSize" NOT NULL DEFAULT 'SMALL',
    "luggageSurcharge" INTEGER NOT NULL DEFAULT 0,
    "baseFare" INTEGER NOT NULL,
    "totalFare" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    -- Keep the default on an existing enum value in this migration. PostgreSQL
    -- rejects using newly added enum values before the migration transaction is
    -- committed; a follow-up migration switches this to PENDING.
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "emergencyContact" TEXT,
    "gstin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRecord" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecord_bookingId_key" ON "InvoiceRecord"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecord_invoiceNo_key" ON "InvoiceRecord"("invoiceNo");

-- AddForeignKey
ALTER TABLE "ScheduledTrip" ADD CONSTRAINT "ScheduledTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTrip" ADD CONSTRAINT "ScheduledTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatBooking" ADD CONSTRAINT "SeatBooking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "ScheduledTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "SeatBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The original Pahadi migration added passenger-facing Prisma models but did
-- not apply the backing database enum/table changes on existing databases.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PASSENGER';

ALTER TABLE IF EXISTS "SeatBooking"
  ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS "Passenger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Passenger_userId_key" ON "Passenger"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Passenger_userId_fkey'
  ) THEN
    ALTER TABLE "Passenger"
      ADD CONSTRAINT "Passenger_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SeatBooking_passengerId_fkey'
  ) THEN
    ALTER TABLE "SeatBooking"
      ADD CONSTRAINT "SeatBooking_passengerId_fkey"
      FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

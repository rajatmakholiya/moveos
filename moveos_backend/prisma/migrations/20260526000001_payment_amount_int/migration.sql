-- C2.4: Standardize Payment.amount to integer paise (was Decimal).
-- Existing decimal values are rounded; default was 0 so no data is lost in practice.
ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE INTEGER
  USING ROUND("amount")::INTEGER;

ALTER TABLE "Payment"
  ALTER COLUMN "amount" SET DEFAULT 0;

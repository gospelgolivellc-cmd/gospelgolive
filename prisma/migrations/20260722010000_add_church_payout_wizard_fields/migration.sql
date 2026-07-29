-- Custom payout onboarding wizard: non-sensitive fields collected by our own
-- UI before handing off to Stripe's embedded form for personal identity +
-- bank account (those never get persisted here).
CREATE TYPE "BusinessType" AS ENUM ('individual', 'non_profit');

ALTER TABLE "churches"
  ADD COLUMN "business_type" "BusinessType",
  ADD COLUMN "ein" TEXT,
  ADD COLUMN "business_address_line1" TEXT,
  ADD COLUMN "business_address_city" TEXT,
  ADD COLUMN "business_address_state" TEXT,
  ADD COLUMN "business_address_postal_code" TEXT,
  ADD COLUMN "business_phone" TEXT,
  ADD COLUMN "support_email" TEXT;

ALTER TABLE "donations"
  ADD COLUMN "stripe_transfer_id" TEXT,
  ADD COLUMN "reversed_cents" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "donations_stripe_transfer_id_key" ON "donations" ("stripe_transfer_id");

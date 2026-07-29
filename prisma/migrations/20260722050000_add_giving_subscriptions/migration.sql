CREATE TABLE "giving_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "church_id" UUID NOT NULL,
  "giver_id" UUID NOT NULL,
  "stripe_subscription_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "fund_id" UUID,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "canceled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "giving_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "giving_subscriptions_stripe_subscription_id_key" ON "giving_subscriptions" ("stripe_subscription_id");

ALTER TABLE "giving_subscriptions"
  ADD CONSTRAINT "giving_subscriptions_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "giving_subscriptions"
  ADD CONSTRAINT "giving_subscriptions_giver_id_fkey"
  FOREIGN KEY ("giver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "giving_subscriptions"
  ADD CONSTRAINT "giving_subscriptions_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "giving_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

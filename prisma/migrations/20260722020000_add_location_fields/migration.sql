ALTER TABLE "users"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT;

ALTER TABLE "churches"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT;

ALTER TABLE "view_events"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "region" TEXT;

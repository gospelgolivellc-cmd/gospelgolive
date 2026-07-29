-- Social sign-in (Google, Twitter/X): social-only accounts never set a
-- password, so password_hash must become nullable; google_id/twitter_id
-- identify the linked provider account.
ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "google_id" TEXT,
  ADD COLUMN "twitter_id" TEXT;

CREATE UNIQUE INDEX "users_google_id_key" ON "users" ("google_id");
CREATE UNIQUE INDEX "users_twitter_id_key" ON "users" ("twitter_id");

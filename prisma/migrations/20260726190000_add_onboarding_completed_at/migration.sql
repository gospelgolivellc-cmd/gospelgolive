-- AlterTable
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(6);

-- Backfill existing accounts so this is a new-signup-only requirement —
-- nobody who already has an account gets prompted for it retroactively.
UPDATE "users" SET "onboarding_completed_at" = "created_at" WHERE "onboarding_completed_at" IS NULL;

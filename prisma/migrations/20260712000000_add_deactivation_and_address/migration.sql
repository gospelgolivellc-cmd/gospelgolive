ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMPTZ(6);
ALTER TABLE "churches" ADD COLUMN "address" TEXT;

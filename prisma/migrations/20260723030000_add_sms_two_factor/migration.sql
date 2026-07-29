ALTER TABLE "users" ADD COLUMN "phone_number" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_method" TEXT;
ALTER TABLE "users" ADD COLUMN "sms_code_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "sms_code_expires_at" TIMESTAMPTZ(6);

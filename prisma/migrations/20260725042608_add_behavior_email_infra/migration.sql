-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "plan_cap_hits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "cap_type" TEXT NOT NULL,
    "context_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_cap_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_email_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_cap_hits_church_id_cap_type_created_at_idx" ON "plan_cap_hits"("church_id", "cap_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plan_cap_hits_church_id_cap_type_context_id_key" ON "plan_cap_hits"("church_id", "cap_type", "context_id");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_email_log_user_id_email_key_key" ON "behavior_email_log"("user_id", "email_key");

-- AddForeignKey
ALTER TABLE "plan_cap_hits" ADD CONSTRAINT "plan_cap_hits_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_email_log" ADD CONSTRAINT "behavior_email_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('clean', 'pending_review', 'removed', 'blocked');

-- CreateEnum
CREATE TYPE "ReportContentType" AS ENUM ('sermon', 'stream', 'chat_message', 'profile');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('csam', 'nudity', 'violence', 'fraud_suspicion', 'spam', 'other');

-- CreateEnum
CREATE TYPE "DetectionSource" AS ENUM ('automated', 'user_report');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'under_review', 'actioned', 'dismissed');

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "flagged_reason" TEXT,
ADD COLUMN     "verification_status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "card_fingerprint" TEXT;

-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'clean';

-- AlterTable
ALTER TABLE "streams" ADD COLUMN     "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'clean';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID,
    "content_type" "ReportContentType" NOT NULL,
    "content_id" UUID NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "detection_source" "DetectionSource" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "confidence_score" INTEGER,
    "retain_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "action_taken" TEXT NOT NULL,
    "actioned_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_reports_status_category_idx" ON "content_reports"("status", "category");

-- CreateIndex
CREATE INDEX "content_reports_content_type_content_id_idx" ON "content_reports"("content_type", "content_id");

-- CreateIndex
CREATE INDEX "moderation_actions_report_id_idx" ON "moderation_actions"("report_id");

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "content_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

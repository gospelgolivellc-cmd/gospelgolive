-- CreateEnum
CREATE TYPE "DmcaNoticeStatus" AS ENUM ('valid', 'counter_noticed', 'restored', 'invalid');

-- AlterEnum
ALTER TYPE "ReportCategory" ADD VALUE 'copyright';

-- CreateTable
CREATE TABLE "dmca_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "claimant_name" TEXT NOT NULL,
    "claimant_email" TEXT NOT NULL,
    "claimant_address" TEXT,
    "claimant_phone" TEXT,
    "copyrighted_work_description" TEXT NOT NULL,
    "good_faith_statement" BOOLEAN NOT NULL,
    "perjury_statement" BOOLEAN NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "DmcaNoticeStatus" NOT NULL DEFAULT 'valid',
    "counter_notice_at" TIMESTAMPTZ(6),
    "restore_eligible_at" TIMESTAMPTZ(6),
    "restored_at" TIMESTAMPTZ(6),
    "litigation_filed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dmca_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dmca_notices_report_id_key" ON "dmca_notices"("report_id");

-- AddForeignKey
ALTER TABLE "dmca_notices" ADD CONSTRAINT "dmca_notices_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "content_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

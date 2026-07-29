-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "access_locked_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_failed_invoice_id" TEXT,
ADD COLUMN     "payment_failed_at" TIMESTAMPTZ(6),
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;

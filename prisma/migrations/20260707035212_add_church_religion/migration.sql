-- CreateEnum
CREATE TYPE "Religion" AS ENUM ('christianity', 'islam', 'hinduism', 'buddhism', 'sikhism', 'judaism');

-- AlterTable
ALTER TABLE "churches" ADD COLUMN "religion" "Religion";

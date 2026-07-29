-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('pastor', 'seeker', 'admin');
CREATE TYPE "ChurchPlan" AS ENUM ('starter', 'ministry', 'congregation');
CREATE TYPE "SermonStatus" AS ENUM ('processing', 'ready', 'failed');
CREATE TYPE "StreamStatus" AS ENUM ('idle', 'live', 'ended');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "churches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "church_size" TEXT,
    "banner_url" TEXT,
    "stripe_account_id" TEXT,
    "stripe_onboarded" BOOLEAN NOT NULL DEFAULT false,
    "plan" "ChurchPlan" NOT NULL DEFAULT 'starter',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "subscription_status" TEXT DEFAULT 'trialing',
    "trial_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "churches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "churches_slug_key" ON "churches"("slug");
CREATE UNIQUE INDEX "churches_stripe_account_id_key" ON "churches"("stripe_account_id");
CREATE UNIQUE INDEX "churches_stripe_customer_id_key" ON "churches"("stripe_customer_id");
CREATE UNIQUE INDEX "churches_stripe_subscription_id_key" ON "churches"("stripe_subscription_id");
ALTER TABLE "churches" ADD CONSTRAINT "churches_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sermons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "series" TEXT,
    "thumbnail_url" TEXT,
    "video_provider_asset_id" TEXT,
    "playback_id" TEXT,
    "duration_seconds" INTEGER,
    "status" "SermonStatus" NOT NULL DEFAULT 'processing',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "sermons_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "streams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stream_key" TEXT NOT NULL,
    "rtmp_url" TEXT NOT NULL,
    "playback_id" TEXT,
    "status" "StreamStatus" NOT NULL DEFAULT 'idle',
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "recorded_sermon_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "streams" ADD CONSTRAINT "streams_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "streams" ADD CONSTRAINT "streams_recorded_sermon_id_fkey" FOREIGN KEY ("recorded_sermon_id") REFERENCES "sermons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "follows" (
    "seeker_id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "follows_pkey" PRIMARY KEY ("seeker_id","church_id")
);
ALTER TABLE "follows" ADD CONSTRAINT "follows_seeker_id_fkey" FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "view_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sermon_id" UUID,
    "stream_id" UUID,
    "seeker_id" UUID,
    "watch_seconds" INTEGER,
    "device_type" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "view_events_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_seeker_id_fkey" FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "donations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "giver_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "stripe_payment_intent_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_invoice_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "donations_stripe_payment_intent_id_key" ON "donations"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "donations_stripe_invoice_id_key" ON "donations"("stripe_invoice_id");
ALTER TABLE "donations" ADD CONSTRAINT "donations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_giver_id_fkey" FOREIGN KEY ("giver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

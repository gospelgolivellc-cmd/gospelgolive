-- Ministry/Congregation tier feature set: stream scheduling, green-room
-- countdown, stream overlays, donor notes, simulcast targets, live polls,
-- prayer requests, multiple giving funds, and text-to-give.

ALTER TABLE "churches"
  ADD COLUMN "overlay_image_url" TEXT,
  ADD COLUMN "text_to_give_phone_number" TEXT;

ALTER TABLE "streams"
  ADD COLUMN "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "countdown_message" TEXT;

CREATE INDEX "streams_church_id_scheduled_at_idx" ON "streams" ("church_id", "scheduled_at");

ALTER TABLE "donations"
  ADD COLUMN "fund_id" UUID;

CREATE TYPE "SimulcastPlatform" AS ENUM ('youtube', 'facebook');

CREATE TABLE "donor_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "giver_id" UUID NOT NULL,
    "note" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "donor_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "donor_notes_church_id_giver_id_key" ON "donor_notes"("church_id", "giver_id");

ALTER TABLE "donor_notes" ADD CONSTRAINT "donor_notes_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donor_notes" ADD CONSTRAINT "donor_notes_giver_id_fkey" FOREIGN KEY ("giver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "simulcast_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stream_id" UUID NOT NULL,
    "platform" "SimulcastPlatform" NOT NULL,
    "rtmp_url" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "mux_simulcast_target_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulcast_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "simulcast_targets_stream_id_platform_key" ON "simulcast_targets"("stream_id", "platform");

ALTER TABLE "simulcast_targets" ADD CONSTRAINT "simulcast_targets_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stream_polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stream_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_polls_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stream_polls" ADD CONSTRAINT "stream_polls_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "poll_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "seeker_id" UUID,
    "selected_option" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "poll_responses_poll_id_seeker_id_key" ON "poll_responses"("poll_id", "seeker_id");

ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "stream_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_seeker_id_fkey" FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "prayer_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stream_id" UUID NOT NULL,
    "seeker_id" UUID,
    "message" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayer_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_seeker_id_fkey" FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "giving_funds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giving_funds_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "giving_funds" ADD CONSTRAINT "giving_funds_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "donations" ADD CONSTRAINT "donations_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "giving_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

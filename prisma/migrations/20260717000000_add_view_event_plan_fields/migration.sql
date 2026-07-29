-- Supports plan-gated features: lastHeartbeatAt lets us derive "concurrent
-- viewers right now" for the per-stream viewer cap, and country powers the
-- Ministry+ analytics location breakdown.
ALTER TABLE "view_events"
  ADD COLUMN "last_heartbeat_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN "country" TEXT;

CREATE INDEX "view_events_stream_id_last_heartbeat_at_idx"
  ON "view_events" ("stream_id", "last_heartbeat_at");

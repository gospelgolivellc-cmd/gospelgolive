-- AlterTable
ALTER TABLE "sermons" ADD COLUMN "mux_upload_id" TEXT;
CREATE UNIQUE INDEX "sermons_video_provider_asset_id_key" ON "sermons"("video_provider_asset_id");
CREATE UNIQUE INDEX "sermons_mux_upload_id_key" ON "sermons"("mux_upload_id");

-- AlterTable
ALTER TABLE "streams" ADD COLUMN "mux_live_stream_id" TEXT;
CREATE UNIQUE INDEX "streams_mux_live_stream_id_key" ON "streams"("mux_live_stream_id");

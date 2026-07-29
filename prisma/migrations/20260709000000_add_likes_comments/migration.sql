-- CreateTable
CREATE TABLE "likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "sermon_id" UUID,
    "stream_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "likes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "likes_target_check" CHECK (
        ("sermon_id" IS NOT NULL AND "stream_id" IS NULL) OR
        ("sermon_id" IS NULL AND "stream_id" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "sermon_id" UUID,
    "stream_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comments_target_check" CHECK (
        ("sermon_id" IS NOT NULL AND "stream_id" IS NULL) OR
        ("sermon_id" IS NULL AND "stream_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_sermon_id_key" ON "likes"("user_id", "sermon_id");
CREATE UNIQUE INDEX "likes_user_id_stream_id_key" ON "likes"("user_id", "stream_id");

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "likes" ADD CONSTRAINT "likes_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "likes" ADD CONSTRAINT "likes_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lets a seeker bookmark an uploaded sermon to watch later — separate from
-- Like, which is a public engagement signal rather than a personal save.
CREATE TABLE "favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "sermon_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorites_user_id_sermon_id_key" ON "favorites"("user_id", "sermon_id");

ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add postId support to likes/comments so seekers can react to a pastor's
-- timeline posts, not just sermons/streams.

ALTER TABLE "likes" ADD COLUMN "post_id" UUID;
ALTER TABLE "comments" ADD COLUMN "post_id" UUID;

ALTER TABLE "likes" DROP CONSTRAINT "likes_target_check";
ALTER TABLE "likes" ADD CONSTRAINT "likes_target_check" CHECK (
    num_nonnulls("sermon_id", "stream_id", "post_id") = 1
);

ALTER TABLE "comments" DROP CONSTRAINT "comments_target_check";
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_check" CHECK (
    num_nonnulls("sermon_id", "stream_id", "post_id") = 1
);

CREATE UNIQUE INDEX "likes_user_id_post_id_key" ON "likes"("user_id", "post_id");

ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

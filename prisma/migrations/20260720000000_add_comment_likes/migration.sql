-- Lets a viewer like an individual comment, separate from liking the
-- sermon/stream/post the comment was left on.
ALTER TABLE "likes" ADD COLUMN "comment_id" UUID;

ALTER TABLE "likes" DROP CONSTRAINT "likes_target_check";
ALTER TABLE "likes" ADD CONSTRAINT "likes_target_check" CHECK (
    num_nonnulls("sermon_id", "stream_id", "post_id", "comment_id") = 1
);

CREATE UNIQUE INDEX "likes_user_id_comment_id_key" ON "likes"("user_id", "comment_id");

ALTER TABLE "likes" ADD CONSTRAINT "likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

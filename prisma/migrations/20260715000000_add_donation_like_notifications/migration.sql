-- Adds two notification types so pastors can be notified when their church
-- receives a new donation or a like on their content.
ALTER TYPE "NotificationType" ADD VALUE 'donation';
ALTER TYPE "NotificationType" ADD VALUE 'like';

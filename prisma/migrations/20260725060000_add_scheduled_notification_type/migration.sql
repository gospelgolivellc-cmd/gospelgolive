-- Adds a notification type fired when a pastor schedules (or reschedules) an
-- upcoming service, so followers see it in their notifications feed.
ALTER TYPE "NotificationType" ADD VALUE 'scheduled';

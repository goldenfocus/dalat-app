-- Notification delivery moved from Inngest to Vercel cron
-- (/api/cron/process-notifications). Two schema gaps blocked delivery:
--
-- 1. The cron claims rows with status 'processing' before sending, but the
--    CHECK constraint only allowed pending/sent/cancelled/failed — every
--    claim would fail and no notification would ever send.
ALTER TABLE scheduled_notifications DROP CONSTRAINT IF EXISTS scheduled_notifications_status_check;
ALTER TABLE scheduled_notifications ADD CONSTRAINT scheduled_notifications_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed'));

-- 2. notification_type was missing values that the reminder cascade and
--    comment notifications write. Inserts with these types would fail:
--    - confirm_attendance_7d / event_starting_nudge (smart reminders)
--    - comment_* / reply_to_comment / thread_activity (comment notifications)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'confirm_attendance_7d';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_starting_nudge';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_on_event';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_on_moment';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reply_to_comment';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'thread_activity';

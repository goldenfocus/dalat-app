-- Fix Supabase Realtime for filtered notifications
--
-- PROBLEM: Realtime subscriptions with filters (e.g., filter: user_id=eq.${userId})
-- require REPLICA IDENTITY FULL on the table. Without this, the filter can't match
-- because the old/new row data isn't fully available.
--
-- This was causing in-app notifications to not appear instantly - users had to refresh.

-- Enable full row data for realtime events
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Also enable for notification_preferences in case we add realtime there later
ALTER TABLE notification_preferences REPLICA IDENTITY FULL;

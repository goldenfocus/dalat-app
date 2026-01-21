-- Notifications System Migration
-- Replaces Novu with native Supabase notifications

-- ============================================
-- Notification Types Enum
-- ============================================
CREATE TYPE notification_type AS ENUM (
  'rsvp_confirmation',      -- User confirmed going to event
  'confirm_attendance_24h', -- 24h before event - still coming?
  'final_reminder_2h',      -- 2h before event - on your way!
  'waitlist_promotion',     -- Moved from waitlist to going
  'event_reminder',         -- General event reminder
  'waitlist_position',      -- Position update on waitlist
  'new_rsvp',               -- Organizer: someone RSVPd
  'feedback_request',       -- Post-event: how was it?
  'event_invitation',       -- Email invitation to event
  'user_invitation',        -- In-app invitation to event
  'tribe_join_request',     -- Someone wants to join tribe
  'tribe_request_approved', -- Join request approved
  'tribe_request_rejected', -- Join request rejected
  'tribe_new_event'         -- New event in tribe
);

-- ============================================
-- Notification Channel Enum
-- ============================================
CREATE TYPE notification_channel AS ENUM (
  'in_app',
  'push',
  'email'
);

-- ============================================
-- Notifications Table (In-App)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,

  -- Display content
  title text NOT NULL,
  body text,

  -- Action URLs
  primary_action_url text,
  primary_action_label text,
  secondary_action_url text,
  secondary_action_label text,

  -- Metadata for business logic
  metadata jsonb DEFAULT '{}',

  -- Status
  read boolean DEFAULT false,
  read_at timestamptz,
  archived boolean DEFAULT false,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for user's notifications (main query)
CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE NOT read AND NOT archived;

-- Index for user's all notifications
CREATE INDEX idx_notifications_user_all
  ON notifications(user_id, created_at DESC);

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================
-- Notification Preferences Table
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Per-type channel preferences (jsonb for flexibility)
  -- Format: { "rsvp_confirmation": ["in_app", "push"], "event_reminder": ["in_app"] }
  channel_preferences jsonb DEFAULT '{}',

  -- Global toggles
  email_enabled boolean DEFAULT true,
  push_enabled boolean DEFAULT true,
  in_app_enabled boolean DEFAULT true,

  -- Email frequency
  email_digest boolean DEFAULT false, -- false = instant, true = daily digest

  -- Quiet hours (stored in user's timezone)
  quiet_hours_enabled boolean DEFAULT false,
  quiet_hours_start time DEFAULT '22:00',
  quiet_hours_end time DEFAULT '08:00',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================
-- Scheduled Notifications Table (for Inngest)
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,

  -- Scheduling
  scheduled_for timestamptz NOT NULL,

  -- Payload for the notification
  payload jsonb NOT NULL,

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  error_message text,

  -- Reference to related entity (for cancellation)
  reference_type text, -- 'event', 'rsvp', etc.
  reference_id uuid,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for pending scheduled notifications
CREATE INDEX idx_scheduled_notifications_pending
  ON scheduled_notifications(scheduled_for)
  WHERE status = 'pending';

-- Index for cancelling by reference
CREATE INDEX idx_scheduled_notifications_reference
  ON scheduled_notifications(reference_type, reference_id)
  WHERE status = 'pending';

-- ============================================
-- RLS Policies for notifications
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update (mark read/archived) their own notifications
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Only service role can insert notifications (via server-side code)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- RLS Policies for notification_preferences
-- ============================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- RLS Policies for scheduled_notifications
-- ============================================
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- Only service role can manage scheduled notifications
CREATE POLICY "Service role manages scheduled notifications"
  ON scheduled_notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Helper Function: Get Unread Count
-- ============================================
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM notifications
  WHERE user_id = p_user_id
    AND NOT read
    AND NOT archived;
$$;

-- ============================================
-- Helper Function: Mark All Read
-- ============================================
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE notifications
  SET read = true, read_at = now(), updated_at = now()
  WHERE user_id = p_user_id
    AND NOT read;
$$;

-- ============================================
-- Trigger: Update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

CREATE TRIGGER scheduled_notifications_updated_at
  BEFORE UPDATE ON scheduled_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

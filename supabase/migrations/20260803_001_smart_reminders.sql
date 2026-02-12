-- Smart Reminder & Reconfirmation System
-- Extends the existing reminder pipeline with 7d reminders, starting nudges,
-- organizer re-pings, and a reconfirmation dashboard.

-- 1. Add reconfirmation tracking to rsvps
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS reconfirmed_at timestamptz;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS reminder_7d_sent_at timestamptz;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS starting_nudge_sent_at timestamptz;

-- 2. Per-event reminder configuration
CREATE TABLE IF NOT EXISTS event_reminder_config (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  reminder_7d boolean DEFAULT true,
  reminder_24h boolean DEFAULT true,
  reminder_2h boolean DEFAULT true,
  starting_nudge boolean DEFAULT true,
  feedback boolean DEFAULT true,
  feedback_delay_hours integer DEFAULT 3,
  last_re_ping_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- RLS for event_reminder_config
ALTER TABLE event_reminder_config ENABLE ROW LEVEL SECURITY;

-- Event creators can read/write their own config
CREATE POLICY "Event creators can manage reminder config"
  ON event_reminder_config
  FOR ALL
  USING (
    event_id IN (SELECT id FROM events WHERE created_by = auth.uid())
  )
  WITH CHECK (
    event_id IN (SELECT id FROM events WHERE created_by = auth.uid())
  );

-- Service role can always access (for Inngest cron)
CREATE POLICY "Service role can access reminder config"
  ON event_reminder_config
  FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Update confirm_attendance() to also set reconfirmed_at
CREATE OR REPLACE FUNCTION confirm_attendance(p_event_id uuid, p_confirmed boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF p_confirmed THEN
    UPDATE rsvps
    SET confirmed_at = now(),
        reconfirmed_at = now()
    WHERE event_id = p_event_id AND user_id = v_user_id AND status = 'going';
  ELSE
    -- User can't make it - cancel their RSVP
    PERFORM cancel_rsvp(p_event_id);
  END IF;

  RETURN json_build_object('ok', true, 'confirmed', p_confirmed);
END;
$$;

-- 4. RPC: get reconfirmation status for organizers
CREATE OR REPLACE FUNCTION get_reconfirmation_status(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_creator boolean;
  v_result json;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is the event creator or admin
  SELECT EXISTS(
    SELECT 1 FROM events WHERE id = p_event_id AND created_by = v_user_id
  ) INTO v_is_creator;

  IF NOT v_is_creator THEN
    -- Also check admin role
    IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')) THEN
      RETURN json_build_object('ok', false, 'error', 'Not authorized');
    END IF;
  END IF;

  SELECT json_build_object(
    'ok', true,
    'total_going', (SELECT count(*) FROM rsvps WHERE event_id = p_event_id AND status = 'going'),
    'confirmed', (SELECT count(*) FROM rsvps WHERE event_id = p_event_id AND status = 'going' AND confirmed_at IS NOT NULL),
    'pending', (SELECT count(*) FROM rsvps WHERE event_id = p_event_id AND status = 'going' AND confirmed_at IS NULL),
    'cancelled', (SELECT count(*) FROM rsvps WHERE event_id = p_event_id AND status = 'cancelled'),
    'confirmed_attendees', (
      SELECT coalesce(json_agg(json_build_object(
        'user_id', r.user_id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'username', p.username,
        'confirmed_at', r.confirmed_at,
        'reconfirmed_at', r.reconfirmed_at
      ) ORDER BY r.confirmed_at DESC), '[]'::json)
      FROM rsvps r
      JOIN profiles p ON p.id = r.user_id
      WHERE r.event_id = p_event_id AND r.status = 'going' AND r.confirmed_at IS NOT NULL
    ),
    'pending_attendees', (
      SELECT coalesce(json_agg(json_build_object(
        'user_id', r.user_id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'username', p.username,
        'created_at', r.created_at
      ) ORDER BY r.created_at ASC), '[]'::json)
      FROM rsvps r
      JOIN profiles p ON p.id = r.user_id
      WHERE r.event_id = p_event_id AND r.status = 'going' AND r.confirmed_at IS NULL
    ),
    'last_re_ping_at', (
      SELECT last_re_ping_at FROM event_reminder_config WHERE event_id = p_event_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

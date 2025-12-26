-- Add confirmed_at column to track 24h confirmation responses
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Add reminder_sent_at to avoid duplicate reminders
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz;

-- Function to confirm attendance
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
    SET confirmed_at = now()
    WHERE event_id = p_event_id AND user_id = v_user_id AND status = 'going';
  ELSE
    -- User can't make it - cancel their RSVP
    PERFORM cancel_rsvp(p_event_id);
  END IF;

  RETURN json_build_object('ok', true, 'confirmed', p_confirmed);
END;
$$;

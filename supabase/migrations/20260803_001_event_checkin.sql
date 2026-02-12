-- Event Check-In & Attendance Tracking
-- Adds check-in columns to rsvps table and RPC functions for organizer check-in flow

-- ============================================
-- 1. Add check-in columns to rsvps table
-- ============================================

ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS checkin_note text,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz;

-- Index for fast lookup of unchecked-in attendees (used by auto_mark_no_shows)
CREATE INDEX IF NOT EXISTS idx_rsvps_checkin
  ON rsvps (event_id, status)
  WHERE status = 'going' AND checked_in_at IS NULL AND no_show_at IS NULL;

-- ============================================
-- 2. Helper: check if user can manage event
-- ============================================

CREATE OR REPLACE FUNCTION can_manage_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id
      AND (
        e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'superadmin')
        )
      )
  );
$$;

-- ============================================
-- 3. RPC: Check in an attendee
-- ============================================

CREATE OR REPLACE FUNCTION checkin_attendee(
  p_rsvp_id uuid,
  p_event_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rsvp rsvps%ROWTYPE;
BEGIN
  -- Permission check
  IF NOT can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Verify RSVP belongs to this event and is "going"
  SELECT * INTO v_rsvp
  FROM rsvps
  WHERE id = p_rsvp_id AND event_id = p_event_id AND status = 'going';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  -- Set check-in, clear any no-show
  UPDATE rsvps
  SET
    checked_in_at = now(),
    checked_in_by = auth.uid(),
    checkin_note = COALESCE(p_note, checkin_note),
    no_show_at = NULL
  WHERE id = p_rsvp_id;

  RETURN jsonb_build_object(
    'ok', true,
    'checked_in_at', now()
  );
END;
$$;

-- ============================================
-- 4. RPC: Undo check-in
-- ============================================

CREATE OR REPLACE FUNCTION undo_checkin(
  p_rsvp_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check
  IF NOT can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Verify RSVP belongs to this event
  IF NOT EXISTS (
    SELECT 1 FROM rsvps WHERE id = p_rsvp_id AND event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  UPDATE rsvps
  SET
    checked_in_at = NULL,
    checked_in_by = NULL,
    checkin_note = NULL
  WHERE id = p_rsvp_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================
-- 5. RPC: Toggle no-show
-- ============================================

CREATE OR REPLACE FUNCTION toggle_no_show(
  p_rsvp_id uuid,
  p_event_id uuid,
  p_is_no_show boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check
  IF NOT can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Verify RSVP belongs to this event
  IF NOT EXISTS (
    SELECT 1 FROM rsvps WHERE id = p_rsvp_id AND event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  IF p_is_no_show THEN
    -- Mark as no-show, clear check-in
    UPDATE rsvps
    SET
      no_show_at = now(),
      checkin_note = COALESCE(p_reason, checkin_note),
      checked_in_at = NULL,
      checked_in_by = NULL
    WHERE id = p_rsvp_id;
  ELSE
    -- Clear no-show (late arrival)
    UPDATE rsvps
    SET no_show_at = NULL
    WHERE id = p_rsvp_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_no_show', p_is_no_show);
END;
$$;

-- ============================================
-- 6. RPC: Auto-mark no-shows for ended events
-- ============================================

CREATE OR REPLACE FUNCTION auto_mark_no_shows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Mark unchecked-in "going" RSVPs as no-show for events that ended
  -- An event is "ended" if:
  --   - ends_at < now(), OR
  --   - ends_at is null AND starts_at + 4 hours < now() (default duration)
  UPDATE rsvps r
  SET no_show_at = now()
  FROM events e
  WHERE r.event_id = e.id
    AND r.status = 'going'
    AND r.checked_in_at IS NULL
    AND r.no_show_at IS NULL
    AND (
      (e.ends_at IS NOT NULL AND e.ends_at < now())
      OR
      (e.ends_at IS NULL AND e.starts_at + interval '4 hours' < now())
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'marked_count', v_count,
    'timestamp', now()
  );
END;
$$;

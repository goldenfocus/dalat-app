-- Check-in delegation: allow organizers to share check-in access via secret link
-- Adds checkin_code to events and updates RPCs to accept code-based auth

-- ============================================
-- 1. Add checkin_code column to events
-- ============================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS checkin_code uuid DEFAULT gen_random_uuid();

-- Backfill existing events
UPDATE events SET checkin_code = gen_random_uuid() WHERE checkin_code IS NULL;

-- ============================================
-- 2. Permission helper that also accepts checkin_code
-- ============================================

CREATE OR REPLACE FUNCTION can_checkin_event(
  p_event_id uuid,
  p_checkin_code uuid DEFAULT NULL
)
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
        -- Organizer or admin
        e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'superadmin')
        )
        -- Or has valid checkin code
        OR (p_checkin_code IS NOT NULL AND e.checkin_code = p_checkin_code)
      )
  );
$$;

-- ============================================
-- 3. Update RPCs to use can_checkin_event with code
-- ============================================

CREATE OR REPLACE FUNCTION checkin_attendee(
  p_rsvp_id uuid,
  p_event_id uuid,
  p_note text DEFAULT NULL,
  p_checkin_code uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rsvp rsvps%ROWTYPE;
BEGIN
  IF NOT can_checkin_event(p_event_id, p_checkin_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_rsvp
  FROM rsvps
  WHERE id = p_rsvp_id AND event_id = p_event_id AND status = 'going';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  UPDATE rsvps
  SET
    checked_in_at = now(),
    checked_in_by = auth.uid(),
    checkin_note = COALESCE(p_note, checkin_note),
    no_show_at = NULL
  WHERE id = p_rsvp_id;

  RETURN jsonb_build_object('ok', true, 'checked_in_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION undo_checkin(
  p_rsvp_id uuid,
  p_event_id uuid,
  p_checkin_code uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_checkin_event(p_event_id, p_checkin_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rsvps WHERE id = p_rsvp_id AND event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  UPDATE rsvps
  SET checked_in_at = NULL, checked_in_by = NULL, checkin_note = NULL
  WHERE id = p_rsvp_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION toggle_no_show(
  p_rsvp_id uuid,
  p_event_id uuid,
  p_is_no_show boolean,
  p_reason text DEFAULT NULL,
  p_checkin_code uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_checkin_event(p_event_id, p_checkin_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rsvps WHERE id = p_rsvp_id AND event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rsvp_not_found');
  END IF;

  IF p_is_no_show THEN
    UPDATE rsvps
    SET no_show_at = now(), checkin_note = COALESCE(p_reason, checkin_note),
        checked_in_at = NULL, checked_in_by = NULL
    WHERE id = p_rsvp_id;
  ELSE
    UPDATE rsvps SET no_show_at = NULL WHERE id = p_rsvp_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_no_show', p_is_no_show);
END;
$$;

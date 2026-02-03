-- ============================================
-- Fix: profiles uses 'role' column, not 'is_superadmin'
-- ============================================

CREATE OR REPLACE FUNCTION set_event_cover_moment(
  p_event_id uuid,
  p_moment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_organizer_id uuid;
  v_created_by uuid;
  v_user_role text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get event organizer and creator (fallback)
  SELECT organizer_id, created_by INTO v_organizer_id, v_created_by
  FROM events WHERE id = p_event_id;

  IF v_organizer_id IS NULL AND v_created_by IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Get user role to check if superadmin
  SELECT role INTO v_user_role
  FROM profiles WHERE id = v_user_id;

  -- Allow if user is organizer, creator, or superadmin
  IF v_user_id != COALESCE(v_organizer_id, v_created_by)
     AND (v_created_by IS NULL OR v_user_id != v_created_by)
     AND v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Verify moment belongs to this event (if not null)
  IF p_moment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM moments
      WHERE id = p_moment_id
        AND event_id = p_event_id
        AND status = 'published'
    ) THEN
      RAISE EXCEPTION 'Moment not found or not published';
    END IF;
  END IF;

  -- Update the cover
  UPDATE events
  SET cover_moment_id = p_moment_id
  WHERE id = p_event_id;

  RETURN true;
END;
$$;

-- Promote waitlisted users when event capacity increases
-- Previously, promotion only happened when someone cancelled (in cancel_rsvp).
-- This adds a trigger so increasing capacity (e.g. 15 → 18) auto-promotes.

-- Reusable function: promote as many waitlisted users as spots allow (FIFO)
CREATE OR REPLACE FUNCTION promote_from_waitlist(p_event_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity int;
  v_spots_taken int;
  v_available int;
  v_promoted uuid[] := '{}';
  v_rsvp record;
BEGIN
  -- Get current capacity
  SELECT capacity INTO v_capacity
  FROM events
  WHERE id = p_event_id;

  -- Unlimited capacity: promote everyone on waitlist
  IF v_capacity IS NULL THEN
    WITH promoted AS (
      UPDATE rsvps
      SET status = 'going'
      WHERE event_id = p_event_id AND status = 'waitlist'
      RETURNING user_id
    )
    SELECT array_agg(user_id) INTO v_promoted FROM promoted;
    RETURN COALESCE(v_promoted, '{}');
  END IF;

  -- Calculate current spots taken (each person = 1 + their plus_ones)
  SELECT coalesce(sum(1 + plus_ones), 0) INTO v_spots_taken
  FROM rsvps
  WHERE event_id = p_event_id AND status = 'going';

  v_available := v_capacity - v_spots_taken;

  -- Promote waitlisted users in FIFO order until full
  FOR v_rsvp IN
    SELECT id, user_id, plus_ones
    FROM rsvps
    WHERE event_id = p_event_id AND status = 'waitlist'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Stop if this person (+ their plus_ones) won't fit
    EXIT WHEN v_available < (1 + v_rsvp.plus_ones);

    UPDATE rsvps SET status = 'going' WHERE id = v_rsvp.id;
    v_available := v_available - (1 + v_rsvp.plus_ones);
    v_promoted := array_append(v_promoted, v_rsvp.user_id);
  END LOOP;

  RETURN v_promoted;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_from_waitlist(uuid) TO authenticated;

-- Trigger function: called when events.capacity changes
CREATE OR REPLACE FUNCTION trigger_promote_on_capacity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only promote when capacity increases or becomes unlimited
  IF (OLD.capacity IS NOT NULL AND NEW.capacity IS NULL)
     OR (NEW.capacity IS NOT NULL AND OLD.capacity IS NOT NULL AND NEW.capacity > OLD.capacity)
  THEN
    PERFORM promote_from_waitlist(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Fire after capacity column changes
CREATE TRIGGER on_event_capacity_change
  AFTER UPDATE OF capacity ON events
  FOR EACH ROW
  WHEN (OLD.capacity IS DISTINCT FROM NEW.capacity)
  EXECUTE FUNCTION trigger_promote_on_capacity_change();

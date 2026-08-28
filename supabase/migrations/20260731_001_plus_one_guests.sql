-- Plus One Guests: detailed guest records linked to RSVPs
-- The rsvps.plus_ones column already exists and capacity calculation uses sum(1 + plus_ones).
-- This table stores the actual guest details; a trigger keeps rsvps.plus_ones in sync.

-- Per-event control: how many +1s each person can bring (NULL = use default of 1)
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_plus_ones INT DEFAULT 1 CHECK (max_plus_ones >= 0);
-- Guest detail records
CREATE TABLE plus_one_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID REFERENCES rsvps(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT,
  invitation_id UUID REFERENCES event_invitations(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_plus_one_guests_rsvp ON plus_one_guests(rsvp_id);
-- Trigger: keep rsvps.plus_ones in sync with actual guest count
CREATE OR REPLACE FUNCTION sync_plus_ones_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rsvp_id uuid;
BEGIN
  -- Determine which rsvp_id was affected
  IF TG_OP = 'DELETE' THEN
    v_rsvp_id := OLD.rsvp_id;
  ELSE
    v_rsvp_id := NEW.rsvp_id;
  END IF;

  UPDATE rsvps
  SET plus_ones = (
    SELECT count(*) FROM plus_one_guests WHERE rsvp_id = v_rsvp_id
  )
  WHERE id = v_rsvp_id;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$;
CREATE TRIGGER on_plus_one_guest_change
  AFTER INSERT OR DELETE ON plus_one_guests
  FOR EACH STATEMENT EXECUTE FUNCTION sync_plus_ones_count();
-- Actually, FOR EACH STATEMENT won't have OLD/NEW. Use FOR EACH ROW instead.
DROP TRIGGER IF EXISTS on_plus_one_guest_change ON plus_one_guests;
CREATE TRIGGER on_plus_one_guest_insert
  AFTER INSERT ON plus_one_guests
  FOR EACH ROW EXECUTE FUNCTION sync_plus_ones_count();
CREATE TRIGGER on_plus_one_guest_delete
  AFTER DELETE ON plus_one_guests
  FOR EACH ROW EXECUTE FUNCTION sync_plus_ones_count();
-- ============================================
-- RPC: Add a plus-one guest with capacity check
-- ============================================
CREATE OR REPLACE FUNCTION add_plus_one_guest(
  p_rsvp_id uuid,
  p_name text,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_event_id uuid;
  v_rsvp_status text;
  v_capacity int;
  v_max_plus_ones int;
  v_current_guest_count int;
  v_going_spots int;
  v_guest_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate RSVP belongs to caller and is in 'going' status
  SELECT r.event_id, r.status
  INTO v_event_id, v_rsvp_status
  FROM rsvps r
  WHERE r.id = p_rsvp_id AND r.user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rsvp_not_found';
  END IF;

  IF v_rsvp_status <> 'going' THEN
    RAISE EXCEPTION 'not_going';
  END IF;

  -- Lock event row for capacity check
  SELECT e.capacity, COALESCE(e.max_plus_ones, 1)
  INTO v_capacity, v_max_plus_ones
  FROM events e
  WHERE e.id = v_event_id
  FOR UPDATE;

  -- Check max guests per person
  SELECT count(*)
  INTO v_current_guest_count
  FROM plus_one_guests
  WHERE rsvp_id = p_rsvp_id;

  IF v_current_guest_count >= v_max_plus_ones THEN
    RAISE EXCEPTION 'max_guests_reached';
  END IF;

  -- Check event capacity (if set)
  IF v_capacity IS NOT NULL THEN
    SELECT COALESCE(sum(1 + plus_ones), 0)
    INTO v_going_spots
    FROM rsvps
    WHERE event_id = v_event_id AND status = 'going';

    IF v_going_spots >= v_capacity THEN
      RAISE EXCEPTION 'event_full';
    END IF;
  END IF;

  -- Insert guest (trigger will update rsvps.plus_ones)
  INSERT INTO plus_one_guests (rsvp_id, name, email, sort_order)
  VALUES (p_rsvp_id, trim(p_name), NULLIF(trim(COALESCE(p_email, '')), ''), v_current_guest_count)
  RETURNING id INTO v_guest_id;

  RETURN jsonb_build_object(
    'guest_id', v_guest_id,
    'name', trim(p_name),
    'email', p_email
  );
END;
$$;
-- ============================================
-- RPC: Remove a plus-one guest
-- ============================================
CREATE OR REPLACE FUNCTION remove_plus_one_guest(p_guest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_rsvp_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate ownership via RSVP
  SELECT g.rsvp_id
  INTO v_rsvp_id
  FROM plus_one_guests g
  JOIN rsvps r ON r.id = g.rsvp_id
  WHERE g.id = p_guest_id AND r.user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  DELETE FROM plus_one_guests WHERE id = p_guest_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE plus_one_guests ENABLE ROW LEVEL SECURITY;
-- Users can read guests for events they can see (same events they can view rsvps for)
CREATE POLICY "Anyone can view plus one guests"
  ON plus_one_guests FOR SELECT
  USING (true);
-- Insert/delete handled via RPCs (SECURITY DEFINER), so no direct policies needed.
-- But for safety, allow users to manage their own guests directly too.
CREATE POLICY "Users can insert own guests"
  ON plus_one_guests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rsvps
      WHERE rsvps.id = plus_one_guests.rsvp_id
      AND rsvps.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own guests"
  ON plus_one_guests FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rsvps
      WHERE rsvps.id = plus_one_guests.rsvp_id
      AND rsvps.user_id = auth.uid()
    )
  );

-- Past Event Restrictions & Feedback System
-- 1. Prevent RSVP/interested on past events
-- 2. Add event feedback collection

-- ============================================
-- HELPER FUNCTION: Check if event is past
-- ============================================

CREATE OR REPLACE FUNCTION is_event_past(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN ends_at IS NOT NULL THEN ends_at < now()
    ELSE starts_at + interval '4 hours' < now()
  END
  FROM events
  WHERE id = p_event_id;
$$;

-- ============================================
-- UPDATE: rsvp_event() - reject past events
-- ============================================

CREATE OR REPLACE FUNCTION rsvp_event(p_event_id uuid, p_plus_ones int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_capacity int;
  v_status text;
  v_event_status text;
  v_spots_taken_excl_me int;
  v_rsvp_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_plus_ones < 0 THEN
    RAISE EXCEPTION 'invalid_plus_ones';
  END IF;

  -- Check if event is past (fast rejection before locking)
  IF is_event_past(p_event_id) THEN
    RAISE EXCEPTION 'event_has_ended';
  END IF;

  -- Lock event row to serialize capacity decisions
  SELECT capacity, status
  INTO v_capacity, v_event_status
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event_status <> 'published' THEN
    RAISE EXCEPTION 'event_not_published';
  END IF;

  -- Spots taken EXCLUDING caller (so +1 updates work correctly)
  SELECT coalesce(sum(1 + plus_ones), 0)
  INTO v_spots_taken_excl_me
  FROM rsvps
  WHERE event_id = p_event_id
    AND status = 'going'
    AND user_id <> v_uid;

  IF v_capacity IS NULL OR (v_spots_taken_excl_me + 1 + p_plus_ones) <= v_capacity THEN
    v_status := 'going';
  ELSE
    v_status := 'waitlist';
  END IF;

  INSERT INTO rsvps (event_id, user_id, status, plus_ones)
  VALUES (p_event_id, v_uid, v_status, p_plus_ones)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        plus_ones = EXCLUDED.plus_ones
  RETURNING id INTO v_rsvp_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'rsvp_id', v_rsvp_id
  );
END;
$$;

-- ============================================
-- UPDATE: mark_interested() - reject past events
-- ============================================

CREATE OR REPLACE FUNCTION mark_interested(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_event_status text;
  v_rsvp_id uuid;
  v_was_going boolean := false;
  v_promoted_user uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Check if event is past (fast rejection before locking)
  IF is_event_past(p_event_id) THEN
    RAISE EXCEPTION 'event_has_ended';
  END IF;

  -- Lock event row to serialize promotions
  SELECT status INTO v_event_status
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event_status <> 'published' THEN
    RAISE EXCEPTION 'event_not_published';
  END IF;

  -- Check if user was going (to trigger promotion)
  SELECT (status = 'going') INTO v_was_going
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_uid;

  -- Upsert as interested (plus_ones = 0 since they're not taking spots)
  INSERT INTO rsvps (event_id, user_id, status, plus_ones)
  VALUES (p_event_id, v_uid, 'interested', 0)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = 'interested',
        plus_ones = 0
  RETURNING id INTO v_rsvp_id;

  -- Promote next from waitlist if user was going
  IF v_was_going THEN
    UPDATE rsvps
    SET status = 'going'
    WHERE id = (
      SELECT id
      FROM rsvps
      WHERE event_id = p_event_id AND status = 'waitlist'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING user_id INTO v_promoted_user;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'interested',
    'rsvp_id', v_rsvp_id,
    'promoted_user', v_promoted_user
  );
END;
$$;

-- ============================================
-- FEEDBACK SYSTEM: Add marked_no_show to rsvps
-- ============================================

ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS marked_no_show boolean DEFAULT false;

-- ============================================
-- FEEDBACK SYSTEM: Create event_feedback table
-- ============================================

CREATE TABLE IF NOT EXISTS event_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating text NOT NULL CHECK (rating IN ('amazing', 'good', 'okay', 'not_great')),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_feedback_event ON event_feedback(event_id);

-- RLS for event_feedback
ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "event_feedback_select_public" ON event_feedback;
DROP POLICY IF EXISTS "event_feedback_insert_own" ON event_feedback;
DROP POLICY IF EXISTS "event_feedback_update_own" ON event_feedback;

-- Anyone can view feedback (for aggregate display)
CREATE POLICY "event_feedback_select_public"
ON event_feedback FOR SELECT USING (true);

-- Users can insert their own feedback
CREATE POLICY "event_feedback_insert_own"
ON event_feedback FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own feedback
CREATE POLICY "event_feedback_update_own"
ON event_feedback FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- RPC: Submit feedback (handles no-show logic)
-- ============================================

CREATE OR REPLACE FUNCTION submit_event_feedback(
  p_event_id uuid,
  p_rating text DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_did_not_attend boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_rsvp_status text;
  v_feedback_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify user had an RSVP for this event
  SELECT status INTO v_rsvp_status
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_rsvp_found';
  END IF;

  -- Handle "I didn't go" case
  IF p_did_not_attend THEN
    -- Mark as no-show and cancel their RSVP
    UPDATE rsvps
    SET marked_no_show = true,
        status = 'cancelled'
    WHERE event_id = p_event_id AND user_id = v_uid;

    RETURN jsonb_build_object(
      'ok', true,
      'marked_no_show', true
    );
  END IF;

  -- Validate rating for actual feedback
  IF p_rating IS NULL OR p_rating NOT IN ('amazing', 'good', 'okay', 'not_great') THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  -- Insert or update feedback
  INSERT INTO event_feedback (event_id, user_id, rating, comment)
  VALUES (p_event_id, v_uid, p_rating, p_comment)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        comment = EXCLUDED.comment
  RETURNING id INTO v_feedback_id;

  RETURN jsonb_build_object(
    'ok', true,
    'feedback_id', v_feedback_id,
    'rating', p_rating
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_event_feedback(uuid, text, text, boolean) TO authenticated;

-- ============================================
-- RPC: Get feedback stats for an event
-- ============================================

CREATE OR REPLACE FUNCTION get_event_feedback_stats(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_amazing int;
  v_good int;
  v_okay int;
  v_not_great int;
  v_positive_pct numeric;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE rating = 'amazing'),
    count(*) FILTER (WHERE rating = 'good'),
    count(*) FILTER (WHERE rating = 'okay'),
    count(*) FILTER (WHERE rating = 'not_great')
  INTO v_total, v_amazing, v_good, v_okay, v_not_great
  FROM event_feedback
  WHERE event_id = p_event_id;

  -- Positive = amazing + good
  IF v_total > 0 THEN
    v_positive_pct := round(((v_amazing + v_good)::numeric / v_total) * 100);
  ELSE
    v_positive_pct := NULL;
  END IF;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'total', v_total,
    'amazing', v_amazing,
    'good', v_good,
    'okay', v_okay,
    'not_great', v_not_great,
    'positive_percentage', v_positive_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_feedback_stats(uuid) TO anon, authenticated;

-- ============================================
-- RPC: Check if user has given feedback
-- ============================================

CREATE OR REPLACE FUNCTION get_user_event_feedback(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_feedback record;
  v_no_show boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('has_feedback', false);
  END IF;

  -- Check if marked as no-show
  SELECT marked_no_show INTO v_no_show
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_uid;

  IF v_no_show THEN
    RETURN jsonb_build_object(
      'has_feedback', true,
      'marked_no_show', true
    );
  END IF;

  -- Check for actual feedback
  SELECT rating, comment, created_at INTO v_feedback
  FROM event_feedback
  WHERE event_id = p_event_id AND user_id = v_uid;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'has_feedback', true,
      'rating', v_feedback.rating,
      'comment', v_feedback.comment,
      'created_at', v_feedback.created_at
    );
  END IF;

  RETURN jsonb_build_object('has_feedback', false);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_event_feedback(uuid) TO authenticated;

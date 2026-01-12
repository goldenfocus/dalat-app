-- Moments Features: Moderation RPC + Likes System
-- Adds moderation functions for event creators and likes/reactions for moments

-- ============================================
-- MODERATION RPC FUNCTIONS
-- ============================================

-- Get pending moments for an event (for moderation queue)
CREATE OR REPLACE FUNCTION get_pending_moments(
  p_event_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  text_content text,
  status text,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow event creators to see pending moments
  IF NOT EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_event_creator';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.text_content,
    m.status,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.status = 'pending'
  ORDER BY m.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_moments(uuid, int, int) TO authenticated;

-- Approve a pending moment
CREATE OR REPLACE FUNCTION approve_moment(p_moment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_current_status text;
BEGIN
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM moments WHERE id = p_moment_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'moment_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM events WHERE id = v_event_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_event_creator';
  END IF;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE moments SET status = 'published', updated_at = now()
  WHERE id = p_moment_id;

  RETURN jsonb_build_object('ok', true, 'moment_id', p_moment_id, 'new_status', 'published');
END;
$$;

GRANT EXECUTE ON FUNCTION approve_moment(uuid) TO authenticated;

-- Reject a pending moment
CREATE OR REPLACE FUNCTION reject_moment(p_moment_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_current_status text;
BEGIN
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM moments WHERE id = p_moment_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'moment_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM events WHERE id = v_event_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_event_creator';
  END IF;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE moments SET status = 'rejected', moderation_note = p_reason, updated_at = now()
  WHERE id = p_moment_id;

  RETURN jsonb_build_object('ok', true, 'moment_id', p_moment_id, 'new_status', 'rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION reject_moment(uuid, text) TO authenticated;

-- ============================================
-- LIKES SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS moment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid REFERENCES moments ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(moment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_moment_likes_moment ON moment_likes(moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_likes_user ON moment_likes(user_id);

ALTER TABLE moment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moment_likes_select_public" ON moment_likes;
CREATE POLICY "moment_likes_select_public" ON moment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "moment_likes_insert_authenticated" ON moment_likes;
CREATE POLICY "moment_likes_insert_authenticated" ON moment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "moment_likes_delete_own" ON moment_likes;
CREATE POLICY "moment_likes_delete_own" ON moment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Toggle like on a moment
CREATE OR REPLACE FUNCTION toggle_moment_like(p_moment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing_like uuid;
  v_new_liked boolean;
  v_new_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM moments WHERE id = p_moment_id AND status = 'published') THEN
    RAISE EXCEPTION 'moment_not_found';
  END IF;

  SELECT id INTO v_existing_like FROM moment_likes
  WHERE moment_id = p_moment_id AND user_id = v_uid;

  IF v_existing_like IS NOT NULL THEN
    DELETE FROM moment_likes WHERE id = v_existing_like;
    v_new_liked := false;
  ELSE
    INSERT INTO moment_likes (moment_id, user_id) VALUES (p_moment_id, v_uid);
    v_new_liked := true;
  END IF;

  SELECT count(*) INTO v_new_count FROM moment_likes WHERE moment_id = p_moment_id;

  RETURN jsonb_build_object('ok', true, 'moment_id', p_moment_id, 'liked', v_new_liked, 'count', v_new_count);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_moment_like(uuid) TO authenticated;

-- Get like counts for multiple moments
CREATE OR REPLACE FUNCTION get_moment_like_counts(p_moment_ids uuid[])
RETURNS TABLE (moment_id uuid, liked boolean, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  RETURN QUERY
  SELECT
    m.id AS moment_id,
    CASE WHEN v_uid IS NOT NULL THEN
      EXISTS (SELECT 1 FROM moment_likes ml WHERE ml.moment_id = m.id AND ml.user_id = v_uid)
    ELSE false END AS liked,
    (SELECT count(*) FROM moment_likes ml WHERE ml.moment_id = m.id) AS count
  FROM unnest(p_moment_ids) AS m(id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_moment_like_counts(uuid[]) TO anon, authenticated;

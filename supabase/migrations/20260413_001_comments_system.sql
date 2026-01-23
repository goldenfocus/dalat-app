-- Comments System
-- Slack-style threading: top-level comments with flat replies (max 1 level)
-- Supports comments on events and moments

-- ============================================
-- TABLE: comments
-- ============================================

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference to target content
  target_type text NOT NULL CHECK (target_type IN ('event', 'moment')),
  target_id uuid NOT NULL,

  -- Threading: NULL = top-level, UUID = reply to that comment
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,

  -- Comment author
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Content
  content text NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 2000),

  -- Soft delete
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Edit tracking
  is_edited boolean DEFAULT false,
  edited_at timestamptz,

  -- Translation support
  source_locale text DEFAULT 'en',

  -- Denormalized counts (for performance)
  reply_count int DEFAULT 0,

  -- Moderation
  is_hidden boolean DEFAULT false,
  moderation_note text,
  moderated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moderated_at timestamptz,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Primary query: get top-level comments for content
CREATE INDEX idx_comments_target_top_level
  ON comments(target_type, target_id, created_at DESC)
  WHERE parent_id IS NULL AND NOT is_deleted AND NOT is_hidden;

-- Thread replies
CREATE INDEX idx_comments_parent
  ON comments(parent_id, created_at ASC)
  WHERE NOT is_deleted AND NOT is_hidden;

-- User's comments (for profile/moderation)
CREATE INDEX idx_comments_user
  ON comments(user_id, created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Maintain reply_count on parent
CREATE OR REPLACE FUNCTION update_comment_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE comments
    SET reply_count = reply_count + 1
    WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE comments
    SET reply_count = GREATEST(0, reply_count - 1)
    WHERE id = OLD.parent_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft delete
    IF OLD.is_deleted = false AND NEW.is_deleted = true AND NEW.parent_id IS NOT NULL THEN
      UPDATE comments
      SET reply_count = GREATEST(0, reply_count - 1)
      WHERE id = NEW.parent_id;
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false AND NEW.parent_id IS NOT NULL THEN
      UPDATE comments
      SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER comments_reply_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_reply_count();

-- ============================================
-- TABLE: muted_threads
-- ============================================

CREATE TABLE muted_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  thread_id uuid NOT NULL, -- The parent comment ID
  muted_at timestamptz DEFAULT now(),
  UNIQUE(user_id, thread_id)
);

CREATE INDEX idx_muted_threads_user ON muted_threads(user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if user can moderate comments on target content
CREATE OR REPLACE FUNCTION can_moderate_comments(p_target_type text, p_target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Admins/superadmins can moderate anything
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Event creator can moderate event comments
  IF p_target_type = 'event' THEN
    RETURN EXISTS (
      SELECT 1 FROM events
      WHERE id = p_target_id
      AND created_by = auth.uid()
    );
  END IF;

  -- Moment owner can moderate moment comments
  IF p_target_type = 'moment' THEN
    RETURN EXISTS (
      SELECT 1 FROM moments
      WHERE id = p_target_id
      AND user_id = auth.uid()
    );
  END IF;

  RETURN false;
END;
$$;

-- ============================================
-- RLS POLICIES: comments
-- ============================================

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SELECT: Published comments visible to all, own comments always visible
CREATE POLICY "comments_select_published"
ON comments FOR SELECT
USING (
  -- Not deleted and not hidden = visible to all
  (NOT is_deleted AND NOT is_hidden)
  OR
  -- Own comments always visible (even if deleted by self)
  (user_id = auth.uid())
  OR
  -- Content owners see all (for moderation)
  can_moderate_comments(target_type, target_id)
);

-- INSERT: Authenticated users can comment on published content
CREATE POLICY "comments_insert_authenticated"
ON comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND
  -- Validate target exists and is accessible
  CASE target_type
    WHEN 'event' THEN EXISTS (
      SELECT 1 FROM events
      WHERE id = target_id
      AND status = 'published'
    )
    WHEN 'moment' THEN EXISTS (
      SELECT 1 FROM moments
      WHERE id = target_id
      AND status = 'published'
    )
    ELSE false
  END
  AND
  -- Replies must be to top-level comments in same target
  (parent_id IS NULL OR EXISTS (
    SELECT 1 FROM comments c
    WHERE c.id = parent_id
    AND c.parent_id IS NULL  -- Must be top-level
    AND c.target_type = comments.target_type
    AND c.target_id = comments.target_id
    AND NOT c.is_deleted
  ))
);

-- UPDATE: Own comments (for editing) or moderators (for hiding)
CREATE POLICY "comments_update_own_or_moderator"
ON comments FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR
  can_moderate_comments(target_type, target_id)
)
WITH CHECK (
  user_id = auth.uid()
  OR
  can_moderate_comments(target_type, target_id)
);

-- DELETE: Own comments or moderators (hard delete for cleanup)
CREATE POLICY "comments_delete_own_or_moderator"
ON comments FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR
  can_moderate_comments(target_type, target_id)
);

-- ============================================
-- RLS POLICIES: muted_threads
-- ============================================

ALTER TABLE muted_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "muted_threads_own"
ON muted_threads FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================
-- RPC: CREATE COMMENT/REPLY
-- ============================================

CREATE OR REPLACE FUNCTION create_comment(
  p_target_type text,
  p_target_id uuid,
  p_content text,
  p_parent_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_comment_id uuid;
  v_parent_target_type text;
  v_parent_target_id uuid;
  v_content_owner_id uuid;
  v_parent_author_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate content length
  IF char_length(p_content) < 1 OR char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'invalid_content_length';
  END IF;

  -- Validate target type
  IF p_target_type NOT IN ('event', 'moment') THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- Validate target exists and get owner
  IF p_target_type = 'event' THEN
    SELECT created_by INTO v_content_owner_id
    FROM events WHERE id = p_target_id AND status = 'published';
    IF v_content_owner_id IS NULL THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
  ELSIF p_target_type = 'moment' THEN
    SELECT user_id INTO v_content_owner_id
    FROM moments WHERE id = p_target_id AND status = 'published';
    IF v_content_owner_id IS NULL THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
  END IF;

  -- If replying, validate parent
  IF p_parent_id IS NOT NULL THEN
    SELECT target_type, target_id, user_id
    INTO v_parent_target_type, v_parent_target_id, v_parent_author_id
    FROM comments
    WHERE id = p_parent_id
      AND parent_id IS NULL  -- Must be top-level
      AND NOT is_deleted;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_not_found';
    END IF;

    -- Ensure reply is to same target
    IF v_parent_target_type != p_target_type OR v_parent_target_id != p_target_id THEN
      RAISE EXCEPTION 'parent_target_mismatch';
    END IF;
  END IF;

  -- Insert comment
  INSERT INTO comments (
    target_type,
    target_id,
    parent_id,
    user_id,
    content,
    source_locale
  ) VALUES (
    p_target_type,
    p_target_id,
    p_parent_id,
    v_uid,
    p_content,
    p_source_locale
  )
  RETURNING id INTO v_comment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', v_comment_id,
    'is_reply', p_parent_id IS NOT NULL,
    'content_owner_id', v_content_owner_id,
    'parent_author_id', v_parent_author_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_comment(text, uuid, text, uuid, text) TO authenticated;

-- ============================================
-- RPC: GET COMMENTS FOR TARGET (TOP-LEVEL)
-- ============================================

CREATE OR REPLACE FUNCTION get_comments(
  p_target_type text,
  p_target_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_sort text DEFAULT 'newest'
)
RETURNS TABLE (
  id uuid,
  parent_id uuid,
  user_id uuid,
  content text,
  is_deleted boolean,
  is_edited boolean,
  edited_at timestamptz,
  reply_count int,
  source_locale text,
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
  RETURN QUERY
  SELECT
    c.id,
    c.parent_id,
    c.user_id,
    CASE WHEN c.is_deleted THEN '[deleted]' ELSE c.content END AS content,
    c.is_deleted,
    c.is_edited,
    c.edited_at,
    c.reply_count,
    c.source_locale,
    c.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM comments c
  JOIN profiles p ON p.id = c.user_id
  WHERE c.target_type = p_target_type
    AND c.target_id = p_target_id
    AND c.parent_id IS NULL  -- Top-level only
    AND NOT c.is_hidden
    AND (NOT c.is_deleted OR c.reply_count > 0)
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN c.created_at END DESC,
    CASE WHEN p_sort = 'oldest' THEN c.created_at END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_comments(text, uuid, int, int, text) TO anon, authenticated;

-- ============================================
-- RPC: GET THREAD REPLIES
-- ============================================

CREATE OR REPLACE FUNCTION get_comment_replies(
  p_parent_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  parent_id uuid,
  user_id uuid,
  content text,
  is_deleted boolean,
  is_edited boolean,
  edited_at timestamptz,
  source_locale text,
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
  RETURN QUERY
  SELECT
    c.id,
    c.parent_id,
    c.user_id,
    CASE WHEN c.is_deleted THEN '[deleted]' ELSE c.content END AS content,
    c.is_deleted,
    c.is_edited,
    c.edited_at,
    c.source_locale,
    c.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM comments c
  JOIN profiles p ON p.id = c.user_id
  WHERE c.parent_id = p_parent_id
    AND NOT c.is_hidden
  ORDER BY c.created_at ASC  -- Chronological for threads
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_comment_replies(uuid, int, int) TO anon, authenticated;

-- ============================================
-- RPC: EDIT COMMENT
-- ============================================

CREATE OR REPLACE FUNCTION edit_comment(
  p_comment_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_comment_user_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate content
  IF char_length(p_content) < 1 OR char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'invalid_content_length';
  END IF;

  -- Get comment and verify ownership
  SELECT user_id INTO v_comment_user_id
  FROM comments
  WHERE id = p_comment_id AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  IF v_comment_user_id != v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Update
  UPDATE comments
  SET
    content = p_content,
    is_edited = true,
    edited_at = now()
  WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', p_comment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION edit_comment(uuid, text) TO authenticated;

-- ============================================
-- RPC: DELETE COMMENT (SOFT DELETE)
-- ============================================

CREATE OR REPLACE FUNCTION delete_comment(p_comment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_comment record;
  v_can_moderate boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get comment
  SELECT * INTO v_comment
  FROM comments
  WHERE id = p_comment_id AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  -- Check authorization
  v_can_moderate := can_moderate_comments(v_comment.target_type, v_comment.target_id);

  IF v_comment.user_id != v_uid AND NOT v_can_moderate THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Soft delete
  UPDATE comments
  SET
    is_deleted = true,
    deleted_at = now(),
    deleted_by = v_uid
  WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', p_comment_id,
    'deleted_by_owner', v_comment.user_id = v_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_comment(uuid) TO authenticated;

-- ============================================
-- RPC: MODERATE COMMENT (HIDE/UNHIDE)
-- ============================================

CREATE OR REPLACE FUNCTION moderate_comment(
  p_comment_id uuid,
  p_hide boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_comment record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get comment
  SELECT * INTO v_comment
  FROM comments
  WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  -- Check moderation permission
  IF NOT can_moderate_comments(v_comment.target_type, v_comment.target_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Update
  UPDATE comments
  SET
    is_hidden = p_hide,
    moderation_note = p_note,
    moderated_by = v_uid,
    moderated_at = now()
  WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', p_comment_id,
    'is_hidden', p_hide
  );
END;
$$;

GRANT EXECUTE ON FUNCTION moderate_comment(uuid, boolean, text) TO authenticated;

-- ============================================
-- RPC: GET COMMENT COUNT FOR TARGET
-- ============================================

CREATE OR REPLACE FUNCTION get_comment_count(
  p_target_type text,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count int;
  v_top_level_count int;
BEGIN
  -- Total visible comments
  SELECT count(*) INTO v_total_count
  FROM comments
  WHERE target_type = p_target_type
    AND target_id = p_target_id
    AND NOT is_deleted
    AND NOT is_hidden;

  -- Top-level comments only
  SELECT count(*) INTO v_top_level_count
  FROM comments
  WHERE target_type = p_target_type
    AND target_id = p_target_id
    AND parent_id IS NULL
    AND NOT is_deleted
    AND NOT is_hidden;

  RETURN jsonb_build_object(
    'target_type', p_target_type,
    'target_id', p_target_id,
    'total_count', v_total_count,
    'top_level_count', v_top_level_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_comment_count(text, uuid) TO anon, authenticated;

-- ============================================
-- RPC: TOGGLE MUTE THREAD
-- ============================================

CREATE OR REPLACE FUNCTION toggle_mute_thread(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing uuid;
  v_muted boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify thread exists (must be a top-level comment)
  IF NOT EXISTS (
    SELECT 1 FROM comments
    WHERE id = p_thread_id AND parent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  -- Check if already muted
  SELECT id INTO v_existing
  FROM muted_threads
  WHERE user_id = v_uid AND thread_id = p_thread_id;

  IF v_existing IS NOT NULL THEN
    -- Unmute
    DELETE FROM muted_threads WHERE id = v_existing;
    v_muted := false;
  ELSE
    -- Mute
    INSERT INTO muted_threads (user_id, thread_id)
    VALUES (v_uid, p_thread_id);
    v_muted := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'thread_id', p_thread_id,
    'muted', v_muted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_mute_thread(uuid) TO authenticated;

-- ============================================
-- RPC: CHECK IF THREAD IS MUTED
-- ============================================

CREATE OR REPLACE FUNCTION is_thread_muted(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM muted_threads
    WHERE user_id = v_uid AND thread_id = p_thread_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_thread_muted(uuid) TO anon, authenticated;

-- ============================================
-- ENABLE REALTIME FOR COMMENTS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- For filtering in realtime subscriptions
ALTER TABLE comments REPLICA IDENTITY FULL;

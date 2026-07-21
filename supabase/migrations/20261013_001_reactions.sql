-- Polymorphic emoji reactions, usable on moments AND comments.
--
-- moment_likes (20260127) is moment-only and heart-only, so it cannot carry
-- comment reactions or a multi-emoji set. This table supersedes it for writes.
--
-- ⚠️ moment_likes and blog_post_likes are deliberately NOT dropped. Eight
-- blog/news RPCs read blog_post_likes as an inline correlated subquery
-- (20260303, 20260307, 20260309, 20260416, 20260818). Postgres does not track
-- plpgsql body dependencies, so dropping the table would SUCCEED, the migration
-- would go green, and /news + /blog would 500 at request time instead. The
-- legacy tables stay; they simply stop being written to.

CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('moment', 'comment')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('heart', 'fire', 'laugh', 'wow', 'pray')),
  created_at timestamptz DEFAULT now(),
  -- Slack-style: one row per (user, target, emoji), so a user may react with
  -- several different emoji but each only once.
  UNIQUE (target_type, target_id, user_id, emoji)
);

-- Counting always filters on (target_type, target_id); the unique constraint's
-- index has those as leading columns, so this is for the reverse lookup only.
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_public" ON reactions;
CREATE POLICY "reactions_select_public" ON reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own" ON reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own" ON reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- TARGET VALIDATION
-- ============================================
-- target_id is polymorphic so it cannot carry a foreign key. This is the single
-- source of truth for "may this be reacted to", called by toggle_reaction and by
-- the cleanup triggers. One function so there is one place to be wrong.
CREATE OR REPLACE FUNCTION reaction_target_is_valid(p_target_type text, p_target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_target_type
    WHEN 'moment' THEN
      RETURN EXISTS (SELECT 1 FROM moments WHERE id = p_target_id AND status = 'published');
    WHEN 'comment' THEN
      RETURN EXISTS (SELECT 1 FROM comments WHERE id = p_target_id AND NOT is_deleted AND NOT is_hidden);
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- ============================================
-- TOGGLE
-- ============================================
CREATE OR REPLACE FUNCTION toggle_reaction(
  p_target_type text,
  p_target_id uuid,
  p_emoji text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing uuid;
  v_reacted boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT reaction_target_is_valid(p_target_type, p_target_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  SELECT id INTO v_existing FROM reactions
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND user_id = v_uid AND emoji = p_emoji;

  IF v_existing IS NOT NULL THEN
    DELETE FROM reactions WHERE id = v_existing;
    v_reacted := false;
  ELSE
    INSERT INTO reactions (target_type, target_id, user_id, emoji)
    VALUES (p_target_type, p_target_id, v_uid, p_emoji);
    v_reacted := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'emoji', p_emoji,
    'reacted', v_reacted,
    'counts', COALESCE((
      SELECT jsonb_object_agg(x.emoji, x.n)
      FROM (
        SELECT emoji, count(*) AS n FROM reactions
        WHERE target_type = p_target_type AND target_id = p_target_id
        GROUP BY emoji
      ) x
    ), '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_reaction(text, uuid, text) TO authenticated;

-- ============================================
-- BATCH READ
-- ============================================
-- Deliberately ONE aggregate scan, not a correlated subquery per id per emoji.
-- The old get_moment_like_counts ran 2 subqueries per id; with 5 emoji that
-- pattern would be ~10x worse on a feed.
CREATE OR REPLACE FUNCTION get_reactions_batch(
  p_target_type text,
  p_target_ids uuid[]
) RETURNS TABLE (target_id uuid, emoji text, count bigint, reacted boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  RETURN QUERY
  SELECT r.target_id, r.emoji, count(*)::bigint AS count,
         bool_or(v_uid IS NOT NULL AND r.user_id = v_uid) AS reacted
  FROM reactions r
  WHERE r.target_type = p_target_type
    AND r.target_id = ANY(p_target_ids)
  GROUP BY r.target_id, r.emoji;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reactions_batch(text, uuid[]) TO anon, authenticated;

-- ============================================
-- ORPHAN CLEANUP
-- ============================================
-- No FK is possible on a polymorphic target_id, so deletes are cleaned up by
-- trigger. Without this, deleting an event cascades its moments away and leaves
-- reaction rows pointing at nothing (cf. the Jul 13 poker incident, where one
-- event delete removed 66 moments).
CREATE OR REPLACE FUNCTION delete_orphaned_reactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM reactions
  WHERE target_type = TG_ARGV[0] AND target_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_moment_delete_clear_reactions ON moments;
CREATE TRIGGER on_moment_delete_clear_reactions
  AFTER DELETE ON moments
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_reactions('moment');

DROP TRIGGER IF EXISTS on_comment_delete_clear_reactions ON comments;
CREATE TRIGGER on_comment_delete_clear_reactions
  AFTER DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_reactions('comment');

-- ============================================
-- BACKFILL
-- ============================================
-- Existing hearts carry over so nobody's like disappears. Additive only.
INSERT INTO reactions (target_type, target_id, user_id, emoji, created_at)
SELECT 'moment', ml.moment_id, ml.user_id, 'heart', ml.created_at
FROM moment_likes ml
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = ml.user_id)
ON CONFLICT (target_type, target_id, user_id, emoji) DO NOTHING;

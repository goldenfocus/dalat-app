-- ============================================
-- User Follows (Social Graph Foundation)
-- ============================================

-- 1. Create the user_follows table
CREATE TABLE user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id != following_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);
CREATE INDEX idx_user_follows_created ON user_follows(created_at DESC);

-- 2. Add denormalized counts to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follower_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count int NOT NULL DEFAULT 0;

-- 3. RLS policies
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can see follows (public social graph)
CREATE POLICY "user_follows_select" ON user_follows
  FOR SELECT USING (true);

-- Authenticated users can follow others (own follower_id only)
CREATE POLICY "user_follows_insert" ON user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Authenticated users can unfollow (own follower_id only)
CREATE POLICY "user_follows_delete" ON user_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- 4. Trigger to maintain follower/following counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.following_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER user_follows_count_trigger
  AFTER INSERT OR DELETE ON user_follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 5. Toggle follow RPC (mirrors toggle_moment_like pattern)
CREATE OR REPLACE FUNCTION toggle_follow(p_following_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing_follow uuid;
  v_new_following boolean;
  v_follower_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Can't follow yourself
  IF v_uid = p_following_id THEN
    RAISE EXCEPTION 'cannot_follow_self';
  END IF;

  -- Check if target user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_following_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Check if already following
  SELECT id INTO v_existing_follow FROM user_follows
    WHERE follower_id = v_uid AND following_id = p_following_id;

  IF v_existing_follow IS NOT NULL THEN
    -- Unfollow
    DELETE FROM user_follows WHERE id = v_existing_follow;
    v_new_following := false;
  ELSE
    -- Follow
    INSERT INTO user_follows (follower_id, following_id) VALUES (v_uid, p_following_id);
    v_new_following := true;
  END IF;

  -- Get updated follower count for the target user
  SELECT follower_count INTO v_follower_count FROM profiles WHERE id = p_following_id;

  RETURN jsonb_build_object(
    'ok', true,
    'following_id', p_following_id,
    'is_following', v_new_following,
    'follower_count', v_follower_count
  );
END;
$$;

-- 6. Get follow status RPC
CREATE OR REPLACE FUNCTION get_follow_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_following boolean;
  v_is_followed_by boolean;
BEGIN
  v_uid := auth.uid();

  -- Check if current user follows the target
  v_is_following := EXISTS (
    SELECT 1 FROM user_follows WHERE follower_id = v_uid AND following_id = p_user_id
  );

  -- Check if target follows current user (mutual)
  v_is_followed_by := EXISTS (
    SELECT 1 FROM user_follows WHERE follower_id = p_user_id AND following_id = v_uid
  );

  RETURN jsonb_build_object(
    'is_following', v_is_following,
    'is_followed_by', v_is_followed_by,
    'is_mutual', v_is_following AND v_is_followed_by
  );
END;
$$;

-- 7. Get user followers (paginated, with mutual indicator)
CREATE OR REPLACE FUNCTION get_user_followers(p_user_id uuid, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_followers jsonb;
  v_total int;
BEGIN
  v_uid := auth.uid();

  SELECT count(*) INTO v_total FROM user_follows WHERE following_id = p_user_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'is_mutual', EXISTS (
        SELECT 1 FROM user_follows uf2
        WHERE uf2.follower_id = p_user_id AND uf2.following_id = p.id
      ),
      'you_follow', CASE WHEN v_uid IS NOT NULL THEN EXISTS (
        SELECT 1 FROM user_follows uf3
        WHERE uf3.follower_id = v_uid AND uf3.following_id = p.id
      ) ELSE false END,
      'followed_at', uf.created_at
    ) ORDER BY uf.created_at DESC
  ), '[]'::jsonb) INTO v_followers
  FROM user_follows uf
  JOIN profiles p ON p.id = uf.follower_id
  WHERE uf.following_id = p_user_id
  ORDER BY uf.created_at DESC
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object(
    'followers', v_followers,
    'total', v_total
  );
END;
$$;

-- 8. Get user following (paginated, with mutual indicator)
CREATE OR REPLACE FUNCTION get_user_following(p_user_id uuid, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_following jsonb;
  v_total int;
BEGIN
  v_uid := auth.uid();

  SELECT count(*) INTO v_total FROM user_follows WHERE follower_id = p_user_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'is_mutual', EXISTS (
        SELECT 1 FROM user_follows uf2
        WHERE uf2.follower_id = p.id AND uf2.following_id = p_user_id
      ),
      'you_follow', CASE WHEN v_uid IS NOT NULL THEN EXISTS (
        SELECT 1 FROM user_follows uf3
        WHERE uf3.follower_id = v_uid AND uf3.following_id = p.id
      ) ELSE false END,
      'followed_at', uf.created_at
    ) ORDER BY uf.created_at DESC
  ), '[]'::jsonb) INTO v_following
  FROM user_follows uf
  JOIN profiles p ON p.id = uf.following_id
  WHERE uf.follower_id = p_user_id
  ORDER BY uf.created_at DESC
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object(
    'following', v_following,
    'total', v_total
  );
END;
$$;

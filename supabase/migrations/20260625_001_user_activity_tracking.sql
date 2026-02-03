-- Migration: User activity tracking (heartbeat-based)
-- Replaces "last login" with "last action" for more accurate engagement tracking

-- ============================================
-- 1. Add last_action_at column to profiles
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_action_at timestamptz;

-- Index for fast lookups (admin queries)
CREATE INDEX IF NOT EXISTS idx_profiles_last_action_at ON profiles(last_action_at DESC NULLS LAST);

-- ============================================
-- 2. Record user activity with throttling (5 min)
-- ============================================

CREATE OR REPLACE FUNCTION record_user_activity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_last_action timestamptz;
  v_now timestamptz := now();
  v_throttle_minutes int := 5;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get current last_action_at
  SELECT last_action_at INTO v_last_action
  FROM profiles
  WHERE id = v_uid;

  -- Only update if last action was more than 5 minutes ago (or never recorded)
  IF v_last_action IS NULL OR v_last_action < (v_now - (v_throttle_minutes || ' minutes')::interval) THEN
    UPDATE profiles
    SET last_action_at = v_now
    WHERE id = v_uid;

    RETURN jsonb_build_object('ok', true, 'updated', true, 'last_action_at', v_now);
  END IF;

  -- Throttled - no update needed
  RETURN jsonb_build_object('ok', true, 'updated', false, 'throttled', true);
END;
$$;

GRANT EXECUTE ON FUNCTION record_user_activity() TO authenticated;

-- ============================================
-- 3. Record login event (call from auth callback)
-- ============================================

CREATE OR REPLACE FUNCTION record_login_event(p_ip_address text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_now timestamptz := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Insert into login_events
  INSERT INTO login_events (user_id, logged_in_at, ip_address, user_agent)
  VALUES (v_uid, v_now, p_ip_address, p_user_agent);

  -- Also update last_action_at (login counts as activity)
  UPDATE profiles
  SET last_action_at = v_now
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'logged_in_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION record_login_event(text, text) TO authenticated;

-- ============================================
-- 4. Update admin RPC to return last_action_at
-- ============================================

-- Must drop first because we're changing the return type
DROP FUNCTION IF EXISTS get_users_with_login_stats();

CREATE OR REPLACE FUNCTION get_users_with_login_stats()
RETURNS TABLE (
  user_id uuid,
  last_sign_in_at timestamptz,
  last_action_at timestamptz,
  login_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.last_sign_in_at,
    p.last_action_at,
    COALESCE(le.cnt, 0) AS login_count
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN (
    SELECT login_events.user_id, COUNT(*) as cnt
    FROM login_events
    GROUP BY login_events.user_id
  ) le ON le.user_id = au.id;
END;
$$;

-- Already granted in previous migration

-- ============================================
-- 5. Update session stats to include active users
-- ============================================

-- Must drop first because we're changing the return type
DROP FUNCTION IF EXISTS get_session_stats();

CREATE OR REPLACE FUNCTION get_session_stats()
RETURNS TABLE (
  total_logins bigint,
  active_today bigint,
  active_last_hour bigint,
  last_login_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM auth.users WHERE last_sign_in_at IS NOT NULL) AS total_logins,
    (SELECT count(*) FROM profiles WHERE last_action_at > now() - interval '1 day') AS active_today,
    (SELECT count(*) FROM profiles WHERE last_action_at > now() - interval '1 hour') AS active_last_hour,
    (SELECT max(last_sign_in_at) FROM auth.users) AS last_login_at;
END;
$$;

-- Already granted in previous migration

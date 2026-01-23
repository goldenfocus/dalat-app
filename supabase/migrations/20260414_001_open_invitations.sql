-- Open up event invitations to all authenticated users
-- Previously only event creators could invite; now anyone can share events

-- ============================================
-- Update RLS Policy
-- ============================================

-- Drop any existing insert policies
DROP POLICY IF EXISTS "Event creators can create invitations" ON event_invitations;
DROP POLICY IF EXISTS "Any authenticated user can create invitations" ON event_invitations;

-- Create a new policy allowing any authenticated user to invite
CREATE POLICY "Any authenticated user can create invitations"
  ON event_invitations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND invited_by = auth.uid()
  );

-- ============================================
-- Update Quota Function
-- ============================================

-- Update check_invite_quota to allow regular users with limits
CREATE OR REPLACE FUNCTION check_invite_quota(p_user_id UUID, p_count INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_daily_limit INT;
  v_weekly_limit INT;
  v_daily_used INT;
  v_weekly_used INT;
BEGIN
  -- Get user role
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  -- Set limits based on role
  CASE v_role
    WHEN 'admin' THEN
      RETURN jsonb_build_object('allowed', true, 'remaining_daily', 999999, 'remaining_weekly', 999999);
    WHEN 'superadmin' THEN
      RETURN jsonb_build_object('allowed', true, 'remaining_daily', 999999, 'remaining_weekly', 999999);
    WHEN 'organizer_verified' THEN
      v_daily_limit := 50;
      v_weekly_limit := 200;
    WHEN 'organizer_pending' THEN
      v_daily_limit := 10;
      v_weekly_limit := 50;
    ELSE
      -- Regular users can invite with conservative limits
      v_daily_limit := 5;
      v_weekly_limit := 20;
  END CASE;

  -- Get current daily usage
  SELECT COALESCE(daily_count, 0) INTO v_daily_used
  FROM invite_quotas
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  IF v_daily_used IS NULL THEN
    v_daily_used := 0;
  END IF;

  -- Get current weekly usage
  SELECT COALESCE(SUM(daily_count), 0) INTO v_weekly_used
  FROM invite_quotas
  WHERE user_id = p_user_id
    AND date >= date_trunc('week', CURRENT_DATE)::date;

  -- Check daily limit
  IF v_daily_used + p_count > v_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit_exceeded',
      'remaining_daily', GREATEST(0, v_daily_limit - v_daily_used),
      'remaining_weekly', GREATEST(0, v_weekly_limit - v_weekly_used)
    );
  END IF;

  -- Check weekly limit
  IF v_weekly_used + p_count > v_weekly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_limit_exceeded',
      'remaining_daily', GREATEST(0, v_daily_limit - v_daily_used),
      'remaining_weekly', GREATEST(0, v_weekly_limit - v_weekly_used)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_daily', v_daily_limit - v_daily_used - p_count,
    'remaining_weekly', v_weekly_limit - v_weekly_used - p_count
  );
END;
$$;

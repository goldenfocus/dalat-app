-- Fix check_invite_quota to include superadmin with unlimited quota
-- Previously superadmin fell through to ELSE case and got 0 quota

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
    WHEN 'superadmin' THEN
      RETURN jsonb_build_object('allowed', true, 'remaining_daily', 999999, 'remaining_weekly', 999999);
    WHEN 'admin' THEN
      RETURN jsonb_build_object('allowed', true, 'remaining_daily', 999999, 'remaining_weekly', 999999);
    WHEN 'organizer_verified' THEN
      v_daily_limit := 50;
      v_weekly_limit := 200;
    WHEN 'organizer_pending' THEN
      v_daily_limit := 10;
      v_weekly_limit := 50;
    ELSE
      -- Regular users cannot send invites
      RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized', 'remaining_daily', 0, 'remaining_weekly', 0);
  END CASE;

  -- Get current daily usage
  SELECT COALESCE(daily_count, 0) INTO v_daily_used
  FROM invite_quotas
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  -- Get current weekly usage
  SELECT COALESCE(SUM(daily_count), 0) INTO v_weekly_used
  FROM invite_quotas
  WHERE user_id = p_user_id
    AND date >= date_trunc('week', CURRENT_DATE);

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

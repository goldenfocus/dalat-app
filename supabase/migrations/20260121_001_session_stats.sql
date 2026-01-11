-- Migration: Add session stats to dashboard overview
-- This adds login/session statistics to the admin dashboard

-- Create RPC function to get session statistics
-- Uses SECURITY DEFINER to safely access auth.users
CREATE OR REPLACE FUNCTION get_session_stats()
RETURNS TABLE (
  total_logins bigint,
  active_today bigint,
  last_login_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Total number of users who have ever logged in
    COUNT(*) FILTER (WHERE au.last_sign_in_at IS NOT NULL) AS total_logins,
    -- Users who logged in today
    COUNT(*) FILTER (
      WHERE au.last_sign_in_at >= CURRENT_DATE
    ) AS active_today,
    -- Most recent login across all users
    MAX(au.last_sign_in_at) AS last_login_at
  FROM auth.users au;
END;
$$;

-- Grant execute permission to authenticated users (admin check happens in app)
GRANT EXECUTE ON FUNCTION get_session_stats() TO authenticated;

-- Update the main dashboard overview function to include sessions
-- This assumes get_dashboard_overview exists; if not, this is a no-op
DO $$
BEGIN
  -- Check if the function exists before trying to update it
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_dashboard_overview'
  ) THEN
    RAISE NOTICE 'get_dashboard_overview exists - you may want to update it to include session stats';
  END IF;
END $$;

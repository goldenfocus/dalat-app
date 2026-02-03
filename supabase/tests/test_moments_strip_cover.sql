-- ============================================
-- Test: Verify get_homepage_moments_strip respects cover_moment_id
--
-- Run this test after any migration that modifies get_homepage_moments_strip
-- to ensure the cover_moment_id preference is preserved.
--
-- Usage:
-- 1. Copy this entire file into Supabase Dashboard > SQL Editor and run
-- 2. Or use: psql $DATABASE_URL -f supabase/tests/test_moments_strip_cover.sql
--
-- Expected output: "NOTICE: PASS: get_homepage_moments_strip correctly includes cover_moment_id preference"
-- If it fails: "ERROR: FAIL: ..." with details about what's missing
-- ============================================

DO $$
DECLARE
  v_function_def text;
  v_has_cover_logic boolean;
BEGIN
  -- Get the function definition
  SELECT pg_get_functiondef(oid) INTO v_function_def
  FROM pg_proc
  WHERE proname = 'get_homepage_moments_strip';

  IF v_function_def IS NULL THEN
    RAISE EXCEPTION 'FAIL: Function get_homepage_moments_strip does not exist!';
  END IF;

  -- Check if the function contains the cover_moment_id preference
  v_has_cover_logic := v_function_def ILIKE '%cover_moment_id%';

  IF NOT v_has_cover_logic THEN
    RAISE EXCEPTION 'FAIL: get_homepage_moments_strip is missing cover_moment_id preference! This is a known regression that has broken cover images 3+ times. See CLAUDE.md for details.';
  END IF;

  -- Also verify the CASE WHEN pattern exists (not just a comment)
  IF NOT (v_function_def ILIKE '%CASE WHEN%cover_moment_id%THEN 0%') THEN
    RAISE EXCEPTION 'FAIL: cover_moment_id exists but ORDER BY preference logic is missing! Expected: CASE WHEN e.cover_moment_id = m.id THEN 0 ELSE 1 END';
  END IF;

  RAISE NOTICE 'PASS: get_homepage_moments_strip correctly includes cover_moment_id preference';
END $$;

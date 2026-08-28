-- Regression test for Stream-backed videos in tribe galleries.
-- Run after migrations; it fails if the RPC stops returning the fields that
-- MomentCard needs when media_url is NULL.

DO $$
DECLARE
  v_function_def text;
  v_required_field text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_function_def
  FROM pg_proc
  WHERE proname = 'get_tribe_moments_grouped'
    AND pg_get_function_identity_arguments(oid) = 'p_tribe_id uuid, p_event_limit integer, p_moments_per_event integer, p_event_offset integer, p_content_types text[]';

  IF v_function_def IS NULL THEN
    RAISE EXCEPTION 'FAIL: get_tribe_moments_grouped does not exist';
  END IF;

  FOREACH v_required_field IN ARRAY ARRAY[
    'thumbnail_url',
    'cf_video_uid',
    'cf_playback_url',
    'video_status'
  ]
  LOOP
    IF position(quote_literal(v_required_field) IN v_function_def) = 0 THEN
      RAISE EXCEPTION 'FAIL: get_tribe_moments_grouped does not return %', v_required_field;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS: tribe moments RPC returns Cloudflare Stream video fields';
END $$;

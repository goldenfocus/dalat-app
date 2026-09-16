-- Freshness expiry must not unlist a still-scheduled activity just because
-- stale_after elapsed. Application code re-fetches source_url first and only
-- calls apply_activity_candidate_system_unlist for gone/cancelled pages.

GRANT EXECUTE ON FUNCTION apply_activity_candidate_system_unlist(uuid[], timestamptz, text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION expire_stale_activity_source_candidates(
  p_source_id uuid,
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stale_count integer := 0;
BEGIN
  SELECT count(*)::integer
  INTO v_stale_count
  FROM activity_candidates AS candidate
  WHERE candidate.source_id = p_source_id
    AND candidate.status = 'published'
    AND candidate.stale_after IS NOT NULL
    AND candidate.stale_after <= p_checked_at;

  RETURN jsonb_build_object(
    'unlisted', 0,
    'stale', v_stale_count
  );
END;
$$;

COMMENT ON FUNCTION expire_stale_activity_source_candidates(uuid, timestamptz) IS
  'Reports published candidates past stale_after. Live confirmation and unlist now happen in application code after a source_url re-fetch.';

CREATE OR REPLACE FUNCTION expire_all_stale_activity_candidates(
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stale_count integer := 0;
BEGIN
  SELECT count(*)::integer
  INTO v_stale_count
  FROM activity_candidates AS candidate
  WHERE candidate.status = 'published'
    AND candidate.stale_after IS NOT NULL
    AND candidate.stale_after <= p_checked_at;

  RETURN jsonb_build_object(
    'unlisted', 0,
    'stale', v_stale_count
  );
END;
$$;

COMMENT ON FUNCTION expire_all_stale_activity_candidates(timestamptz) IS
  'Reports published candidates past stale_after. Live confirmation and unlist now happen in application code after a source_url re-fetch.';

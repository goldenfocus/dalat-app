-- A schedule_locked event must not be drafted just because one of its sources
-- 404s. Flag it for review instead, unless the caller has confirmed that at
-- least one other confirming source is also gone (p_override_schedule_lock).

CREATE FUNCTION apply_activity_candidate_system_unlist(
  p_candidate_ids uuid[],
  p_unlisted_at timestamptz,
  p_reason text,
  p_future_events_only boolean,
  p_override_schedule_lock boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate_ids uuid[] := COALESCE(p_candidate_ids, ARRAY[]::uuid[]);
  v_paused_series_ids uuid[] := ARRAY[]::uuid[];
  v_unlisted integer := 0;
  v_locked boolean := (NOT COALESCE(p_override_schedule_lock, false));
BEGIN
  IF cardinality(v_candidate_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Locked published events: flag, do not draft, unless override is set.
  IF v_locked THEN
    UPDATE events AS target_event
    SET source_metadata =
      COALESCE(target_event.source_metadata, '{}'::jsonb) || jsonb_build_object(
        'post_publish_review', jsonb_build_object(
          'reason', 'locked_source_removed',
          'detector', 'activity-graph',
          'requested_at', p_unlisted_at,
          'resolution', 'kept_published_schedule_locked',
          'unlist_reason', p_reason
        )
      )
    FROM activity_canonical_links AS link
    WHERE link.candidate_id = ANY(v_candidate_ids)
      AND link.event_id = target_event.id
      AND target_event.source_platform = 'activity-graph'
      AND (NOT p_future_events_only OR target_event.starts_at >= p_unlisted_at)
      AND COALESCE((target_event.source_metadata->>'schedule_locked')::boolean, false) IS TRUE;
  END IF;

  UPDATE events AS target_event
  SET status = 'draft'
  FROM activity_canonical_links AS link
  WHERE link.candidate_id = ANY(v_candidate_ids)
    AND link.event_id = target_event.id
    AND target_event.source_platform = 'activity-graph'
    AND (NOT p_future_events_only OR target_event.starts_at >= p_unlisted_at)
    AND (
      COALESCE(p_override_schedule_lock, false)
      OR COALESCE((target_event.source_metadata->>'schedule_locked')::boolean, false) IS NOT TRUE
    )
    AND NOT EXISTS (
      SELECT 1
      FROM activity_canonical_links AS other_link
      JOIN activity_candidates AS other_candidate
        ON other_candidate.id = other_link.candidate_id
      WHERE other_link.event_id = target_event.id
        AND other_link.candidate_id <> link.candidate_id
        AND NOT (other_link.candidate_id = ANY(v_candidate_ids))
        AND other_candidate.status = 'published'
    );

  SELECT COALESCE(array_agg(DISTINCT target_series.id), ARRAY[]::uuid[])
  INTO v_paused_series_ids
  FROM event_series AS target_series
  JOIN activity_canonical_links AS link
    ON link.event_series_id = target_series.id
  WHERE link.candidate_id = ANY(v_candidate_ids)
    AND target_series.source_platform = 'activity-graph'
    AND NOT EXISTS (
      SELECT 1
      FROM activity_canonical_links AS other_link
      JOIN activity_candidates AS other_candidate
        ON other_candidate.id = other_link.candidate_id
      WHERE other_link.event_series_id = target_series.id
        AND other_link.candidate_id <> link.candidate_id
        AND NOT (other_link.candidate_id = ANY(v_candidate_ids))
        AND other_candidate.status = 'published'
    );

  UPDATE event_series
  SET status = 'paused'
  WHERE id = ANY(v_paused_series_ids);

  UPDATE events
  SET status = 'draft'
  WHERE series_id = ANY(v_paused_series_ids)
    AND starts_at >= p_unlisted_at
    AND (
      COALESCE(p_override_schedule_lock, false)
      OR COALESCE((source_metadata->>'schedule_locked')::boolean, false) IS NOT TRUE
    );

  UPDATE activity_candidates
  SET
    status = 'unlisted',
    decision = 'unlist',
    decision_reason = p_reason,
    unlist_origin = 'system_stale',
    freshness_score = 0,
    next_check_at = NULL,
    last_checked_at = p_unlisted_at
  WHERE id = ANY(v_candidate_ids)
    AND status = 'published';
  GET DIAGNOSTICS v_unlisted = ROW_COUNT;

  RETURN v_unlisted;
END;
$$;

CREATE OR REPLACE FUNCTION apply_activity_candidate_system_unlist(
  p_candidate_ids uuid[],
  p_unlisted_at timestamptz,
  p_reason text,
  p_future_events_only boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN apply_activity_candidate_system_unlist(
    p_candidate_ids,
    p_unlisted_at,
    p_reason,
    p_future_events_only,
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION apply_activity_candidate_system_unlist(uuid[], timestamptz, text, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_activity_candidate_system_unlist(uuid[], timestamptz, text, boolean, boolean)
  TO service_role;

COMMENT ON FUNCTION apply_activity_candidate_system_unlist(uuid[], timestamptz, text, boolean, boolean) IS
  'Unlists gone activity-graph candidates. schedule_locked events stay published and are flagged, unless p_override_schedule_lock is set because at least one other confirming source is also gone.';

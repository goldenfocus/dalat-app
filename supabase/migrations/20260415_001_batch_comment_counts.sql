-- Batch comment count function for efficient grid displays
-- Returns counts for multiple targets in a single query

CREATE OR REPLACE FUNCTION get_comment_counts_batch(
  p_target_type text,
  p_target_ids uuid[]
)
RETURNS TABLE (
  target_id uuid,
  total_count bigint,
  top_level_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Validate target type
  IF p_target_type NOT IN ('event', 'moment') THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- Return empty if no IDs provided
  IF p_target_ids IS NULL OR array_length(p_target_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.target_id,
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE c.parent_id IS NULL)::bigint AS top_level_count
  FROM comments c
  WHERE c.target_type = p_target_type
    AND c.target_id = ANY(p_target_ids)
    AND c.is_deleted = false
    AND c.is_hidden = false
  GROUP BY c.target_id;
END;
$$;

-- Grant access to both anon and authenticated users
GRANT EXECUTE ON FUNCTION get_comment_counts_batch(text, uuid[]) TO anon, authenticated;

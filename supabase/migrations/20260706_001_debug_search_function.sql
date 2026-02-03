-- Debug function that mimics search_moments_by_embedding to see what's happening
CREATE OR REPLACE FUNCTION debug_search_test(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  moment_id uuid,
  moment_status text,
  raw_distance float,
  computed_similarity float,
  threshold_passed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.moment_id,
    m.status::text as moment_status,
    (me.embedding <=> query_embedding)::float as raw_distance,
    (1 - (me.embedding <=> query_embedding))::float as computed_similarity,
    ((1 - (me.embedding <=> query_embedding)) > match_threshold) as threshold_passed
  FROM moment_embeddings me
  JOIN moments m ON m.id = me.moment_id
  ORDER BY me.embedding <=> query_embedding
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION debug_search_test(vector(768), float) TO anon, authenticated;

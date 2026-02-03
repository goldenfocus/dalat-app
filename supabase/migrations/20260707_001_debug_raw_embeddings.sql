-- Debug: Check if embeddings have matching moments (no vector ops, just IDs)
CREATE OR REPLACE FUNCTION debug_embedding_moments()
RETURNS TABLE (
  embedding_moment_id uuid,
  moment_exists boolean,
  moment_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.moment_id as embedding_moment_id,
    (m.id IS NOT NULL) as moment_exists,
    m.status::text as moment_status
  FROM moment_embeddings me
  LEFT JOIN moments m ON m.id = me.moment_id
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION debug_embedding_moments() TO anon, authenticated;

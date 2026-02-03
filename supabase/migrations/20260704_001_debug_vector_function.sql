-- Debug function to check raw vector distances (no threshold filtering)
CREATE OR REPLACE FUNCTION debug_vector_distance(query_vec vector(768))
RETURNS TABLE (
  moment_id uuid,
  raw_distance float,
  computed_similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.moment_id,
    (me.embedding <=> query_vec)::float as raw_distance,
    (1 - (me.embedding <=> query_vec))::float as computed_similarity
  FROM moment_embeddings me
  ORDER BY me.embedding <=> query_vec
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION debug_vector_distance(vector(768)) TO anon, authenticated;

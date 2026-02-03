-- Lower default search threshold for text-to-image search compatibility
-- Text queries typically have lower similarity scores (~0.1-0.2) than image-to-image (~0.6-0.9)

CREATE OR REPLACE FUNCTION search_moments_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.1,  -- Lowered from 0.3 for text search
  match_count int DEFAULT 20
)
RETURNS TABLE (
  moment_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.moment_id,
    1 - (me.embedding <=> query_embedding) as similarity
  FROM moment_embeddings me
  JOIN moments m ON m.id = me.moment_id
  WHERE m.status = 'published'
    AND 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION search_moments_by_embedding IS 'Search moments by vector similarity (default threshold 0.1 for text search)';

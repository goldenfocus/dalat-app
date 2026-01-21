-- Migration: Update embeddings to 768 dimensions
-- Description: CLIP ViT-L/14 returns 768-dim vectors (not 512)

-- Drop the existing function first (depends on vector(512))
DROP FUNCTION IF EXISTS search_moments_by_embedding(vector(512), float, int);

-- Alter the embedding column to 768 dimensions
-- Note: This will fail if there's existing data, so we truncate first
TRUNCATE moment_embeddings;

ALTER TABLE moment_embeddings
ALTER COLUMN embedding TYPE vector(768);

-- Recreate the search function with 768 dimensions
CREATE OR REPLACE FUNCTION search_moments_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
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

-- Grant execute to authenticated and anon users
GRANT EXECUTE ON FUNCTION search_moments_by_embedding(vector(768), float, int) TO anon, authenticated;

COMMENT ON FUNCTION search_moments_by_embedding IS 'Search moments by vector similarity using CLIP embeddings (768-dim)';

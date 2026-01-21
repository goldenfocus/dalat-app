-- Migration: pgvector and moment embeddings
-- Description: Enables pgvector extension and creates embeddings table for visual search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE IF NOT EXISTS moment_embeddings (
  moment_id uuid PRIMARY KEY REFERENCES moments(id) ON DELETE CASCADE,
  embedding vector(512),  -- CLIP ViT-B/32 produces 512-dim vectors
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create IVFFlat index for fast similarity search
-- lists = 100 is good for up to ~100k vectors; increase for larger datasets
CREATE INDEX IF NOT EXISTS moment_embeddings_vector_idx ON moment_embeddings
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS policies
ALTER TABLE moment_embeddings ENABLE ROW LEVEL SECURITY;

-- Anyone can read embeddings (needed for search)
DROP POLICY IF EXISTS "Embeddings are publicly readable" ON moment_embeddings;
CREATE POLICY "Embeddings are publicly readable"
  ON moment_embeddings FOR SELECT
  USING (true);

-- Only service role can insert/update embeddings (API routes use service key)
DROP POLICY IF EXISTS "Service role can manage embeddings" ON moment_embeddings;
CREATE POLICY "Service role can manage embeddings"
  ON moment_embeddings FOR ALL
  USING (auth.role() = 'service_role');

-- Function to search moments by vector similarity
CREATE OR REPLACE FUNCTION search_moments_by_embedding(
  query_embedding vector(512),
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
GRANT EXECUTE ON FUNCTION search_moments_by_embedding(vector(512), float, int) TO anon, authenticated;

COMMENT ON EXTENSION vector IS 'Vector similarity search support for moment embeddings';
COMMENT ON TABLE moment_embeddings IS 'CLIP embeddings for visual search of moments';
COMMENT ON FUNCTION search_moments_by_embedding IS 'Search moments by vector similarity using CLIP embeddings';

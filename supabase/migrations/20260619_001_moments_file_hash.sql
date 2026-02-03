-- Add file_hash column to moments table for duplicate detection
-- SHA-256 hash of file content, used to detect duplicate uploads within an album

-- Add file_hash column (nullable for backwards compatibility with existing moments)
ALTER TABLE moments ADD COLUMN IF NOT EXISTS file_hash text;

-- Create index for fast per-album duplicate lookups
-- This allows quick checks: "does this hash already exist for this event?"
CREATE INDEX IF NOT EXISTS idx_moments_event_file_hash
ON moments(event_id, file_hash)
WHERE file_hash IS NOT NULL;

-- Add unique constraint to prevent duplicates at the database level
-- This is a safety net - the app will check before upload, but this prevents race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_moments_event_file_hash_unique
ON moments(event_id, file_hash)
WHERE file_hash IS NOT NULL;

-- RPC function to check for duplicate hashes in an event
-- Returns array of hashes that already exist
CREATE OR REPLACE FUNCTION check_duplicate_hashes(
  p_event_id uuid,
  p_hashes text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT m.file_hash
    FROM moments m
    WHERE m.event_id = p_event_id
      AND m.file_hash = ANY(p_hashes)
      AND m.file_hash IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_hashes(uuid, text[]) TO authenticated;

COMMENT ON COLUMN moments.file_hash IS 'SHA-256 hash of file content for duplicate detection within album';

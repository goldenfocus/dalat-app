-- Fix: Cloudflare Stream video drafts fail with duplicate key on empty media_url
--
-- Problem: saveAsDraft passes media_url="" for Cloudflare videos instead of NULL.
-- The unique index idx_moments_media_url_unique allows multiple NULLs but not
-- multiple empty strings, so the 2nd+ video upload fails with 23505.
--
-- Fix:
-- 1. Delete orphaned video moments (empty media_url + no cf_video_uid = broken)
-- 2. Clean up remaining empty strings to NULL
-- 3. Update unique index to exclude empty strings
-- 4. Update create_moment_draft RPC to accept cf_video_uid

-- Step 1: Delete orphaned video moments that have no actual video content
-- These were created by the bug (media_url="" but cf_video_uid is never saved)
DELETE FROM moments
WHERE media_url = '' AND cf_video_uid IS NULL AND content_type = 'video';

-- Step 2: For any remaining empty-string media_url rows (non-video), set to NULL
-- Need to temporarily relax the check constraint
ALTER TABLE moments DROP CONSTRAINT IF EXISTS moments_content_check;

UPDATE moments SET media_url = NULL WHERE media_url = '';

-- Re-add the check constraint (same as 20260614 version)
ALTER TABLE moments ADD CONSTRAINT moments_content_check CHECK (
  CASE
    WHEN content_type IN ('photo', 'video', 'image') THEN
      media_url IS NOT NULL OR cf_video_uid IS NOT NULL
    WHEN content_type = 'text' THEN
      text_content IS NOT NULL
    WHEN content_type IN ('youtube', 'material') THEN
      TRUE
    ELSE FALSE
  END
);

-- Step 3: Update the unique index to exclude empty strings (belt and suspenders)
DROP INDEX IF EXISTS idx_moments_media_url_unique;
CREATE UNIQUE INDEX idx_moments_media_url_unique
ON moments(media_url)
WHERE media_url IS NOT NULL AND media_url != '';

-- Step 4: Update create_moment_draft to accept cf_video_uid and handle empty strings
CREATE OR REPLACE FUNCTION create_moment_draft(
  p_event_id UUID,
  p_media_url TEXT,
  p_media_type TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_text_content TEXT DEFAULT NULL,
  p_taken_at TIMESTAMPTZ DEFAULT NULL,
  p_video_duration FLOAT DEFAULT NULL,
  p_cf_video_uid TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_moment_id UUID;
  v_content_type TEXT;
  v_media_url TEXT;
BEGIN
  -- Map media_type values to content_type values
  -- Client sends 'image'/'video', but moments table uses 'photo'/'video'/'text'
  v_content_type := CASE p_media_type
    WHEN 'image' THEN 'photo'
    WHEN 'photo' THEN 'photo'
    WHEN 'video' THEN 'video'
    ELSE 'photo'
  END;

  -- Convert empty string to NULL (prevents unique constraint violation)
  v_media_url := NULLIF(TRIM(p_media_url), '');

  INSERT INTO moments (
    event_id, user_id, content_type, media_url, thumbnail_url,
    text_content, video_duration_seconds, status, cf_video_uid
  ) VALUES (
    p_event_id, auth.uid(), v_content_type, v_media_url, p_thumbnail_url,
    p_text_content, p_video_duration, 'draft', p_cf_video_uid
  ) RETURNING id INTO v_moment_id;

  RETURN v_moment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

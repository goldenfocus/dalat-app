-- Fix: file_hash not saved during draft creation, breaking duplicate detection
--
-- Problem: create_moment_draft() has no p_file_hash parameter.
-- SHA-256 hash is computed client-side but never stored in the draft row.
-- When user re-uploads the same folder, check_duplicate_hashes() finds
-- no matching hashes and uploads everything again.
--
-- Fix: Add p_file_hash parameter to create_moment_draft().

CREATE OR REPLACE FUNCTION create_moment_draft(
  p_event_id UUID,
  p_media_url TEXT,
  p_media_type TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_text_content TEXT DEFAULT NULL,
  p_taken_at TIMESTAMPTZ DEFAULT NULL,
  p_video_duration FLOAT DEFAULT NULL,
  p_cf_video_uid TEXT DEFAULT NULL,
  p_file_hash TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_moment_id UUID;
  v_content_type TEXT;
  v_media_url TEXT;
BEGIN
  -- Map media_type values to content_type values
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
    text_content, video_duration_seconds, status, cf_video_uid, file_hash
  ) VALUES (
    p_event_id, auth.uid(), v_content_type, v_media_url, p_thumbnail_url,
    p_text_content, p_video_duration, 'draft', p_cf_video_uid, p_file_hash
  ) RETURNING id INTO v_moment_id;

  RETURN v_moment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

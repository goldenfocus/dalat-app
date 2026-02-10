-- Fix create_moment_draft: wrong column names from 20260719 migration
-- Errors: media_type→content_type, taken_at doesn't exist, video_duration→video_duration_seconds
-- Also maps 'image'→'photo' for content_type values

-- 1. Fix create_moment_draft
CREATE OR REPLACE FUNCTION create_moment_draft(
  p_event_id UUID,
  p_media_url TEXT,
  p_media_type TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_text_content TEXT DEFAULT NULL,
  p_taken_at TIMESTAMPTZ DEFAULT NULL,
  p_video_duration FLOAT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_moment_id UUID;
  v_content_type TEXT;
BEGIN
  -- Map media_type values to content_type values
  -- Client sends 'image'/'video', but moments table uses 'photo'/'video'/'text'
  v_content_type := CASE p_media_type
    WHEN 'image' THEN 'photo'
    WHEN 'photo' THEN 'photo'
    WHEN 'video' THEN 'video'
    ELSE 'photo'
  END;

  INSERT INTO moments (
    event_id, user_id, content_type, media_url, thumbnail_url,
    text_content, video_duration_seconds, status
  ) VALUES (
    p_event_id, auth.uid(), v_content_type, p_media_url, p_thumbnail_url,
    p_text_content, p_video_duration, 'draft'
  ) RETURNING id INTO v_moment_id;

  RETURN v_moment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix publish_user_drafts: moments_require_approval is on event_settings, not events
CREATE OR REPLACE FUNCTION publish_user_drafts(
  p_event_id UUID
) RETURNS INT AS $$
DECLARE
  v_count INT;
  v_require_approval BOOLEAN;
  v_new_status TEXT;
BEGIN
  -- Check if event requires moment approval (column is on event_settings, not events)
  SELECT moments_require_approval INTO v_require_approval
  FROM event_settings WHERE event_id = p_event_id;

  -- If approval required, go to 'pending', else 'published'
  v_new_status := CASE WHEN COALESCE(v_require_approval, false) THEN 'pending' ELSE 'published' END;

  UPDATE moments
  SET status = v_new_status,
      updated_at = NOW()
  WHERE event_id = p_event_id
    AND user_id = auth.uid()
    AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix get_user_drafts to use correct column names
CREATE OR REPLACE FUNCTION get_user_drafts(
  p_event_id UUID
) RETURNS TABLE (
  id UUID,
  media_url TEXT,
  media_type TEXT,
  thumbnail_url TEXT,
  text_content TEXT,
  taken_at TIMESTAMPTZ,
  video_duration FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.media_url, m.content_type AS media_type, m.thumbnail_url,
         m.text_content, m.created_at AS taken_at, m.video_duration_seconds::FLOAT AS video_duration, m.created_at
  FROM moments m
  WHERE m.event_id = p_event_id
    AND m.user_id = auth.uid()
    AND m.status = 'draft'
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

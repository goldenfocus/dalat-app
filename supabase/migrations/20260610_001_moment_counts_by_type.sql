-- Add photo and video counts to get_moment_counts function
-- This allows the UI to show icon badges like 📷 8  🎬 4

CREATE OR REPLACE FUNCTION get_moment_counts(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_published int;
  v_pending int;
  v_photo_count int;
  v_video_count int;
  v_is_creator boolean;
BEGIN
  -- Get counts by type for published moments
  SELECT
    count(*) FILTER (WHERE status = 'published'),
    count(*) FILTER (WHERE status = 'published' AND content_type = 'photo'),
    count(*) FILTER (WHERE status = 'published' AND content_type = 'video')
  INTO v_published, v_photo_count, v_video_count
  FROM moments
  WHERE event_id = p_event_id;

  -- Only include pending count if user is event creator
  v_is_creator := EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id AND created_by = auth.uid()
  );

  IF v_is_creator THEN
    SELECT count(*) FILTER (WHERE status = 'pending')
    INTO v_pending
    FROM moments
    WHERE event_id = p_event_id;
  ELSE
    v_pending := 0;
  END IF;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'published_count', v_published,
    'pending_count', v_pending,
    'photo_count', v_photo_count,
    'video_count', v_video_count
  );
END;
$$;

-- Permissions already granted in original migration

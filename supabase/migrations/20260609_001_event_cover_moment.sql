-- ============================================
-- Add cover moment selection for events
-- ============================================

-- Add cover_moment_id to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS cover_moment_id uuid REFERENCES moments(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_events_cover_moment ON events(cover_moment_id) WHERE cover_moment_id IS NOT NULL;

-- ============================================
-- RPC: Set event cover moment
-- ============================================
CREATE OR REPLACE FUNCTION set_event_cover_moment(
  p_event_id uuid,
  p_moment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_organizer_id uuid;
  v_is_superadmin boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get event organizer
  SELECT organizer_id INTO v_organizer_id
  FROM events WHERE id = p_event_id;

  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Check if user is organizer or superadmin
  SELECT is_superadmin INTO v_is_superadmin
  FROM profiles WHERE id = v_user_id;

  IF v_organizer_id != v_user_id AND v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Verify moment belongs to this event (if not null)
  IF p_moment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM moments
      WHERE id = p_moment_id
        AND event_id = p_event_id
        AND status = 'published'
    ) THEN
      RAISE EXCEPTION 'Moment not found or not published';
    END IF;
  END IF;

  -- Update the cover
  UPDATE events
  SET cover_moment_id = p_moment_id
  WHERE id = p_event_id;

  RETURN true;
END;
$$;

-- ============================================
-- Update moments strip to prefer cover moment
-- ============================================
CREATE OR REPLACE FUNCTION get_homepage_moments_strip(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  media_url text,
  thumbnail_url text,
  content_type text,
  event_slug text,
  event_title text,
  event_image_url text,
  user_avatar_url text,
  username text,
  display_name text,
  created_at timestamptz,
  quality_score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT DISTINCT ON (m.event_id)
      m.id,
      m.media_url,
      m.thumbnail_url,
      m.content_type,
      e.slug as event_slug,
      e.title as event_title,
      e.image_url as event_image_url,
      p.avatar_url as user_avatar_url,
      p.username,
      p.display_name,
      m.created_at,
      COALESCE(mm.quality_score, 0.5) as quality_score
    FROM moments m
    JOIN events e ON e.id = m.event_id
    JOIN profiles p ON p.id = m.user_id
    LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
    LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = p_user_id
    WHERE m.status = 'published'
      AND m.content_type IN ('photo', 'video', 'image')
      AND (m.media_url IS NOT NULL OR m.thumbnail_url IS NOT NULL)
      AND e.status = 'published'
      AND e.starts_at < now()
    ORDER BY
      m.event_id,
      -- 1. Prefer manually selected cover moment
      CASE WHEN e.cover_moment_id = m.id THEN 0 ELSE 1 END,
      -- 2. Then events user attended
      CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
      -- 3. Then by quality score
      COALESCE(mm.quality_score, 0.5) DESC,
      m.created_at DESC
  ) sub
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

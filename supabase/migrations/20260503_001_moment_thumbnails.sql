-- Add thumbnail_url column to moments table for video thumbnails
-- This stores a generated thumbnail image for video moments,
-- ensuring reliable thumbnail display on mobile devices

ALTER TABLE moments
ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Add comment explaining the column
COMMENT ON COLUMN moments.thumbnail_url IS 'URL of generated thumbnail for video moments (JPEG stored in Supabase Storage)';

-- Update the create_moment function to accept thumbnail_url
CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en',
  p_thumbnail_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_event record;
  v_moment_id uuid;
  v_status text;
  v_user_role text;
BEGIN
  -- Determine user: use p_user_id if provided by a superadmin (God Mode), otherwise auth.uid()
  IF p_user_id IS NOT NULL THEN
    -- Verify caller is a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Only superadmins can post on behalf of others';
    END IF;
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get event details
  SELECT id, moments_enabled, moments_who_can_post, moments_require_approval, creator_id
  INTO v_event
  FROM events
  WHERE id = p_event_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Check if moments are enabled
  IF NOT v_event.moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's role for this event
  SELECT role INTO v_user_role
  FROM event_rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  -- Check posting permission
  IF v_event.moments_who_can_post = 'rsvp' THEN
    IF v_user_role IS NULL AND v_event.creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_event.moments_who_can_post = 'confirmed' THEN
    IF v_user_role NOT IN ('going', 'host', 'cohost', 'speaker') AND v_event.creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;
  -- 'anyone' allows all authenticated users

  -- Determine initial status
  IF v_event.moments_require_approval AND v_event.creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Create the moment
  INSERT INTO moments (event_id, user_id, content_type, media_url, text_content, status, source_locale, thumbnail_url)
  VALUES (p_event_id, v_user_id, p_content_type, p_media_url, p_text_content, v_status, p_source_locale, p_thumbnail_url)
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

-- Update the batch creation function to support thumbnails
DROP FUNCTION IF EXISTS create_moments_batch(uuid, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION create_moments_batch(
  p_event_id uuid,
  p_moments jsonb,
  p_effective_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_event record;
  v_status text;
  v_batch_id uuid;
  v_moment_count int := 0;
  v_moment_ids uuid[] := '{}';
  v_user_role text;
BEGIN
  -- Determine user: use p_effective_user_id if provided by a superadmin (God Mode), otherwise auth.uid()
  IF p_effective_user_id IS NOT NULL THEN
    -- Verify caller is a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Only superadmins can post on behalf of others';
    END IF;
    v_user_id := p_effective_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get event details
  SELECT id, moments_enabled, moments_who_can_post, moments_require_approval, creator_id
  INTO v_event
  FROM events
  WHERE id = p_event_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Check if moments are enabled
  IF NOT v_event.moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's role for this event
  SELECT role INTO v_user_role
  FROM event_rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  -- Check posting permission
  IF v_event.moments_who_can_post = 'rsvp' THEN
    IF v_user_role IS NULL AND v_event.creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_event.moments_who_can_post = 'confirmed' THEN
    IF v_user_role NOT IN ('going', 'host', 'cohost', 'speaker') AND v_event.creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;

  -- Determine initial status
  IF v_event.moments_require_approval AND v_event.creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Generate batch ID
  v_batch_id := gen_random_uuid();

  -- Insert all moments in the batch
  WITH inserted AS (
    INSERT INTO moments (
      event_id,
      user_id,
      content_type,
      media_url,
      text_content,
      status,
      batch_id,
      source_locale,
      thumbnail_url
    )
    SELECT
      p_event_id,
      v_user_id,
      (m->>'content_type')::text,
      m->>'media_url',
      m->>'text_content',
      v_status,
      v_batch_id,
      COALESCE(m->>'source_locale', p_source_locale),
      m->>'thumbnail_url'
    FROM jsonb_array_elements(p_moments) AS m
    RETURNING id
  )
  SELECT array_agg(id), count(*) INTO v_moment_ids, v_moment_count FROM inserted;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'moment_ids', v_moment_ids,
    'count', v_moment_count,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moment(uuid, text, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_moments_batch(uuid, jsonb, uuid, text) TO authenticated;

-- Update get_event_moments to include thumbnail_url
DROP FUNCTION IF EXISTS get_event_moments(uuid, int, int);

CREATE OR REPLACE FUNCTION get_event_moments(
  p_event_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  thumbnail_url text,
  text_content text,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.thumbnail_url,
    m.text_content,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.status = 'published'
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

-- Update get_feed_moments_grouped to include thumbnail_url
DROP FUNCTION IF EXISTS get_feed_moments_grouped(int, int, int, text[]);

CREATE OR REPLACE FUNCTION get_feed_moments_grouped(
  p_event_limit int DEFAULT 10,
  p_moments_per_event int DEFAULT 6,
  p_event_offset int DEFAULT 0,
  p_content_types text[] DEFAULT ARRAY['photo', 'video']
)
RETURNS TABLE (
  event_id uuid,
  event_slug text,
  event_title text,
  event_starts_at timestamptz,
  event_image_url text,
  event_location_name text,
  total_moment_count bigint,
  moments jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH feed_moments AS (
    SELECT
      m.id,
      m.event_id,
      m.user_id,
      m.content_type,
      m.media_url,
      m.thumbnail_url,
      m.text_content,
      m.created_at,
      p.username,
      p.display_name,
      p.avatar_url,
      e.slug as event_slug,
      e.title as event_title,
      e.starts_at as event_starts_at,
      e.image_url as event_image_url,
      e.location_name as event_location_name,
      ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.created_at DESC) as moment_rank
    FROM moments m
    JOIN profiles p ON p.id = m.user_id
    JOIN events e ON e.id = m.event_id
    WHERE m.status = 'published'
      AND m.content_type::text = ANY(p_content_types)
      AND e.status = 'published'
      AND e.starts_at < now()
  ),
  event_stats AS (
    SELECT
      event_id,
      COUNT(*) as total_count
    FROM feed_moments
    GROUP BY event_id
  ),
  events_with_moments AS (
    SELECT DISTINCT ON (fm.event_id)
      fm.event_id,
      fm.event_slug,
      fm.event_title,
      fm.event_starts_at,
      fm.event_image_url,
      fm.event_location_name,
      fm.created_at as latest_moment_at,
      es.total_count
    FROM feed_moments fm
    JOIN event_stats es ON es.event_id = fm.event_id
    ORDER BY fm.event_id, fm.created_at DESC
  ),
  paginated_events AS (
    SELECT *
    FROM events_with_moments
    ORDER BY latest_moment_at DESC
    LIMIT p_event_limit
    OFFSET p_event_offset
  )
  SELECT
    pe.event_id,
    pe.event_slug,
    pe.event_title,
    pe.event_starts_at,
    pe.event_image_url,
    pe.event_location_name,
    pe.total_count as total_moment_count,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', fm.id,
          'user_id', fm.user_id,
          'username', fm.username,
          'display_name', fm.display_name,
          'avatar_url', fm.avatar_url,
          'content_type', fm.content_type,
          'media_url', fm.media_url,
          'thumbnail_url', fm.thumbnail_url,
          'text_content', fm.text_content,
          'created_at', fm.created_at
        )
        ORDER BY fm.created_at DESC
      )
      FROM feed_moments fm
      WHERE fm.event_id = pe.event_id
        AND fm.moment_rank <= p_moments_per_event
    ) as moments
  FROM paginated_events pe
  ORDER BY pe.latest_moment_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_feed_moments_grouped(int, int, int, text[]) TO anon, authenticated;

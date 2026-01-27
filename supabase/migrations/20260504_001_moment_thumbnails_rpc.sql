-- Update RPCs to include thumbnail_url in returned data

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

-- Update get_user_moments_grouped to include thumbnail_url
DROP FUNCTION IF EXISTS get_user_moments_grouped(uuid, int, int, int, text[]);

CREATE OR REPLACE FUNCTION get_user_moments_grouped(
  p_user_id uuid,
  p_event_limit int DEFAULT 10,
  p_moments_per_event int DEFAULT 6,
  p_event_offset int DEFAULT 0,
  p_content_types text[] DEFAULT ARRAY['photo', 'video', 'text']
)
RETURNS TABLE (
  event_id uuid,
  event_slug text,
  event_title text,
  event_starts_at timestamptz,
  event_image_url text,
  moments jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_event_moments AS (
    SELECT
      m.id,
      m.event_id,
      m.content_type,
      m.media_url,
      m.thumbnail_url,
      m.text_content,
      m.created_at,
      e.slug as event_slug,
      e.title as event_title,
      e.starts_at as event_starts_at,
      e.image_url as event_image_url,
      ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.created_at DESC) as moment_rank
    FROM moments m
    JOIN events e ON e.id = m.event_id
    WHERE m.user_id = p_user_id
      AND m.status = 'published'
      AND m.content_type::text = ANY(p_content_types)
      AND e.status = 'published'
  ),
  events_with_moments AS (
    SELECT DISTINCT ON (uem.event_id)
      uem.event_id,
      uem.event_slug,
      uem.event_title,
      uem.event_starts_at,
      uem.event_image_url,
      uem.created_at as latest_moment_at
    FROM user_event_moments uem
    ORDER BY uem.event_id, uem.created_at DESC
  ),
  paginated_events AS (
    SELECT *
    FROM events_with_moments
    ORDER BY event_starts_at DESC
    LIMIT p_event_limit
    OFFSET p_event_offset
  )
  SELECT
    pe.event_id,
    pe.event_slug,
    pe.event_title,
    pe.event_starts_at,
    pe.event_image_url,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', uem.id,
          'content_type', uem.content_type,
          'media_url', uem.media_url,
          'thumbnail_url', uem.thumbnail_url,
          'text_content', uem.text_content,
          'created_at', uem.created_at
        )
        ORDER BY uem.created_at DESC
      )
      FROM user_event_moments uem
      WHERE uem.event_id = pe.event_id
        AND uem.moment_rank <= p_moments_per_event
    ) as moments
  FROM paginated_events pe
  ORDER BY pe.event_starts_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_user_moments_grouped(uuid, int, int, int, text[]) TO anon, authenticated;

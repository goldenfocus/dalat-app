-- Migration: User moments grouped by event
-- Description: RPC function to fetch a user's moments grouped by event for profile pages

-- RPC function to get a user's moments grouped by event
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
    -- Get all published moments for this user with event info
    SELECT
      m.id,
      m.event_id,
      m.content_type,
      m.media_url,
      m.text_content,
      m.created_at,
      e.slug as event_slug,
      e.title as event_title,
      e.starts_at as event_starts_at,
      e.image_url as event_image_url,
      -- Rank moments within each event by created_at (newest first)
      ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.created_at DESC) as moment_rank
    FROM moments m
    JOIN events e ON e.id = m.event_id
    WHERE m.user_id = p_user_id
      AND m.status = 'published'
      AND m.content_type::text = ANY(p_content_types)
      AND e.status = 'published'
  ),
  events_with_moments AS (
    -- Get distinct events ordered by most recent moment
    SELECT DISTINCT ON (event_id)
      event_id,
      event_slug,
      event_title,
      event_starts_at,
      event_image_url,
      created_at as latest_moment_at
    FROM user_event_moments
    ORDER BY event_id, created_at DESC
  ),
  paginated_events AS (
    -- Paginate events by most recent moment
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
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', uem.id,
          'content_type', uem.content_type,
          'media_url', uem.media_url,
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
  ORDER BY pe.latest_moment_at DESC;
$$;

-- Grant execute to authenticated and anon users (public profiles are viewable)
GRANT EXECUTE ON FUNCTION get_user_moments_grouped(uuid, int, int, int, text[]) TO anon, authenticated;

COMMENT ON FUNCTION get_user_moments_grouped IS 'Fetches a user''s published moments grouped by event, ordered by most recent moment. Used for profile pages.';

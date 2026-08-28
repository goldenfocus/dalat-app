-- Return Cloudflare Stream metadata from the tribe moments gallery RPC.
--
-- Stream-backed videos intentionally have a NULL media_url. The tribe gallery
-- therefore needs cf_video_uid/cf_playback_url (plus thumbnail/status metadata)
-- so MomentCard can derive and render the Stream thumbnail.

CREATE OR REPLACE FUNCTION get_tribe_moments_grouped(
  p_tribe_id uuid,
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
  WITH viewer AS (
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM tribe_members tm
          WHERE tm.tribe_id = p_tribe_id
            AND tm.user_id = auth.uid()
            AND tm.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM tribes t
          WHERE t.id = p_tribe_id
            AND t.created_by = auth.uid()
        )
      ) AS is_member,
      (
        SELECT t.access_type = 'secret'
        FROM tribes t
        WHERE t.id = p_tribe_id
      ) AS is_secret
  ),
  tribe_event_moments AS (
    SELECT
      m.id,
      m.event_id,
      m.content_type,
      m.media_url,
      m.thumbnail_url,
      m.cf_video_uid,
      m.cf_playback_url,
      m.video_status,
      m.video_duration_seconds,
      m.text_content,
      m.ai_description,
      m.created_at,
      e.slug AS event_slug,
      e.title AS event_title,
      e.starts_at AS event_starts_at,
      e.image_url AS event_image_url,
      ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.created_at DESC) AS moment_rank
    FROM moments m
    JOIN events e ON e.id = m.event_id
    CROSS JOIN viewer v
    WHERE e.tribe_id = p_tribe_id
      AND m.status = 'published'
      AND m.content_type::text = ANY(p_content_types)
      AND e.status = 'published'
      -- Secret tribes reveal nothing to non-members.
      AND (v.is_member OR NOT COALESCE(v.is_secret, true))
      -- Non-members only ever see events explicitly marked public.
      AND (v.is_member OR e.tribe_visibility = 'public')
  ),
  events_with_moments AS (
    SELECT DISTINCT ON (event_id)
      event_id,
      event_slug,
      event_title,
      event_starts_at,
      event_image_url,
      created_at AS latest_moment_at
    FROM tribe_event_moments
    ORDER BY event_id, created_at DESC
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
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', tem.id,
          'content_type', tem.content_type,
          'media_url', tem.media_url,
          'thumbnail_url', tem.thumbnail_url,
          'cf_video_uid', tem.cf_video_uid,
          'cf_playback_url', tem.cf_playback_url,
          'video_status', tem.video_status,
          'video_duration_seconds', tem.video_duration_seconds,
          'text_content', tem.text_content,
          'ai_description', tem.ai_description,
          'created_at', tem.created_at
        )
        ORDER BY tem.created_at DESC
      )
      FROM tribe_event_moments tem
      WHERE tem.event_id = pe.event_id
        AND tem.moment_rank <= p_moments_per_event
    ) AS moments
  FROM paginated_events pe
  ORDER BY pe.latest_moment_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_tribe_moments_grouped(uuid, int, int, int, text[]) TO anon, authenticated;

COMMENT ON FUNCTION get_tribe_moments_grouped IS 'Fetches a tribe''s published moments grouped by event, including Cloudflare Stream metadata. Enforces tribe/event visibility internally via auth.uid(). Used for tribe profile pages.';

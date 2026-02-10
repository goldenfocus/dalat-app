-- ============================================
-- Related Events with Moments for End Screen Discovery
-- ============================================
-- Returns past events that have photo/video moments, ranked by relevance:
-- 1. Same venue (highest priority)
-- 2. Same organizer
-- 3. Overlapping AI tags
-- Used in immersive view end screen for "Keep exploring" discovery.

CREATE OR REPLACE FUNCTION get_related_events_with_moments(
  p_event_id uuid,
  p_limit int DEFAULT 4
)
RETURNS TABLE (
  event_id uuid,
  event_slug text,
  event_title text,
  event_image_url text,
  cover_thumbnail_url text,
  photo_count int,
  video_count int,
  match_reason text,
  relevance_score float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_organizer_id uuid;
  v_ai_tags text[];
BEGIN
  -- Get source event's matching criteria
  SELECT e.venue_id, e.organizer_id, COALESCE(e.ai_tags, '{}')
  INTO v_venue_id, v_organizer_id, v_ai_tags
  FROM events e
  WHERE e.id = p_event_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH event_moments AS (
    -- Count photos and videos per event, get cover thumbnail
    SELECT
      m.event_id,
      count(*) FILTER (WHERE m.content_type = 'photo')::int as photo_count,
      count(*) FILTER (WHERE m.content_type = 'video')::int as video_count,
      -- Get cover moment thumbnail (or first moment's thumbnail)
      (
        SELECT COALESCE(cm.thumbnail_url, cm.media_url)
        FROM moments cm
        WHERE cm.event_id = m.event_id
          AND cm.status = 'published'
          AND cm.content_type IN ('photo', 'video', 'image')
          AND (cm.thumbnail_url IS NOT NULL OR cm.media_url IS NOT NULL)
        ORDER BY
          CASE WHEN cm.id = (SELECT cover_moment_id FROM events WHERE id = cm.event_id) THEN 0 ELSE 1 END,
          cm.created_at DESC
        LIMIT 1
      ) as cover_thumbnail
    FROM moments m
    WHERE m.status = 'published'
      AND m.content_type IN ('photo', 'video', 'image')
    GROUP BY m.event_id
    HAVING count(*) FILTER (WHERE m.content_type IN ('photo', 'video')) > 0
  ),
  scored_events AS (
    SELECT
      e.id as event_id,
      e.slug as event_slug,
      e.title as event_title,
      e.image_url as event_image_url,
      em.cover_thumbnail as cover_thumbnail_url,
      em.photo_count,
      em.video_count,
      -- Determine primary match reason
      CASE
        WHEN e.venue_id = v_venue_id AND v_venue_id IS NOT NULL THEN 'same_venue'
        WHEN e.organizer_id = v_organizer_id AND v_organizer_id IS NOT NULL THEN 'same_organizer'
        WHEN COALESCE(e.ai_tags, '{}') && v_ai_tags AND array_length(v_ai_tags, 1) > 0 THEN 'similar_vibe'
        ELSE 'related'
      END as match_reason,
      -- Calculate relevance score
      (
        CASE WHEN e.venue_id = v_venue_id AND v_venue_id IS NOT NULL THEN 10.0 ELSE 0.0 END
        + CASE WHEN e.organizer_id = v_organizer_id AND v_organizer_id IS NOT NULL THEN 8.0 ELSE 0.0 END
        + COALESCE((
          SELECT count(*)::float * 2.0
          FROM unnest(COALESCE(e.ai_tags, '{}')) t
          WHERE t = ANY(v_ai_tags)
        ), 0)
        -- Slight boost for events with more moments (logarithmic)
        + ln(1 + em.photo_count + em.video_count) * 0.5
      ) as relevance_score
    FROM events e
    JOIN event_moments em ON em.event_id = e.id
    WHERE e.id != p_event_id
      AND e.status = 'published'
      AND e.starts_at < now()  -- Past events only
      AND COALESCE(e.spam_score, 0) < 0.8
      AND (
        -- At least one matching criterion
        (e.venue_id = v_venue_id AND v_venue_id IS NOT NULL)
        OR (e.organizer_id = v_organizer_id AND v_organizer_id IS NOT NULL)
        OR (COALESCE(e.ai_tags, '{}') && v_ai_tags AND array_length(v_ai_tags, 1) > 0)
      )
  )
  SELECT
    se.event_id,
    se.event_slug,
    se.event_title,
    se.event_image_url,
    se.cover_thumbnail_url,
    se.photo_count,
    se.video_count,
    se.match_reason,
    se.relevance_score
  FROM scored_events se
  ORDER BY se.relevance_score DESC, se.event_slug
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_related_events_with_moments(uuid, int) TO anon, authenticated;

COMMENT ON FUNCTION get_related_events_with_moments IS
  'Get related past events with photo/video moments for end-of-album discovery. Matches by venue, organizer, or tags.';

NOTIFY pgrst, 'reload schema';

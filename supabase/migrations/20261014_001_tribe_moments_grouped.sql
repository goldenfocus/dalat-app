-- Migration: Tribe moments grouped by event
-- Description: RPC function to fetch a tribe's moments grouped by event for tribe profile pages.
--              Mirrors get_user_moments_grouped (20260323_001) but scoped to events.tribe_id.
--
-- SECURITY NOTE: This function is SECURITY DEFINER, so it bypasses RLS. It therefore
-- enforces tribe visibility INTERNALLY using auth.uid(). Do NOT add an "is member"
-- boolean parameter -- the function is callable directly from the browser, so any
-- caller-supplied membership flag could simply be spoofed to true.
--
-- Gate mirrors app/[locale]/tribes/[slug]/page.tsx:
--   * secret tribes           -> non-members get zero rows
--   * non-members (any tribe) -> only events with tribe_visibility = 'public'
--   * members / leader        -> all published events in the tribe

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
      -- Active membership, or the tribe creator (who may predate a members row)
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
      m.text_content,
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
      -- Secret tribes reveal nothing to non-members
      AND (v.is_member OR NOT COALESCE(v.is_secret, true))
      -- Non-members only ever see events explicitly marked public
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
          'text_content', tem.text_content,
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

COMMENT ON FUNCTION get_tribe_moments_grouped IS 'Fetches a tribe''s published moments grouped by event, ordered by most recent moment. Enforces tribe/event visibility internally via auth.uid(). Used for tribe profile pages.';


-- Lightweight counter for the profile stats row (members / events / moments).
-- Same visibility gate as above so the moment count never leaks the size of a
-- private tribe's gallery to a non-member.
CREATE OR REPLACE FUNCTION get_tribe_moment_count(p_tribe_id uuid)
RETURNS int
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
  )
  SELECT COALESCE(COUNT(m.id), 0)::int
  FROM moments m
  JOIN events e ON e.id = m.event_id
  CROSS JOIN viewer v
  WHERE e.tribe_id = p_tribe_id
    AND m.status = 'published'
    AND e.status = 'published'
    AND (v.is_member OR NOT COALESCE(v.is_secret, true))
    AND (v.is_member OR e.tribe_visibility = 'public');
$$;

GRANT EXECUTE ON FUNCTION get_tribe_moment_count(uuid) TO anon, authenticated;

COMMENT ON FUNCTION get_tribe_moment_count IS 'Counts a tribe''s visible published moments for the profile stats row. Same visibility gate as get_tribe_moments_grouped.';

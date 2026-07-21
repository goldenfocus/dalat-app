-- 20261012_001_moments_captured_at
--
-- Write the real capture time into moments.captured_at, and make lightbox
-- prev/next agree with the gallery's sort order.
--
-- Background: captured_at has existed (and been indexed, and been used by
-- get_event_moments' ORDER BY) since Jul 2026, but nothing ever wrote to it, so
-- every gallery silently sorted by upload time. The client now reads EXIF from
-- the original File before compression destroys it — see lib/exif-capture-time.ts.
--
-- Both function bodies below were regenerated verbatim from pg_get_functiondef()
-- on prod and changed only on the captured_at lines. Do not rewrite them from
-- scratch: create_moment is 25 parameters of accumulated behaviour and has no
-- other source of truth.

-- ---------------------------------------------------------------------------
-- 1. create_moment: accept and persist p_captured_at
-- ---------------------------------------------------------------------------
-- DROP first, deliberately. CREATE OR REPLACE with an extra parameter would
-- create an OVERLOAD rather than replace, and every existing 25-argument call
-- would then match both signatures -> "function is not unique" -> all moment
-- posting breaks. Dropping and recreating inside this transaction is the safe
-- path; nothing can observe the gap.
DROP FUNCTION IF EXISTS public.create_moment(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text, text,
  text, bigint, text, text, text, text, integer, text, text, integer, text, text
);

CREATE OR REPLACE FUNCTION public.create_moment(p_event_id uuid, p_content_type text, p_media_url text DEFAULT NULL::text, p_text_content text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_source_locale text DEFAULT 'en'::text, p_thumbnail_url text DEFAULT NULL::text, p_cf_video_uid text DEFAULT NULL::text, p_cf_playback_url text DEFAULT NULL::text, p_video_status text DEFAULT 'ready'::text, p_youtube_url text DEFAULT NULL::text, p_youtube_video_id text DEFAULT NULL::text, p_file_url text DEFAULT NULL::text, p_original_filename text DEFAULT NULL::text, p_file_size bigint DEFAULT NULL::bigint, p_mime_type text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_artist text DEFAULT NULL::text, p_album text DEFAULT NULL::text, p_audio_duration_seconds integer DEFAULT NULL::integer, p_audio_thumbnail_url text DEFAULT NULL::text, p_track_number text DEFAULT NULL::text, p_release_year integer DEFAULT NULL::integer, p_genre text DEFAULT NULL::text, p_file_hash text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_event_creator_id uuid;
  v_moments_enabled boolean;
  v_moments_who_can_post text;
  v_moments_require_approval boolean;
  v_moment_id uuid;
  v_status text;
  v_has_rsvp boolean;
  v_rsvp_status text;
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

  -- Get event creator
  SELECT created_by INTO v_event_creator_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_creator_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Get moments settings from event_settings table (with defaults if not found)
  SELECT
    COALESCE(es.moments_enabled, true),
    COALESCE(es.moments_who_can_post, 'anyone'),
    COALESCE(es.moments_require_approval, false)
  INTO v_moments_enabled, v_moments_who_can_post, v_moments_require_approval
  FROM event_settings es
  WHERE es.event_id = p_event_id;

  -- If no settings exist, use defaults
  IF NOT FOUND THEN
    v_moments_enabled := true;
    v_moments_who_can_post := 'anyone';
    v_moments_require_approval := false;
  END IF;

  -- Check if moments are enabled
  IF NOT v_moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's RSVP status for this event
  SELECT status INTO v_rsvp_status
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  v_has_rsvp := v_rsvp_status IS NOT NULL;

  -- Check posting permission
  IF v_moments_who_can_post = 'rsvp' THEN
    IF NOT v_has_rsvp AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_moments_who_can_post = 'confirmed' THEN
    IF v_rsvp_status != 'going' AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;

  -- Determine initial status
  IF v_moments_require_approval AND v_event_creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Create the moment with ALL fields
  INSERT INTO moments (
    event_id, user_id, content_type, media_url, text_content, status,
    source_locale, thumbnail_url, cf_video_uid, cf_playback_url, video_status,
    youtube_url, youtube_video_id,
    file_url, original_filename, file_size, mime_type,
    title, artist, album, audio_duration_seconds, audio_thumbnail_url,
    track_number, release_year, genre,
    file_hash, captured_at
  )
  VALUES (
    p_event_id, v_user_id, p_content_type, p_media_url, p_text_content, v_status,
    p_source_locale, p_thumbnail_url, p_cf_video_uid, p_cf_playback_url, p_video_status,
    p_youtube_url, p_youtube_video_id,
    p_file_url, p_original_filename, p_file_size, p_mime_type,
    p_title, p_artist, p_album, p_audio_duration_seconds, p_audio_thumbnail_url,
    p_track_number, p_release_year, p_genre,
    p_file_hash, p_captured_at
  )
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$function$;

-- Restore the grants the DROP removed (verified against prod's proacl).
GRANT EXECUTE ON FUNCTION public.create_moment(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text, text,
  text, bigint, text, text, text, text, integer, text, text, integer, text, text,
  timestamptz
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. create_moment_draft: stop ignoring the p_taken_at it already accepts
-- ---------------------------------------------------------------------------
-- The parameter has been in the signature since 20260728 but was dropped from
-- the INSERT body and never rewired. Signature is unchanged, so a plain
-- CREATE OR REPLACE is safe here and grants survive.

CREATE OR REPLACE FUNCTION public.create_moment_draft(p_event_id uuid, p_media_url text, p_media_type text, p_thumbnail_url text DEFAULT NULL::text, p_text_content text DEFAULT NULL::text, p_taken_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_video_duration double precision DEFAULT NULL::double precision, p_cf_video_uid text DEFAULT NULL::text, p_file_hash text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    text_content, video_duration_seconds, status, cf_video_uid, file_hash, captured_at
  ) VALUES (
    p_event_id, auth.uid(), v_content_type, v_media_url, p_thumbnail_url,
    p_text_content, p_video_duration, 'draft', p_cf_video_uid, p_file_hash, p_taken_at
  ) RETURNING id INTO v_moment_id;

  RETURN v_moment_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. get_adjacent_moments: lightbox prev/next on the gallery's sort key
-- ---------------------------------------------------------------------------
-- The moment page navigated with .lt/.gt("created_at") while the grid ordered by
-- COALESCE(captured_at, created_at). That was harmless only because captured_at
-- was uniformly NULL. Now that real capture times land, the two keys diverge and
-- next/prev would jump to unrelated photos.
--
-- A cursor over COALESCE(...) can't be expressed in PostgREST's .lt()/.gt(), so
-- this moves server-side as LAG/LEAD over exactly the ORDER BY that
-- get_event_moments uses. Also collapses the page's 4 round trips into 1.
--
-- SECURITY INVOKER: prev/next must honour the caller's RLS, same as the grid.
CREATE OR REPLACE FUNCTION public.get_adjacent_moments(
  p_moment_id uuid,
  p_event_id uuid
)
RETURNS TABLE (
  prev_id uuid,
  prev_media_url text,
  next_id uuid,
  next_media_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH ordered AS (
    SELECT
      m.id,
      m.media_url,
      LAG(m.id)         OVER w AS prev_id,
      LAG(m.media_url)  OVER w AS prev_media_url,
      LEAD(m.id)        OVER w AS next_id,
      LEAD(m.media_url) OVER w AS next_media_url,
      FIRST_VALUE(m.id)        OVER w    AS first_id,
      FIRST_VALUE(m.media_url) OVER w    AS first_media_url,
      LAST_VALUE(m.id)         OVER wall AS last_id,
      LAST_VALUE(m.media_url)  OVER wall AS last_media_url
    FROM moments m
    WHERE m.event_id = p_event_id
      AND m.status = 'published'
    WINDOW
      w AS (ORDER BY COALESCE(m.captured_at, m.created_at) ASC, m.id ASC),
      wall AS (ORDER BY COALESCE(m.captured_at, m.created_at) ASC, m.id ASC
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
  )
  SELECT
    -- Wrap around at the boundaries, matching the previous behaviour. Tested on
    -- id rather than media_url: text moments have a NULL media_url, and a
    -- COALESCE on the url would wrongly wrap mid-gallery.
    CASE WHEN o.prev_id IS NULL THEN o.last_id         ELSE o.prev_id         END,
    CASE WHEN o.prev_id IS NULL THEN o.last_media_url  ELSE o.prev_media_url  END,
    CASE WHEN o.next_id IS NULL THEN o.first_id        ELSE o.next_id         END,
    CASE WHEN o.next_id IS NULL THEN o.first_media_url ELSE o.next_media_url  END
  FROM ordered o
  WHERE o.id = p_moment_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_adjacent_moments(uuid, uuid)
  TO anon, authenticated, service_role;

-- Current owning definitions were compared with production on 2026-11-11.
-- Preserve their signatures, add caller binding and private activity filters.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_friend_activity(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN '[]'::jsonb; END IF;
  v_cutoff := now() - interval '7 days';

  SELECT COALESCE(jsonb_agg(activity ORDER BY activity->>'created_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    -- RSVPs: friends going to events
    (
      SELECT jsonb_build_object(
        'activity_type', 'rsvp',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'event_id', e.id,
        'event_title', e.title,
        'event_slug', e.slug,
        'event_image', e.image_url,
        'created_at', r.created_at
      ) AS activity
      FROM rsvps r
      JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = r.user_id
      JOIN events e ON e.id = r.event_id AND e.status = 'published'
      WHERE r.status = 'going' AND dating_private.event_visible(r.event_id) AND dating_private.can_view_activity(r.user_id,r.event_id)
        AND r.created_at > v_cutoff
        AND e.starts_at > now()  -- only upcoming events
    )

    UNION ALL

    -- Moments: friends posting moments
    (
      SELECT jsonb_build_object(
        'activity_type', 'moment',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'event_id', e.id,
        'event_title', e.title,
        'event_slug', e.slug,
        'moment_id', m.id,
        'moment_media_url', m.media_url,
        'created_at', m.created_at
      ) AS activity
      FROM moments m
      JOIN user_follows uf ON uf.following_id = m.user_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = m.user_id
      JOIN events e ON e.id = m.event_id
      WHERE m.status = 'published' AND dating_private.event_visible(m.event_id) AND dating_private.can_view_activity(m.user_id,m.event_id)
        AND m.created_at > v_cutoff
    )

    UNION ALL

    -- Follows: friends following new people
    (
      SELECT jsonb_build_object(
        'activity_type', 'follow',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'target_id', tp.id,
        'target_name', tp.display_name,
        'target_username', tp.username,
        'target_avatar', tp.avatar_url,
        'created_at', uf2.created_at
      ) AS activity
      FROM user_follows uf2
      JOIN user_follows uf ON uf.following_id = uf2.follower_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = uf2.follower_id
      JOIN profiles tp ON tp.id = uf2.following_id
      WHERE dating_private.can_view_activity(uf2.follower_id,NULL) AND dating_private.can_view_activity(uf2.following_id,NULL) AND uf2.created_at > v_cutoff
        AND uf2.following_id != p_user_id  -- don't show "friend followed you"
    )
  ) combined
  ORDER BY activity->>'created_at' DESC
  LIMIT least(greatest(p_limit,1),50) OFFSET least(greatest(p_offset,0),1000);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_friend_activity(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_activity(uuid,integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_friends_attending(p_user_id uuid, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_friends jsonb;
  v_total int;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN jsonb_build_object('friends','[]'::jsonb,'total',0); END IF;
  SELECT count(*)::int INTO v_total
  FROM rsvps r
  JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
  WHERE r.event_id = p_event_id AND r.status = 'going' AND dating_private.event_visible(r.event_id) AND dating_private.can_view_activity(r.user_id,r.event_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb) INTO v_friends
  FROM rsvps r
  JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id AND r.status = 'going' AND dating_private.event_visible(r.event_id) AND dating_private.can_view_activity(r.user_id,r.event_id);

  RETURN jsonb_build_object(
    'friends', v_friends,
    'total', v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_friends_attending(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_attending(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_friends_attending_batch(p_user_id uuid, p_event_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(event_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'event_id', sub.event_id,
      'friend_profiles', sub.profiles,
      'total_count', sub.total_count
    ) AS event_data
    FROM (
      SELECT
        r.event_id,
        (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'display_name', p.display_name,
              'avatar_url', p.avatar_url
            )
          ), '[]'::jsonb)
          FROM (
            SELECT p2.id, p2.display_name, p2.avatar_url
            FROM rsvps r2
            JOIN user_follows uf ON uf.following_id = r2.user_id AND uf.follower_id = p_user_id
            JOIN profiles p2 ON p2.id = r2.user_id
            WHERE r2.event_id = r.event_id AND r2.status = 'going' AND dating_private.event_visible(r2.event_id) AND dating_private.can_view_activity(r2.user_id,r2.event_id)
            ORDER BY r2.created_at DESC
            LIMIT 3
          ) p
        ) AS profiles,
        (
          SELECT count(*)::int
          FROM rsvps r3
          JOIN user_follows uf2 ON uf2.following_id = r3.user_id AND uf2.follower_id = p_user_id
          WHERE r3.event_id = r.event_id AND r3.status = 'going' AND dating_private.event_visible(r3.event_id) AND dating_private.can_view_activity(r3.user_id,r3.event_id)
        ) AS total_count
      FROM unnest(p_event_ids[1:200]) AS r(event_id)
    ) sub
    WHERE sub.total_count > 0
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_friends_attending_batch(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_attending_batch(uuid,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_recommended_events(p_user_id uuid, p_limit integer DEFAULT 6)
 RETURNS SETOF events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_tags text[];
  v_rsvp_count int;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN; END IF;
  -- Gather user's preferred tags from their RSVP history
  SELECT array_agg(DISTINCT tag), count(DISTINCT r.event_id)
  INTO v_user_tags, v_rsvp_count
  FROM rsvps r
  JOIN events e ON e.id = r.event_id
  CROSS JOIN LATERAL unnest(COALESCE(e.ai_tags, '{}')) AS tag
  WHERE r.user_id = p_user_id
    AND r.status IN ('going', 'interested');

  -- If user has no RSVP history, return popular upcoming events
  IF v_rsvp_count IS NULL OR v_rsvp_count = 0 THEN
    RETURN QUERY
    SELECT e.*
    FROM events e
    WHERE dating_private.event_visible(e.id) AND e.status = 'published'
      AND e.starts_at > now()
    ORDER BY
      COALESCE(e.sponsor_tier, 0) DESC,
      (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') DESC,
      e.starts_at ASC
    LIMIT least(greatest(p_limit,1),50);
    RETURN;
  END IF;

  -- Score upcoming events by tag overlap + popularity + recency + sponsor tier
  RETURN QUERY
  SELECT e.*
  FROM events e
  WHERE dating_private.event_visible(e.id) AND e.status = 'published'
    AND e.starts_at > now()
    -- Exclude events user already RSVP'd to
    AND NOT EXISTS (
      SELECT 1 FROM rsvps r
      WHERE r.event_id = e.id AND r.user_id = p_user_id AND r.status != 'cancelled'
    )
  ORDER BY
    -- Tag overlap score (0-1 range, weighted heavily)
    (
      SELECT count(*)::float / GREATEST(array_length(v_user_tags, 1), 1)
      FROM unnest(COALESCE(e.ai_tags, '{}')) AS t
      WHERE t = ANY(v_user_tags)
    ) * 5.0
    -- Popularity score (log scale)
    + ln(1 + (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going'))
    -- Sponsor tier boost
    + COALESCE(e.sponsor_tier, 0) * 2.0
    -- Recency: slight preference for sooner events
    - EXTRACT(EPOCH FROM (e.starts_at - now())) / 86400.0 * 0.01
    DESC
  LIMIT least(greatest(p_limit,1),50);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_recommended_events(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommended_events(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_user_recent_events_for_upload(p_user_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, slug text, title text, image_url text, starts_at timestamp with time zone, location_name text, can_post_moments boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    e.id,
    e.slug,
    e.title,
    e.image_url,
    e.starts_at,
    e.location_name,
    -- Check if user can post moments
    -- Default to 'anyone' can post if no settings exist (consistent with app logic)
    CASE
      -- Creator can always post
      WHEN e.created_by = p_user_id THEN true
      -- If moments explicitly disabled, no one except creator can post
      WHEN es.moments_enabled = false THEN false
      -- No settings = default to 'anyone' can post
      WHEN es.event_id IS NULL THEN true
      -- Check who_can_post setting (defaults to 'anyone' if NULL)
      WHEN COALESCE(es.moments_who_can_post, 'anyone') = 'anyone' THEN true
      WHEN es.moments_who_can_post = 'rsvp' AND r.status IN ('going', 'interested', 'waitlist') THEN true
      WHEN es.moments_who_can_post = 'confirmed' AND r.status = 'going' THEN true
      ELSE false
    END as can_post_moments
  FROM events e
  LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = p_user_id
  LEFT JOIN event_settings es ON es.event_id = e.id
  WHERE auth.uid() IS NOT NULL AND p_user_id=auth.uid() AND dating_private.event_visible(e.id) AND e.status = 'published'
    AND (
      -- Events user RSVP'd to in last 30 days (including waitlist)
      (r.user_id = p_user_id AND r.status IN ('going', 'interested', 'waitlist') AND e.starts_at > now() - interval '30 days')
      OR
      -- Events user created
      e.created_by = p_user_id
      OR
      -- Upcoming events (next 60 days) where anyone can post moments
      (
        e.starts_at > now() - interval '1 day'
        AND e.starts_at < now() + interval '60 days'
        AND (
          es.event_id IS NULL  -- no settings = defaults to 'anyone'
          OR (COALESCE(es.moments_enabled, true) AND COALESCE(es.moments_who_can_post, 'anyone') = 'anyone')
        )
      )
    )
  ORDER BY
    -- Prioritize events that just happened
    CASE WHEN e.starts_at < now() THEN 0 ELSE 1 END,
    ABS(EXTRACT(EPOCH FROM (e.starts_at - now()))) ASC
  LIMIT least(greatest(p_limit,1),50);
$function$;

REVOKE ALL ON FUNCTION public.get_user_recent_events_for_upload(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_recent_events_for_upload(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.is_subscribed_to_series(p_series_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND p_user_id=auth.uid() AND EXISTS (
    SELECT 1 FROM series_rsvps
    WHERE series_id = p_series_id
      AND user_id = p_user_id
      AND auto_rsvp = true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_subscribed_to_series(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_subscribed_to_series(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_event_counts(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_going_count int;
  v_waitlist_count int;
  v_going_spots int;
  v_interested_count int;
BEGIN
  IF NOT dating_private.event_visible(p_event_id) THEN RETURN NULL; END IF;
  SELECT
    count(*) FILTER (WHERE status = 'going'),
    count(*) FILTER (WHERE status = 'waitlist'),
    coalesce(sum(1 + plus_ones) FILTER (WHERE status = 'going'), 0),
    count(*) FILTER (WHERE status = 'interested')
  INTO v_going_count, v_waitlist_count, v_going_spots, v_interested_count
  FROM rsvps
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'going_count', v_going_count,
    'going_spots', v_going_spots,
    'waitlist_count', v_waitlist_count,
    'interested_count', v_interested_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_event_counts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_counts(uuid) TO authenticated,anon;
CREATE OR REPLACE FUNCTION public.get_event_counts_batch(p_event_ids uuid[])
 RETURNS SETOF event_counts_result
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    event_id,
    count(*) FILTER (WHERE status = 'going')::int AS going_count,
    coalesce(sum(1 + plus_ones) FILTER (WHERE status = 'going'), 0)::int AS going_spots,
    count(*) FILTER (WHERE status = 'waitlist')::int AS waitlist_count,
    count(*) FILTER (WHERE status = 'interested')::int AS interested_count
  FROM rsvps
  WHERE event_id = ANY(p_event_ids[1:500]) AND dating_private.event_visible(event_id)
  GROUP BY event_id;
$function$;

REVOKE ALL ON FUNCTION public.get_event_counts_batch(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_counts_batch(uuid[]) TO authenticated,anon;
COMMIT;

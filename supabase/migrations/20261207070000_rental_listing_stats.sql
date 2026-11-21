BEGIN;

CREATE TABLE rental_private.stats_totals (
  listing_id uuid PRIMARY KEY REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  views bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0
);

CREATE TABLE rental_private.stats_media (
  listing_id uuid REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  src text,
  clicks bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (listing_id, src)
);

CREATE TABLE rental_private.stats_sessions (
  listing_id uuid REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  session_key text,
  touched_at timestamptz NOT NULL,
  viewed_at timestamptz,
  recent_clicks jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (listing_id, session_key)
);

CREATE TABLE rental_private.stats_limits (
  bucket text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1
);

CREATE INDEX rental_stats_watchers ON rental_private.stats_sessions (listing_id, viewed_at DESC)
  WHERE viewed_at IS NOT NULL;
CREATE INDEX rental_stats_sessions_expiry ON rental_private.stats_sessions(touched_at);
CREATE INDEX rental_stats_limit_expiry ON rental_private.stats_limits(expires_at);
CREATE INDEX rental_stats_requests ON public.rental_visit_events(visit_id) WHERE kind = 'requested';

ALTER TABLE rental_private.stats_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_private.stats_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_private.stats_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_private.stats_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rental_private.stats_totals, rental_private.stats_media,
  rental_private.stats_sessions, rental_private.stats_limits FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA rental_private TO service_role;

CREATE FUNCTION rental_private.stats_prune() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM rental_private.stats_sessions WHERE (listing_id, session_key) IN (
    SELECT listing_id, session_key FROM rental_private.stats_sessions
    WHERE touched_at < now() - interval '2 hours' ORDER BY touched_at
    LIMIT 250 FOR UPDATE SKIP LOCKED
  );
  DELETE FROM rental_private.stats_limits WHERE bucket IN (
    SELECT bucket FROM rental_private.stats_limits WHERE expires_at < now()
    ORDER BY expires_at LIMIT 250 FOR UPDATE SKIP LOCKED
  );
END;
$$;

-- No guest identifier, IP address or event row is part of the aggregate response.
CREATE FUNCTION rental_private.stats_counts(listing uuid, published boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'views', COALESCE((SELECT t.views FROM rental_private.stats_totals t WHERE t.listing_id = listing), 0),
    'mediaClicks', COALESCE((SELECT t.clicks FROM rental_private.stats_totals t WHERE t.listing_id = listing), 0),
    'requests', (
      SELECT count(*) FROM public.rental_visits v
      JOIN public.rental_visit_events e ON e.visit_id = v.id AND e.kind = 'requested'
      WHERE v.listing_id = listing
    ),
    'watching', CASE WHEN published THEN (
      SELECT count(*) FROM rental_private.stats_sessions s
      WHERE s.listing_id = listing AND s.viewed_at >= now() - interval '75 seconds'
    ) ELSE 0 END
  );
$$;

CREATE FUNCTION rental_private.stats_visible(listing uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT rental_private.stats_counts(l.id, true)
  FROM public.rental_listings l
  WHERE l.id = listing AND l.status = 'published';
$$;

CREATE FUNCTION rental_private.stats_record(listing uuid, visitor text, rate_bucket text, media_src text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  listing_row public.rental_listings%ROWTYPE;
  session_row rental_private.stats_sessions%ROWTYPE;
  at_time timestamptz := now();
  hit_count integer;
  count_view boolean;
BEGIN
  IF visitor IS NULL OR visitor !~ '^[0-9a-f]{64}$'
    OR rate_bucket IS NULL OR rate_bucket !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO listing_row FROM public.rental_listings AS l
  WHERE l.id = listing AND l.status = 'published' FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF media_src IS NOT NULL AND NOT (
    media_src = ANY(listing_row.photos)
    OR (media_src LIKE '/api/rentals/videos/%'
      AND substring(media_src FROM length('/api/rentals/videos/') + 1) = ANY(listing_row.videos))
    OR (listing = 'c7725f24-49f5-469f-b95f-417b7e5ec3d3'
      AND media_src = '/rentals/king-paradise/reel.mp4')
  ) THEN RETURN NULL; END IF;

  INSERT INTO rental_private.stats_limits AS r (bucket, expires_at)
  VALUES (rate_bucket, at_time + interval '10 minutes')
  ON CONFLICT (bucket) DO UPDATE SET hits = r.hits + 1 WHERE r.hits < 300
  RETURNING hits INTO hit_count;
  IF hit_count IS NULL THEN RETURN jsonb_build_object('limited', true); END IF;

  -- Small opportunistic cleanup covers local installs without pg_cron.
  IF hit_count = 1 THEN PERFORM rental_private.stats_prune(); END IF;

  INSERT INTO rental_private.stats_sessions(listing_id, session_key, touched_at)
  VALUES (listing, visitor, at_time)
  ON CONFLICT (listing_id, session_key) DO NOTHING;
  SELECT * INTO session_row FROM rental_private.stats_sessions s
  WHERE s.listing_id = listing AND s.session_key = visitor FOR UPDATE;

  IF media_src IS NULL THEN
    count_view := session_row.viewed_at IS NULL OR session_row.viewed_at < at_time - interval '2 hours';
    IF count_view OR session_row.viewed_at < at_time - interval '15 seconds' THEN
      UPDATE rental_private.stats_sessions SET viewed_at = at_time, touched_at = at_time
      WHERE listing_id = listing AND session_key = visitor;
    END IF;
    IF count_view THEN
      INSERT INTO rental_private.stats_totals AS t (listing_id, views) VALUES (listing, 1)
      ON CONFLICT (listing_id) DO UPDATE SET views = t.views + 1;
    END IF;
    RETURN rental_private.stats_counts(listing, true);
  END IF;

  IF (session_row.recent_clicks ->> media_src)::timestamptz >= at_time - interval '10 seconds' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Retain only the ten-second deduplication window, including removed assets.
  UPDATE rental_private.stats_sessions s SET
    recent_clicks = (
      SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each_text(s.recent_clicks) e
      WHERE e.value::timestamptz >= at_time - interval '10 seconds'
    ) || jsonb_build_object(media_src, at_time),
    touched_at = at_time
  WHERE s.listing_id = listing AND s.session_key = visitor;
  INSERT INTO rental_private.stats_totals AS t (listing_id, clicks) VALUES (listing, 1)
  ON CONFLICT (listing_id) DO UPDATE SET clicks = t.clicks + 1;
  INSERT INTO rental_private.stats_media AS m (listing_id, src) VALUES (listing, media_src)
  ON CONFLICT (listing_id, src) DO UPDATE SET clicks = m.clicks + 1;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE FUNCTION rental_private.stats_owned(target uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', l.id, 'title', l.title, 'status', l.status,
      'counts', rental_private.stats_counts(l.id, l.status = 'published'),
      'media', CASE WHEN target IS NULL THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('src', m.src, 'clicks', m.clicks) ORDER BY m.clicks DESC, m.src)
        FROM rental_private.stats_media m WHERE m.listing_id = l.id
      ), '[]'::jsonb) END
    ) ORDER BY l.created_at DESC
  ), '[]'::jsonb)
  FROM public.rental_listings l
  WHERE l.host_id = (SELECT auth.uid()) AND (target IS NULL OR l.id = target);
$$;

CREATE FUNCTION public.rental_stats_visible(listing uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.stats_visible(listing);
$$;
CREATE FUNCTION public.rental_stats_record(listing uuid, visitor text, rate_bucket text, media_src text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.stats_record(listing, visitor, rate_bucket, media_src);
$$;
CREATE FUNCTION public.rental_stats_owned(target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.stats_owned(target);
$$;

CREATE FUNCTION public.rental_stats_prune() RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.stats_prune();
$$;

REVOKE ALL ON FUNCTION rental_private.stats_prune(), rental_private.stats_counts(uuid, boolean),
  rental_private.stats_visible(uuid), rental_private.stats_record(uuid, text, text, text), rental_private.stats_owned(uuid),
  public.rental_stats_visible(uuid), public.rental_stats_record(uuid, text, text, text), public.rental_stats_owned(uuid),
  public.rental_stats_prune()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rental_private.stats_visible(uuid), rental_private.stats_record(uuid, text, text, text),
  public.rental_stats_visible(uuid), public.rental_stats_record(uuid, text, text, text),
  rental_private.stats_prune(), public.rental_stats_prune() TO service_role;
GRANT EXECUTE ON FUNCTION rental_private.stats_owned(uuid), public.rental_stats_owned(uuid) TO authenticated;

COMMIT;

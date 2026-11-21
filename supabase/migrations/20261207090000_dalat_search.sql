BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE FUNCTION public.dalat_search_fold(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(
    lower(translate(regexp_replace(normalize(value, NFD), U&'[\0300-\036f]', '', 'g'), 'Đđ', 'Dd')),
    '[^[:alnum:]]+', ' ', 'g'
  ));
$$;
REVOKE ALL ON FUNCTION public.dalat_search_fold(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dalat_search_fold(text) TO anon, authenticated;

CREATE INDEX events_dalat_search_idx ON public.events USING gin (
  public.dalat_search_fold(coalesce(title,'') || ' ' || coalesce(location_name,'') || ' ' || coalesce(left(description,1200),'')) extensions.gin_trgm_ops
) WHERE status = 'published' AND slug IS NOT NULL;

CREATE INDEX rental_listings_dalat_search_idx ON public.rental_listings USING gin (
  public.dalat_search_fold(coalesce(title,'') || ' ' || coalesce(left(description,3000),'')) extensions.gin_trgm_ops
) WHERE status = 'published' AND slug IS NOT NULL;

CREATE INDEX blog_posts_dalat_search_idx ON public.blog_posts USING gin (
  public.dalat_search_fold(coalesce(title,'') || ' ' || coalesce(meta_description,'') || ' ' || coalesce(left(story_content,1200),'')) extensions.gin_trgm_ops
) WHERE status = 'published';

CREATE INDEX experiences_dalat_search_idx ON public.experiences USING gin (
  public.dalat_search_fold(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(left(narrative,2600),'')) extensions.gin_trgm_ops
) WHERE status = 'published';

CREATE INDEX moments_dalat_search_idx ON public.moments USING gin (
  public.dalat_search_fold(coalesce(title,'') || ' ' || coalesce(left(text_content,2400),'')) extensions.gin_trgm_ops
) WHERE status = 'published' AND text_content IS NOT NULL;

CREATE INDEX venues_dalat_search_idx ON public.venues USING gin (
  public.dalat_search_fold(coalesce(name,'') || ' ' || coalesce(left(description,2400),'')) extensions.gin_trgm_ops
) WHERE slug IS NOT NULL;

CREATE INDEX content_translations_dalat_search_idx ON public.content_translations USING gin (
  public.dalat_search_fold(left(translated_text,140)) extensions.gin_trgm_ops
) WHERE NOT is_stale AND (ai_reviewed_at IS NOT NULL OR translation_status = 'human')
  AND field_name IN ('title','name','text_content');

-- Resolve visibility from the existing source tables and their RLS on every
-- request. No copied search row can outlive publication of its source.
CREATE FUNCTION public.search_dalat_content(p_query text, p_scope text, p_locale text, p_limit integer)
RETURNS TABLE(kind text, id uuid, href text, title text, original_title text, source_locale text, score integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH query AS MATERIALIZED (
    SELECT q, tokens,
      coalesce((SELECT left(token,3) FROM unnest(tokens) token ORDER BY char_length(token) DESC LIMIT 1), q) AS prefix
    FROM (SELECT public.dalat_search_fold(left(coalesce(p_query, ''), 100)) AS q) terms
    CROSS JOIN LATERAL (
      SELECT ARRAY(SELECT word FROM unnest(string_to_array(q, ' ')) word
        WHERE word NOT IN ('a','an','the','in','at','near','from','to','de','du','des','les','gan','tai','o')) AS tokens
    ) useful
    WHERE char_length(q) >= 2
  ), candidates AS MATERIALIZED (
    SELECT e.id FROM public.events e
    WHERE p_scope IN ('all','events') AND e.status = 'published' AND e.slug IS NOT NULL
      AND public.dalat_search_fold(coalesce(e.title,'') || ' ' || coalesce(e.location_name,'') || ' ' || coalesce(left(e.description,1200),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT r.id FROM public.rental_listings r
    WHERE p_scope IN ('all','rentals') AND r.status = 'published' AND r.slug IS NOT NULL
      AND public.dalat_search_fold(coalesce(r.title,'') || ' ' || coalesce(left(r.description,3000),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT b.id FROM public.blog_posts b
    WHERE p_scope IN ('all','news','blog') AND b.status = 'published'
      AND public.dalat_search_fold(coalesce(b.title,'') || ' ' || coalesce(b.meta_description,'') || ' ' || coalesce(left(b.story_content,1200),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT x.id FROM public.experiences x
    WHERE p_scope IN ('all','experiences') AND x.status = 'published'
      AND public.dalat_search_fold(coalesce(x.title,'') || ' ' || coalesce(x.summary,'') || ' ' || coalesce(left(x.narrative,2600),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT m.id FROM public.moments m
    WHERE p_scope IN ('all','texts') AND m.status = 'published' AND m.text_content IS NOT NULL
      AND public.dalat_search_fold(coalesce(m.title,'') || ' ' || coalesce(left(m.text_content,2400),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT v.id FROM public.venues v
    WHERE p_scope IN ('all','venues') AND v.slug IS NOT NULL
      AND public.dalat_search_fold(coalesce(v.name,'') || ' ' || coalesce(left(v.description,2400),'')) LIKE (SELECT '%' || prefix || '%' FROM query)
    UNION
    SELECT t.content_id FROM public.content_translations t
    WHERE t.target_locale = p_locale AND t.content_type IN ('event','rental','blog','experience','moment','venue')
      AND t.field_name IN ('title','name','text_content') AND NOT t.is_stale
      AND (t.ai_reviewed_at IS NOT NULL OR t.translation_status = 'human')
      AND public.dalat_search_fold(left(t.translated_text,140)) LIKE (SELECT '%' || prefix || '%' FROM query)
  ), sources(kind, id, href, title, body, source_locale, translation_type, translation_field, recency) AS (
    SELECT 'events', e.id, '/events/' || e.slug, e.title,
      concat_ws(' ', e.location_name, left(e.description, 2600)), e.source_locale, 'event', 'title',
      CASE WHEN e.starts_at >= now() THEN now() + interval '10 years' - (e.starts_at - now()) ELSE e.starts_at END
    FROM public.events e JOIN candidates match ON match.id = e.id
    WHERE p_scope IN ('all', 'events') AND e.status = 'published' AND e.slug IS NOT NULL AND e.slug <> ''
    UNION ALL
    SELECT 'rentals', r.id, '/rentals/listing/' || r.slug, r.title, left(r.description, 3000),
      r.source_locale, 'rental', 'title', r.updated_at
    FROM public.rental_listings r JOIN candidates match ON match.id = r.id
    WHERE p_scope IN ('all', 'rentals') AND r.status = 'published' AND r.slug IS NOT NULL
    UNION ALL
    SELECT CASE WHEN b.source = 'news_scrape' OR c.slug = 'news' THEN 'news' ELSE 'blog' END,
      b.id, '/blog/' || coalesce(c.slug, 'changelog') || '/' || b.slug, b.title,
      concat_ws(' ', b.meta_description, left(b.story_content, 2600)),
      b.source_locale, 'blog', 'title', coalesce(b.published_at, b.created_at)
    FROM public.blog_posts b
    LEFT JOIN public.blog_categories c ON c.id = b.category_id
    JOIN candidates match ON match.id = b.id
    WHERE b.status = 'published' AND (
      p_scope = 'all' OR p_scope = CASE WHEN b.source = 'news_scrape' OR c.slug = 'news' THEN 'news' ELSE 'blog' END
    )
    UNION ALL
    SELECT 'experiences', x.id, '/experiences/' || x.id, x.title,
      concat_ws(' ', x.summary, left(x.narrative, 2600)), x.original_language, 'experience', 'title', x.published_at
    FROM public.experiences x JOIN candidates match ON match.id = x.id
    WHERE p_scope IN ('all', 'experiences') AND x.status = 'published'
    UNION ALL
    SELECT 'texts', m.id, '/events/' || e.slug || '/moments/' || m.id,
      coalesce(nullif(btrim(m.title), ''), left(regexp_replace(btrim(m.text_content), '[[:space:]]+', ' ', 'g'), 110)),
      left(m.text_content, 2400), m.source_locale, 'moment',
      CASE WHEN nullif(btrim(m.title), '') IS NULL THEN 'text_content' ELSE 'title' END, m.created_at
    FROM public.moments m
    JOIN public.events e ON e.id = m.event_id AND e.status = 'published'
    JOIN candidates match ON match.id = m.id
    WHERE p_scope IN ('all', 'texts') AND m.status = 'published' AND e.slug IS NOT NULL AND e.slug <> ''
      AND m.text_content IS NOT NULL AND nullif(btrim(m.text_content), '') IS NOT NULL
    UNION ALL
    SELECT 'venues', v.id, '/venues/' || v.slug, v.name, left(v.description, 2400),
      v.source_locale, 'venue', 'name', v.updated_at
    FROM public.venues v JOIN candidates match ON match.id = v.id
    WHERE p_scope IN ('all', 'venues') AND v.slug IS NOT NULL AND v.slug <> ''
  ), documents AS MATERIALIZED (
    SELECT s.*, left(coalesce(t.translated_text, s.title), 140) AS display_title,
      q.q, q.tokens,
      public.dalat_search_fold(s.title) AS source_head,
      public.dalat_search_fold(coalesce(t.translated_text, s.title)) AS head,
      public.dalat_search_fold(coalesce(s.body, '')) AS body_text
    FROM sources s CROSS JOIN query q
    LEFT JOIN public.content_translations t
      ON t.content_id = s.id AND t.content_type = s.translation_type
      AND t.field_name = s.translation_field AND t.target_locale = p_locale
      AND t.target_locale <> s.source_locale AND NOT t.is_stale
      AND (t.ai_reviewed_at IS NOT NULL OR t.translation_status = 'human')
    WHERE nullif(btrim(s.title), '') IS NOT NULL
  ), ranked AS MATERIALIZED (
    SELECT d.*, CASE
      WHEN q IN (head, source_head) THEN 120
      WHEN starts_with(head, q) OR starts_with(source_head, q) THEN 108
      WHEN strpos(head, q) > 0 OR strpos(source_head, q) > 0 THEN 94
      WHEN strpos(body_text, q) > 0 THEN 70
      WHEN cardinality(tokens) BETWEEN 2 AND 8 AND NOT EXISTS (
        SELECT 1 FROM unnest(tokens) token WHERE char_length(token) >= 2
          AND strpos(head || ' ' || source_head || ' ' || body_text, token) = 0
      ) THEN 61
      WHEN char_length(q) >= 4 AND greatest(
        extensions.strict_word_similarity(q, head), extensions.strict_word_similarity(q, source_head)
      ) >= 0.56 THEN 50
      ELSE 0
    END AS relevance
    FROM documents d
  ), buckets AS (
    SELECT r.*, row_number() OVER (
      PARTITION BY r.kind ORDER BY r.relevance DESC, r.recency DESC NULLS LAST, r.id
    ) AS within_kind
    FROM ranked r WHERE r.relevance > 0
  )
  SELECT b.kind, b.id, b.href, b.display_title, left(b.title, 140), b.source_locale, b.relevance
  FROM buckets b
  WHERE p_scope <> 'all' OR b.within_kind <= 8
  ORDER BY b.relevance DESC, b.recency DESC NULLS LAST, b.id
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 60);
$$;
REVOKE ALL ON FUNCTION public.search_dalat_content(text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_dalat_content(text,text,text,integer) TO anon, authenticated;

-- Daily query totals, with no account, IP, session, or destination identifiers.
CREATE TABLE public.dalat_search_daily (
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  query text NOT NULL CHECK (char_length(query) BETWEEN 2 AND 100),
  locale text NOT NULL CHECK (locale IN ('en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id')),
  scope text NOT NULL CHECK (scope IN ('all','events','rentals','people','blog','news','texts','experiences','venues')),
  clicked_kind text NOT NULL DEFAULT '' CHECK (clicked_kind IN ('','events','rentals','people','blog','news','texts','experiences','venues')),
  searches bigint NOT NULL DEFAULT 0,
  empty_searches bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (query, locale, scope, clicked_kind, day)
);
CREATE INDEX dalat_search_daily_day_idx ON public.dalat_search_daily (day DESC);
ALTER TABLE public.dalat_search_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dalat_search_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dalat_search_daily TO service_role;

CREATE FUNCTION public.record_dalat_search(p_query text, p_locale text, p_scope text, p_clicked_kind text, p_empty boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  terms text := public.dalat_search_fold(left(btrim(coalesce(p_query, '')), 100));
  kind text := coalesce(p_clicked_kind, '');
  utc_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF char_length(terms) < 2 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dalat_search_daily WHERE day = utc_day)
    AND pg_try_advisory_xact_lock(hashtextextended('dalat-search-retention:' || utc_day, 0)) THEN
    DELETE FROM public.dalat_search_daily WHERE day < utc_day - 29;
  END IF;
  INSERT INTO public.dalat_search_daily (query, locale, scope, clicked_kind, searches, empty_searches, clicks)
  VALUES (terms, p_locale, p_scope, kind, (kind = '')::int,
    (kind = '' AND coalesce(p_empty, false))::int, (kind <> '')::int)
  ON CONFLICT (query, locale, scope, clicked_kind, day) DO UPDATE SET
    searches = dalat_search_daily.searches + EXCLUDED.searches,
    empty_searches = dalat_search_daily.empty_searches + EXCLUDED.empty_searches,
    clicks = dalat_search_daily.clicks + EXCLUDED.clicks;
END;
$$;
REVOKE ALL ON FUNCTION public.record_dalat_search(text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_dalat_search(text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.dalat_search_fold(text) TO service_role;

CREATE FUNCTION public.get_dalat_search_stats(p_offset integer DEFAULT 0)
RETURNS TABLE(query text, searches bigint, empty_searches bigint, clicks bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT d.query, sum(d.searches)::bigint, sum(d.empty_searches)::bigint, sum(d.clicks)::bigint
  FROM public.dalat_search_daily d
  WHERE d.day >= (now() AT TIME ZONE 'UTC')::date - 29
  GROUP BY d.query
  ORDER BY sum(d.searches) DESC, d.query
  OFFSET least(greatest(coalesce(p_offset, 0), 0), 10000) LIMIT 51;
$$;
REVOKE ALL ON FUNCTION public.get_dalat_search_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dalat_search_stats(integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

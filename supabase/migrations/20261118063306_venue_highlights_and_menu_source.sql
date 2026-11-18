BEGIN;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS menu_url text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS highlight_moment_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.venues ADD CONSTRAINT venue_highlight_count CHECK (cardinality(highlight_moment_ids) <= 6);

UPDATE public.venues SET menu_url = 'https://socialhousedalat.com/menu/?utm_source=dalat.app&utm_medium=referral&utm_campaign=menu'
WHERE slug = 'social-house-dalat';

CREATE OR REPLACE FUNCTION public.get_venue_upcoming_events(p_venue_id uuid)
RETURNS TABLE(id uuid, slug text, title text, image_url text, starts_at timestamptz, ends_at timestamptz, capacity integer, series_id uuid, series_slug text, rrule text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, e.slug, e.title, e.image_url, e.starts_at, e.ends_at, e.capacity, e.series_id, s.slug, s.rrule
  FROM (
    SELECT DISTINCT ON (coalesce(e.series_id, e.id)) e.*
    FROM public.events e
    WHERE e.venue_id = p_venue_id AND e.status = 'published'
      AND NOT e.has_private_details AND e.starts_at >= now()
    ORDER BY coalesce(e.series_id, e.id), e.starts_at, e.id
  ) e
  LEFT JOIN public.event_series s ON s.id = e.series_id
  ORDER BY e.starts_at, e.id
  LIMIT 6;
$$;
GRANT EXECUTE ON FUNCTION public.get_venue_upcoming_events(uuid) TO anon, authenticated;

COMMIT;

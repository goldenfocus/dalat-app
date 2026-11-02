-- Authorized visual sponsorship for the Social House language exchange.
-- Run after the series_sponsors migration and logo asset are deployed.
-- Keep older EZViet sponsor records and historical event attribution intact.
BEGIN;

DO $$
DECLARE
  target_series public.event_series%ROWTYPE;
  sponsor uuid;
BEGIN
  SELECT * INTO STRICT target_series FROM public.event_series
  WHERE slug = 'language-exchange-social-house-z8oc';

  SELECT id INTO sponsor FROM public.sponsors
  WHERE name = 'EZViet'
    AND website_url = 'https://ezviet.org'
    AND logo_url = 'https://dalat.app/images/sponsors/ezviet-wordmark.svg'
  ORDER BY created_at LIMIT 1;

  IF sponsor IS NULL THEN
    INSERT INTO public.sponsors (name, logo_url, website_url, created_by)
    VALUES ('EZViet', 'https://dalat.app/images/sponsors/ezviet-wordmark.svg',
            'https://ezviet.org', target_series.created_by)
    RETURNING id INTO sponsor;
  END IF;

  INSERT INTO public.series_sponsors (series_id, sponsor_id, sort_order)
  VALUES (target_series.id, sponsor, 0)
  ON CONFLICT (series_id, sponsor_id) DO NOTHING;

  INSERT INTO public.event_sponsors (event_id, sponsor_id, sort_order)
  SELECT e.id, s.sponsor_id, s.sort_order
  FROM public.events AS e
  JOIN public.series_sponsors AS s ON s.series_id = e.series_id
  WHERE e.series_id = target_series.id
    AND s.sponsor_id = sponsor
    AND e.created_by = target_series.created_by
    AND e.starts_at >= s.effective_from
  ON CONFLICT (event_id, sponsor_id) DO NOTHING;
END;
$$;

SELECT s.slug, p.name, p.logo_url, p.website_url, ss.effective_from,
       count(e.id) AS linked_occurrences
FROM public.event_series AS s
JOIN public.series_sponsors AS ss ON ss.series_id = s.id
JOIN public.sponsors AS p ON p.id = ss.sponsor_id
LEFT JOIN public.event_sponsors AS es ON es.sponsor_id = p.id
LEFT JOIN public.events AS e ON e.id = es.event_id AND e.series_id = s.id
WHERE s.slug = 'language-exchange-social-house-z8oc'
  AND p.logo_url = 'https://dalat.app/images/sponsors/ezviet-wordmark.svg'
GROUP BY s.slug, p.name, p.logo_url, p.website_url, ss.effective_from;

COMMIT;

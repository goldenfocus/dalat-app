-- Run on the production project with scripts/supabase-run-sql.sh.
-- To preview the actual changes and counts, replace the final COMMIT with ROLLBACK.
BEGIN;

CREATE TEMP TABLE event_coverage_venues (
  slug text PRIMARY KEY,
  name text NOT NULL,
  venue_type text NOT NULL,
  address text NOT NULL,
  street text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  maps_cid text NOT NULL,
  website_url text,
  event_location_name text NOT NULL
) ON COMMIT DROP;

-- The addresses were cross-checked against these public sources:
-- Nhất Niệm Trà: restaurantguru.com/Nhat-Niem-Tra-Dalat-Lam-Dong and the venue's Maps listing linked in /events/english-with-people-27yt-20260226.
-- Beeppub: beepitupdalat.wixsite.com/beeppub/about-1 and OSM node/13555934502.
-- Trường Đại học Đà Lạt: congdoan.dlu.edu.vn/lien-he/.
-- Ốm Sữa: omsua.vn. This is the 160 branch, distinct from the 33 branch.
-- Pins come from the Maps places already selected on published public events.
INSERT INTO event_coverage_venues VALUES
  ('nhat-niem-tra', 'Nhất Niệm Trà', 'cafe', '26 Trạng Trình, Đà Lạt, Lâm Đồng', '26 trạng trình',
    11.9518607, 108.4552715, '2006484746538021288', NULL, 'nhất niệm trà'),
  ('beeppub', 'Beeppub', 'bar', '11A Nguyễn Chí Thanh, Đà Lạt, Lâm Đồng', '11a nguyễn chí thanh',
    11.9411551, 108.4366887, '2341970295074658830', 'https://beepitupdalat.wixsite.com/beeppub', 'beeppub'),
  ('dalat-university', 'Trường Đại học Đà Lạt', 'other', '1 Phù Đổng Thiên Vương, Lâm Viên, Đà Lạt, Lâm Đồng',
    '1 phù đổng thiên vương', 11.9545604, 108.4442049, '11269900663778399994', 'https://www.dlu.edu.vn/', 'dalat university'),
  ('om-sua-160-nguyen-cong-tru', 'Ốm Sữa - 160 Nguyễn Công Trứ', 'cafe',
    '160 Nguyễn Công Trứ, Lâm Viên, Đà Lạt, Lâm Đồng', '160 nguyễn công trứ', 11.9566539, 108.4376483,
    '15388556931758619991', 'https://omsua.vn/', 'ốm sữa - 160 nguyễn công trứ');

INSERT INTO public.venues
  (slug, name, venue_type, address, latitude, longitude, google_maps_url, website_url, geocode_source, source_locale)
SELECT coverage.slug, coverage.name, coverage.venue_type, coverage.address, coverage.latitude, coverage.longitude,
       'https://maps.google.com/?cid=' || coverage.maps_cid, coverage.website_url, 'google_maps_link', 'vi'
FROM event_coverage_venues AS coverage
WHERE NOT EXISTS (
  SELECT 1 FROM public.venues AS venue
  WHERE substring(venue.google_maps_url from '[?&]cid=([0-9]+)') = coverage.maps_cid
    OR (lower(trim(venue.name)) = lower(coverage.name)
      AND lower(trim(split_part(venue.address, ',', 1))) = coverage.street)
)
ON CONFLICT (slug) DO NOTHING;

-- Only link known public occurrences with both the same Maps entity and street.
-- Never replace their original room name, pin, or directions.
WITH linked AS (
  UPDATE public.events AS event
  SET venue_id = picked.id
  FROM event_coverage_venues AS coverage
  CROSS JOIN LATERAL (
    SELECT venue.id
    FROM public.venues AS venue
    WHERE substring(venue.google_maps_url from '[?&]cid=([0-9]+)') = coverage.maps_cid
      OR (lower(trim(venue.name)) = lower(coverage.name)
        AND lower(trim(split_part(venue.address, ',', 1))) = coverage.street)
    ORDER BY venue.is_verified DESC, venue.slug = coverage.slug DESC, venue.id
    LIMIT 1
  ) AS picked
  WHERE event.venue_id IS NULL
    AND event.status = 'published'
    AND event.is_online IS NOT TRUE
    AND event.has_private_details IS NOT TRUE
    AND (event.tribe_id IS NULL OR event.tribe_visibility = 'public')
    AND lower(trim(event.location_name)) = coverage.event_location_name
    AND substring(event.google_maps_url from '[?&]cid=([0-9]+)') = coverage.maps_cid
    AND regexp_replace(lower(trim(split_part(event.address, ',', 1))), '^([0-9]+[a-z]?) (đ[.]|đường) ', '\1 ')
      = coverage.street
  RETURNING coverage.slug
)
SELECT coverage.slug, count(linked.slug)::int AS events_linked
FROM event_coverage_venues AS coverage
LEFT JOIN linked USING (slug)
GROUP BY coverage.slug
ORDER BY coverage.slug;

COMMIT;

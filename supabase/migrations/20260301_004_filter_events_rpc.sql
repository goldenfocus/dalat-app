-- Comprehensive event filtering with geospatial support
-- Migration: 20260301_004_filter_events_rpc.sql

CREATE OR REPLACE FUNCTION filter_events(
  p_lifecycle text DEFAULT 'upcoming',
  p_categories text[] DEFAULT NULL,
  p_price_filter text DEFAULT 'all',
  p_search_query text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_user_lat double precision DEFAULT NULL,
  p_user_lng double precision DEFAULT NULL,
  p_radius_km double precision DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  description text,
  image_url text,
  location_name text,
  address text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  price_type text,
  price_amount numeric,
  price_currency text,
  capacity int,
  distance_km double precision,
  category_ids text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_point geography;
BEGIN
  -- Create user location point if coordinates provided
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    v_user_point := ST_SetSRID(
      ST_MakePoint(p_user_lng, p_user_lat), 4326
    )::geography;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.slug,
    e.title,
    e.description,
    e.image_url,
    e.location_name,
    e.address,
    e.latitude,
    e.longitude,
    e.starts_at,
    e.ends_at,
    e.price_type,
    e.price_amount,
    e.price_currency,
    e.capacity,
    -- Calculate distance in kilometers if user location provided
    CASE
      WHEN v_user_point IS NOT NULL AND e.location_point IS NOT NULL
      THEN ST_Distance(v_user_point, e.location_point) / 1000.0
      ELSE NULL
    END AS distance_km,
    -- Aggregate category IDs
    ARRAY(
      SELECT eca.category_id
      FROM event_category_assignments eca
      WHERE eca.event_id = e.id
    ) AS category_ids
  FROM events e
  WHERE
    -- Published events only
    e.status = 'published'

    -- Lifecycle filter
    AND CASE p_lifecycle
      WHEN 'upcoming' THEN e.starts_at > now()
      WHEN 'happening' THEN
        e.starts_at <= now() AND
        (e.ends_at >= now() OR (e.ends_at IS NULL AND e.starts_at + interval '4 hours' >= now()))
      WHEN 'past' THEN
        (e.ends_at IS NOT NULL AND e.ends_at < now()) OR
        (e.ends_at IS NULL AND e.starts_at + interval '4 hours' < now())
      ELSE true
    END

    -- Category filter (events must have at least one matching category)
    AND (
      p_categories IS NULL
      OR EXISTS (
        SELECT 1 FROM event_category_assignments eca
        WHERE eca.event_id = e.id AND eca.category_id = ANY(p_categories)
      )
    )

    -- Price filter
    AND (
      p_price_filter = 'all'
      OR (p_price_filter = 'free' AND e.price_type IN ('free', 'free_with_rsvp', 'donation'))
      OR (p_price_filter = 'paid' AND e.price_type = 'paid')
    )

    -- Search query (title, description, location)
    AND (
      p_search_query IS NULL
      OR p_search_query = ''
      OR e.title ILIKE '%' || p_search_query || '%'
      OR e.description ILIKE '%' || p_search_query || '%'
      OR e.location_name ILIKE '%' || p_search_query || '%'
    )

    -- Date range filter
    AND (p_start_date IS NULL OR e.starts_at >= p_start_date)
    AND (p_end_date IS NULL OR e.starts_at <= p_end_date)

    -- Distance/radius filter (only if user location and radius provided)
    AND (
      v_user_point IS NULL
      OR p_radius_km IS NULL
      OR e.location_point IS NULL
      OR ST_DWithin(v_user_point, e.location_point, p_radius_km * 1000)
    )
  ORDER BY
    -- Sort by distance if user location provided, otherwise by date
    CASE
      WHEN v_user_point IS NOT NULL AND e.location_point IS NOT NULL
      THEN ST_Distance(v_user_point, e.location_point)
      ELSE NULL
    END ASC NULLS LAST,
    CASE WHEN p_lifecycle = 'past' THEN e.starts_at END DESC NULLS LAST,
    CASE WHEN p_lifecycle != 'past' THEN e.starts_at END ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION filter_events TO anon, authenticated;

COMMENT ON FUNCTION filter_events IS
  'Advanced event filtering with categories, price, search, date range, and geospatial queries. Returns events sorted by distance (if user location provided) or by date.';

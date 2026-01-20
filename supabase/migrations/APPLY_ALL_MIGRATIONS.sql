-- ============================================
-- LEGENDARY CALENDAR & MAP FEATURE MIGRATIONS
-- Apply all 4 migrations in order
-- ============================================

-- Instructions:
-- 1. Open Supabase Studio SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run" to execute all migrations at once
-- 4. Verify success by checking for event_categories table

-- ============================================
-- Migration 1: Add Event Price Fields
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS price_type text DEFAULT 'free'
  CHECK (price_type IN ('free', 'paid', 'donation', 'free_with_rsvp')),
ADD COLUMN IF NOT EXISTS price_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS price_currency text DEFAULT 'VND',
ADD COLUMN IF NOT EXISTS price_note text;

CREATE INDEX IF NOT EXISTS idx_events_price_type ON events(price_type)
WHERE status = 'published';

COMMENT ON COLUMN events.price_type IS 'Event pricing model: free, paid, donation, or free_with_rsvp';
COMMENT ON COLUMN events.price_amount IS 'Price in specified currency (null for free/donation)';
COMMENT ON COLUMN events.price_currency IS 'Currency code (default VND for Vietnamese Dong)';
COMMENT ON COLUMN events.price_note IS 'Additional pricing details or instructions';

-- Backfill existing events
UPDATE events SET price_type = 'free' WHERE price_type IS NULL;

-- ============================================
-- Migration 2: Event Categories System
-- ============================================

-- Event categories table
CREATE TABLE IF NOT EXISTS event_categories (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_vi text,
  icon text,
  color text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Many-to-many junction table
CREATE TABLE IF NOT EXISTS event_category_assignments (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  category_id text REFERENCES event_categories ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_event_category_assignments_event
  ON event_category_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_category_assignments_category
  ON event_category_assignments(category_id);

-- Pre-populate categories (use INSERT ON CONFLICT to avoid duplicates)
INSERT INTO event_categories (id, name_en, name_vi, icon, color, sort_order) VALUES
('music', 'Music', 'Âm nhạc', '🎵', '#8B5CF6', 1),
('yoga', 'Yoga & Wellness', 'Yoga', '🧘', '#10B981', 2),
('food', 'Food & Dining', 'Ẩm thực', '🍜', '#F59E0B', 3),
('art', 'Art & Culture', 'Nghệ thuật', '🎨', '#EC4899', 4),
('meditation', 'Meditation', 'Thiền', '🧘‍♀️', '#6366F1', 5),
('festival', 'Festivals', 'Lễ hội', '🎉', '#EF4444', 6),
('nature', 'Nature & Outdoors', 'Thiên nhiên', '🌿', '#059669', 7),
('community', 'Community', 'Cộng đồng', '👥', '#3B82F6', 8),
('education', 'Education', 'Giáo dục', '📚', '#0EA5E9', 9),
('sports', 'Sports & Fitness', 'Thể thao', '⚽', '#F97316', 10),
('nightlife', 'Nightlife', 'Đêm', '🌙', '#A855F7', 11),
('coffee', 'Coffee & Tea', 'Cà phê', '☕', '#92400E', 12)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON event_categories TO anon, authenticated;
GRANT SELECT ON event_category_assignments TO anon, authenticated;

COMMENT ON TABLE event_categories IS 'Predefined event categories for filtering and discovery';
COMMENT ON TABLE event_category_assignments IS 'Many-to-many relationship: events can have multiple categories';

-- ============================================
-- Migration 3: Enable PostGIS
-- ============================================

-- Enable PostGIS extension for distance calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column for efficient spatial queries
ALTER TABLE events
ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326);

-- Backfill existing events with coordinates
UPDATE events
SET location_point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location_point IS NULL;

-- Create spatial index (GIST)
CREATE INDEX IF NOT EXISTS idx_events_location_point ON events USING GIST(location_point);

-- Trigger to auto-update location_point when lat/lng changes
CREATE OR REPLACE FUNCTION update_event_location_point()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_point = ST_SetSRID(
      ST_MakePoint(NEW.longitude, NEW.latitude), 4326
    )::geography;
  ELSE
    NEW.location_point = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_location_point_update ON events;
CREATE TRIGGER events_location_point_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON events
FOR EACH ROW EXECUTE FUNCTION update_event_location_point();

COMMENT ON COLUMN events.location_point IS 'PostGIS geography point for efficient distance calculations';
COMMENT ON FUNCTION update_event_location_point IS 'Auto-syncs location_point with latitude/longitude changes';

-- ============================================
-- Migration 4: Filter Events RPC
-- ============================================

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

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check if price fields exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'events' AND column_name LIKE 'price%';

-- Check category count (should be 12)
SELECT COUNT(*) as category_count FROM event_categories;

-- Check if PostGIS is enabled
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';

-- Test the RPC function
SELECT * FROM filter_events(
  p_lifecycle := 'upcoming',
  p_price_filter := 'all',
  p_limit := 5
);

-- ============================================
-- ✅ ALL MIGRATIONS APPLIED SUCCESSFULLY!
-- ============================================

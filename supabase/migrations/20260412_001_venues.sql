-- ============================================
-- VENUES TABLE
-- Physical locations where events are held
-- ============================================
--
-- MIGRATION STRATEGY NOTES:
-- -------------------------
-- The existing organizers table has organizer_type = 'venue' (default value).
-- Some organizers may actually be physical venues (cafes, bars, galleries, etc.)
-- However, organizers do NOT have latitude/longitude coordinates.
--
-- After running this migration:
-- 1. Query: SELECT * FROM organizers WHERE organizer_type = 'venue';
-- 2. For each venue-type organizer that's a physical location:
--    - Look up the coordinates via Google Places API
--    - Create a record in the venues table
--    - Optionally update the organizer_type to something else (e.g., 'business')
-- 3. Eventually update events to reference venue_id where appropriate
--
-- This migration creates the venues table independently.
-- Manual data migration should be done as a separate, deliberate process.
-- ============================================

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,

  -- Venue type (what kind of place)
  venue_type text CHECK (venue_type IN (
    'cafe', 'bar', 'restaurant', 'gallery', 'park', 'hotel',
    'coworking', 'community_center', 'outdoor', 'homestay', 'other'
  )),

  -- Location (required for venues - this is the key differentiator from organizers)
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text,
  google_maps_url text,
  google_place_id text,

  -- Contact
  website_url text,
  facebook_url text,
  instagram_url text,
  zalo_url text,
  phone text,
  email text,

  -- Operating hours (JSON)
  -- Structure: { "monday": { "open": "08:00", "close": "22:00" }, "tuesday": "closed", ... }
  operating_hours jsonb,

  -- Amenities
  has_wifi boolean DEFAULT false,
  has_parking boolean DEFAULT false,
  has_outdoor_seating boolean DEFAULT false,
  is_pet_friendly boolean DEFAULT false,
  is_wheelchair_accessible boolean DEFAULT false,

  -- Enhanced fields for elite experience
  capacity int,
  price_range text CHECK (price_range IN ('$', '$$', '$$$', '$$$$')),
  tags text[] DEFAULT '{}',
  cuisine_types text[] DEFAULT '{}',
  photos jsonb DEFAULT '[]', -- [{url, caption, sort_order}]

  -- Media
  logo_url text,
  cover_photo_url text,

  -- Ownership & verification
  owner_id uuid REFERENCES profiles(id),
  is_verified boolean DEFAULT false,
  priority_score int DEFAULT 0,

  -- Analytics (updated by triggers/cron)
  total_events_hosted int DEFAULT 0,
  last_event_at timestamptz,

  -- Translation tracking
  source_locale text DEFAULT 'en',

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for performance
CREATE INDEX idx_venues_slug ON venues(slug);
CREATE INDEX idx_venues_type ON venues(venue_type);
CREATE INDEX idx_venues_owner ON venues(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_venues_verified ON venues(is_verified) WHERE is_verified = true;
CREATE INDEX idx_venues_coordinates ON venues(latitude, longitude);
CREATE INDEX idx_venues_priority ON venues(priority_score DESC, is_verified DESC);

-- Updated_at trigger (reuses existing function)
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- UPDATE EVENTS TABLE
-- Add venue_id foreign key
-- ============================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id) WHERE venue_id IS NOT NULL;

COMMENT ON COLUMN events.venue_id IS 'Optional link to a venue (WHERE). Different from organizer_id (WHO).';

-- ============================================
-- UPDATE TRANSLATION CONSTRAINTS
-- Add ''venue'' to allowed content types
-- ============================================

ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_content_type_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_content_type_check
CHECK (content_type IN ('event', 'moment', 'profile', 'blog', 'venue'));

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get venues for map display with event activity
CREATE OR REPLACE FUNCTION get_venues_for_map(
  p_types text[] DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_verified boolean,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.latitude, v.longitude, v.logo_url, v.is_verified,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now()
      AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (e2.ends_at IS NULL OR e2.ends_at > now())
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_types IS NULL OR v.venue_type = ANY(p_types))
  GROUP BY v.id
  ORDER BY has_happening_now DESC, upcoming_event_count DESC, v.priority_score DESC
  LIMIT p_limit;
$$;

-- Get venue by slug with all related data
CREATE OR REPLACE FUNCTION get_venue_by_slug(p_slug text)
RETURNS json
LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'venue', row_to_json(v),
    'upcoming_events', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'capacity', e.capacity
        ) ORDER BY e.starts_at
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at > now()
      LIMIT 10
    ),
    'happening_now', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at
        )
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
    ),
    'past_events_count', (
      SELECT COUNT(*)::int
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND COALESCE(e.ends_at, e.starts_at + interval '4 hours') < now()
    ),
    'recent_activity', json_build_object(
      'events_this_month', (
        SELECT COUNT(*)::int FROM events
        WHERE venue_id = v.id
        AND status = 'published'
        AND starts_at > now() - interval '30 days'
      ),
      'total_visitors', (
        SELECT COALESCE(COUNT(DISTINCT r.user_id), 0)::int
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
        WHERE e.venue_id = v.id
        AND r.status = 'going'
        AND e.starts_at > now() - interval '90 days'
      )
    )
  )
  FROM venues v
  WHERE v.slug = p_slug;
$$;

-- Get venues for discovery page (with filtering)
CREATE OR REPLACE FUNCTION get_venues_for_discovery(
  p_type text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  logo_url text,
  cover_photo_url text,
  address text,
  is_verified boolean,
  price_range text,
  tags text[],
  operating_hours jsonb,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.logo_url, v.cover_photo_url, v.address,
    v.is_verified, v.price_range, v.tags, v.operating_hours,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now() AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (e2.ends_at IS NULL OR e2.ends_at > now())
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_type IS NULL OR v.venue_type = p_type)
  GROUP BY v.id
  ORDER BY
    has_happening_now DESC,
    upcoming_event_count DESC,
    v.priority_score DESC,
    v.is_verified DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Grant execute to all (including anon for public pages)
GRANT EXECUTE ON FUNCTION get_venues_for_map(text[], int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_venue_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_venues_for_discovery(text, int, int) TO anon, authenticated;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "venues_select_public"
  ON venues FOR SELECT
  USING (true);

-- Admin/superadmin can manage all venues
CREATE POLICY "venues_insert_admin"
  ON venues FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "venues_update_admin"
  ON venues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "venues_delete_admin"
  ON venues FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Owners can update their own venues
CREATE POLICY "venues_update_owner"
  ON venues FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-media',
  'venue-media',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for venue media
CREATE POLICY "venue_media_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'venue-media');

CREATE POLICY "venue_media_insert_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'venue-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'organizer_verified')
    )
  );

CREATE POLICY "venue_media_update_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'venue-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'organizer_verified')
    )
  );

CREATE POLICY "venue_media_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'venue-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

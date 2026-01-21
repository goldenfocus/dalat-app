-- Add latitude and longitude columns to events table for map functionality
-- These will be populated from Google Places API when events are created

ALTER TABLE events
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;

-- Add index for spatial queries (finding nearby events)
CREATE INDEX IF NOT EXISTS idx_events_coordinates
ON events (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN events.latitude IS 'Latitude coordinate from Google Places API';
COMMENT ON COLUMN events.longitude IS 'Longitude coordinate from Google Places API';

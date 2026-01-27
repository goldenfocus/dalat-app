-- Add latitude and longitude columns to event_series table
-- These were added to events in 20260409 but missed for event_series

ALTER TABLE event_series
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;

-- Index for potential map queries on series
CREATE INDEX IF NOT EXISTS idx_event_series_coordinates
ON event_series (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Documentation
COMMENT ON COLUMN event_series.latitude IS 'Latitude coordinate from Google Places API';
COMMENT ON COLUMN event_series.longitude IS 'Longitude coordinate from Google Places API';

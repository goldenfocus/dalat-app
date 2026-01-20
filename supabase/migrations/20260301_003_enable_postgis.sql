-- Enable PostGIS extension for geospatial queries
-- Migration: 20260301_003_enable_postgis.sql

-- Enable PostGIS extension for distance calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column for efficient spatial queries
ALTER TABLE events
ADD COLUMN location_point geography(Point, 4326);

-- Backfill existing events with coordinates
UPDATE events
SET location_point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create spatial index (GIST)
CREATE INDEX idx_events_location_point ON events USING GIST(location_point);

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

CREATE TRIGGER events_location_point_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON events
FOR EACH ROW EXECUTE FUNCTION update_event_location_point();

COMMENT ON COLUMN events.location_point IS 'PostGIS geography point for efficient distance calculations';
COMMENT ON FUNCTION update_event_location_point IS 'Auto-syncs location_point with latitude/longitude changes';

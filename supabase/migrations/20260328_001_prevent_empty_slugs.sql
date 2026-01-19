-- Prevent empty slugs on events table
-- The NOT NULL constraint only prevents NULL values, not empty strings
-- This CHECK constraint ensures slugs have actual content

ALTER TABLE events ADD CONSTRAINT events_slug_not_empty CHECK (slug <> '');

-- Also add to event_series for consistency
ALTER TABLE event_series ADD CONSTRAINT event_series_slug_not_empty CHECK (slug <> '');

-- And organizers
ALTER TABLE organizers ADD CONSTRAINT organizers_slug_not_empty CHECK (slug <> '');

-- Add pricing support to events table
-- Migration: 20260301_001_add_event_price.sql

ALTER TABLE events
ADD COLUMN price_type text DEFAULT 'free'
  CHECK (price_type IN ('free', 'paid', 'donation', 'free_with_rsvp')),
ADD COLUMN price_amount numeric(10,2),
ADD COLUMN price_currency text DEFAULT 'VND',
ADD COLUMN price_note text;

CREATE INDEX idx_events_price_type ON events(price_type)
WHERE status = 'published';

COMMENT ON COLUMN events.price_type IS 'Event pricing model: free, paid, donation, or free_with_rsvp';
COMMENT ON COLUMN events.price_amount IS 'Price in specified currency (null for free/donation)';
COMMENT ON COLUMN events.price_currency IS 'Currency code (default VND for Vietnamese Dong)';
COMMENT ON COLUMN events.price_note IS 'Additional pricing details or instructions';

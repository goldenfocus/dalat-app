-- Event pricing: support free, paid, and donation-based events with flexible ticket tiers
-- ============================================================================

-- Add price_type enum
DO $$ BEGIN
  CREATE TYPE price_type AS ENUM ('free', 'paid', 'donation');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add pricing columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS price_type price_type DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ticket_tiers JSONB DEFAULT NULL;

-- Add pricing columns to event_series table (for recurring events)
ALTER TABLE event_series
ADD COLUMN IF NOT EXISTS price_type price_type DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ticket_tiers JSONB DEFAULT NULL;

-- Add comment explaining the ticket_tiers structure
COMMENT ON COLUMN events.ticket_tiers IS 'JSON array of ticket tiers: [{"name": "General", "price": 100000, "currency": "VND", "description": "Standard entry"}]';
COMMENT ON COLUMN events.price_type IS 'Event pricing model: free (no cost), paid (has ticket tiers), donation (pay what you can)';

COMMENT ON COLUMN event_series.ticket_tiers IS 'JSON array of ticket tiers: [{"name": "General", "price": 100000, "currency": "VND", "description": "Standard entry"}]';
COMMENT ON COLUMN event_series.price_type IS 'Event pricing model: free (no cost), paid (has ticket tiers), donation (pay what you can)';

-- Index for filtering by price_type (useful for future filtering)
CREATE INDEX IF NOT EXISTS idx_events_price_type ON events(price_type) WHERE price_type IS NOT NULL;

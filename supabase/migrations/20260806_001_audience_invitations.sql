-- Audience invitations: mark invitation rows created by an admin audience blast
-- (@all / @games). Powers the 30-day per-user blast cooldown and per-blast analytics.

-- New notification type for the blast (notifications.type is a Postgres enum)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'audience_invitation';

ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS audience TEXT;

COMMENT ON COLUMN event_invitations.audience IS
  'Non-null when this invitation was created by an admin audience blast. Value = audience key (all, games, yoga, ...).';

-- Fast lookup for the 30-day cooldown check (claimed_by + created_at, blasts only)
CREATE INDEX IF NOT EXISTS idx_invitations_audience_cooldown
  ON event_invitations (claimed_by, created_at)
  WHERE audience IS NOT NULL;

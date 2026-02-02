-- Migration: venue_managers table + organizer claim tracking
-- This enables the Google Maps / Facebook Page model:
-- - Profiles manage multiple venues
-- - Organizers can be claimed (email-based flow)

-- =============================================================================
-- 1. VENUE MANAGERS - Multi-owner support for venues
-- =============================================================================

-- Enum for manager roles
CREATE TYPE VenueManagerRole AS ENUM ('owner', 'editor', 'viewer');

-- Junction table: which profiles manage which venues
CREATE TABLE venue_managers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VenueManagerRole NOT NULL DEFAULT 'editor',
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),

  -- Each profile can only have one role per venue
  UNIQUE (venue_id, profile_id)
);

-- Indexes for common queries
CREATE INDEX idx_venue_managers_venue ON venue_managers(venue_id);
CREATE INDEX idx_venue_managers_profile ON venue_managers(profile_id);
CREATE INDEX idx_venue_managers_role ON venue_managers(role);

-- =============================================================================
-- 2. ORGANIZER CLAIM TRACKING
-- =============================================================================

-- Add columns to track claim requests on organizers
-- (organizers are placeholder entities from scraped data)
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS claim_requested_at timestamptz;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS claim_requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS claimed_venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;

-- Index for finding unclaimed organizers with pending claims
CREATE INDEX idx_organizers_claim_pending ON organizers(claim_requested_at)
  WHERE claim_requested_at IS NOT NULL AND owner_id IS NULL;

-- =============================================================================
-- 3. MIGRATE EXISTING VENUE OWNERS TO MANAGERS TABLE
-- =============================================================================

-- Insert existing owner_id relationships as 'owner' role in venue_managers
INSERT INTO venue_managers (venue_id, profile_id, role, accepted_at)
SELECT id, owner_id, 'owner', now()
FROM venues
WHERE owner_id IS NOT NULL
ON CONFLICT (venue_id, profile_id) DO NOTHING;

-- =============================================================================
-- 4. RLS POLICIES FOR VENUE_MANAGERS
-- =============================================================================

ALTER TABLE venue_managers ENABLE ROW LEVEL SECURITY;

-- Anyone can read venue managers (public info about who manages a venue)
CREATE POLICY "venue_managers_select" ON venue_managers
  FOR SELECT USING (true);

-- Only owners can add/remove managers
CREATE POLICY "venue_managers_insert" ON venue_managers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_managers vm
      WHERE vm.venue_id = venue_managers.venue_id
        AND vm.profile_id = auth.uid()
        AND vm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY "venue_managers_delete" ON venue_managers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM venue_managers vm
      WHERE vm.venue_id = venue_managers.venue_id
        AND vm.profile_id = auth.uid()
        AND vm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );

-- Owners can update roles (but not their own owner role)
CREATE POLICY "venue_managers_update" ON venue_managers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM venue_managers vm
      WHERE vm.venue_id = venue_managers.venue_id
        AND vm.profile_id = auth.uid()
        AND vm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );

-- =============================================================================
-- 5. HELPER FUNCTION: Check if user can manage a venue
-- =============================================================================

CREATE OR REPLACE FUNCTION can_manage_venue(p_venue_id uuid, p_profile_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_managers
    WHERE venue_id = p_venue_id
      AND profile_id = p_profile_id
      AND role IN ('owner', 'editor')
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_profile_id
      AND role IN ('superadmin', 'admin')
  );
$$;

-- =============================================================================
-- 6. HELPER FUNCTION: Get user's venues
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_venues(p_profile_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  venue_id uuid,
  venue_slug text,
  venue_name text,
  role VenueManagerRole
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    v.id,
    v.slug,
    v.name,
    vm.role
  FROM venue_managers vm
  JOIN venues v ON v.id = vm.venue_id
  WHERE vm.profile_id = p_profile_id
  ORDER BY vm.role, v.name;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION can_manage_venue TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_venues TO authenticated;

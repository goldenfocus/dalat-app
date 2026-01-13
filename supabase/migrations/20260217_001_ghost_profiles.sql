-- Add is_ghost flag to profiles for reliable detection
-- This is synced from auth.users.raw_user_meta_data.is_ghost

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_ghost boolean DEFAULT false;

-- Backfill is_ghost from auth.users metadata
UPDATE profiles p
SET is_ghost = true
WHERE EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id = p.id
  AND (u.raw_user_meta_data->>'is_ghost')::boolean = true
);

-- Also backfill bio for ghost profiles that are missing it
UPDATE profiles p
SET bio = 'This profile was auto-created from Facebook Events. Are you the organizer? Contact us to claim it!'
WHERE p.is_ghost = true
  AND (p.bio IS NULL OR p.bio = '');

-- Create index for fast ghost profile queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_ghost ON profiles(is_ghost) WHERE is_ghost = true;

COMMENT ON COLUMN profiles.is_ghost IS 'True if this profile was auto-created from imported events and can be claimed by the real organizer';

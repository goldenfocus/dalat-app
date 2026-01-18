-- Add superadmin role to the system

-- 1. Update the role check constraint to include superadmin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'superadmin', 'admin', 'moderator', 'organizer_verified', 'organizer_pending', 'contributor'));

-- 2. Update RLS policy for impersonation_sessions to use role instead of username
DROP POLICY IF EXISTS "impersonation_sessions_superadmin_only" ON impersonation_sessions;

CREATE POLICY "impersonation_sessions_superadmin_only"
ON impersonation_sessions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);

-- 3. Promote existing admin 'yan' to superadmin
UPDATE profiles SET role = 'superadmin' WHERE username = 'yan' AND role = 'admin';

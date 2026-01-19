-- Allow admins to update can_blog flag on any profile
-- Needed because profiles_update_own only allows users to update their own profile

CREATE POLICY "profiles_admin_update_can_blog"
ON profiles FOR UPDATE
TO authenticated
USING (
  -- Admin or superadmin can update any profile
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  -- Admin or superadmin can update any profile
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'superadmin')
  )
);

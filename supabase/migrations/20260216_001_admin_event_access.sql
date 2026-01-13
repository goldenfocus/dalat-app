-- Allow admins to update and delete any event
-- This helps with cleaning up scraped events that have quality issues

-- Helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Admin can update any event
CREATE POLICY "events_update_admin"
ON events FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());

-- Admin can delete any event
CREATE POLICY "events_delete_admin"
ON events FOR DELETE
USING (is_admin());

-- Fix organizer RLS policies to support superadmin role
-- Previously used direct role = 'admin' check which excludes superadmins
-- Now uses is_admin() which includes both 'admin' and 'superadmin'

-- ============================================
-- ORGANIZERS TABLE POLICIES
-- ============================================

-- Replace organizers_insert_admin policy
DROP POLICY IF EXISTS "organizers_insert_admin" ON organizers;
CREATE POLICY "organizers_insert_admin"
ON organizers FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Replace organizers_update_admin_or_owner policy
DROP POLICY IF EXISTS "organizers_update_admin_or_owner" ON organizers;
CREATE POLICY "organizers_update_admin_or_owner"
ON organizers FOR UPDATE
TO authenticated
USING (is_admin() OR owner_id = auth.uid())
WITH CHECK (is_admin() OR owner_id = auth.uid());

-- Replace organizers_delete_admin policy
DROP POLICY IF EXISTS "organizers_delete_admin" ON organizers;
CREATE POLICY "organizers_delete_admin"
ON organizers FOR DELETE
TO authenticated
USING (is_admin());

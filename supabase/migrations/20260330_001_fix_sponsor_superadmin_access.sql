-- Fix sponsor RLS policies to support superadmin role
-- Previously used has_role('admin') which only checks for exact 'admin' role
-- Now uses is_admin() which includes both 'admin' and 'superadmin'

-- ============================================
-- SPONSORS TABLE POLICIES
-- ============================================

-- Replace sponsors_update policy
DROP POLICY IF EXISTS "sponsors_update" ON sponsors;
CREATE POLICY "sponsors_update"
ON sponsors FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR is_admin())
WITH CHECK (created_by = auth.uid() OR is_admin());

-- Replace sponsors_delete policy
DROP POLICY IF EXISTS "sponsors_delete" ON sponsors;
CREATE POLICY "sponsors_delete"
ON sponsors FOR DELETE
TO authenticated
USING (is_admin());

-- ============================================
-- EVENT_SPONSORS TABLE POLICIES
-- ============================================

-- Replace event_sponsors_insert policy
DROP POLICY IF EXISTS "event_sponsors_insert" ON event_sponsors;
CREATE POLICY "event_sponsors_insert"
ON event_sponsors FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE id = event_id
    AND created_by = auth.uid()
  )
  OR is_admin()
);

-- Replace event_sponsors_update policy
DROP POLICY IF EXISTS "event_sponsors_update" ON event_sponsors;
CREATE POLICY "event_sponsors_update"
ON event_sponsors FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE id = event_id
    AND created_by = auth.uid()
  )
  OR is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE id = event_id
    AND created_by = auth.uid()
  )
  OR is_admin()
);

-- Replace event_sponsors_delete policy
DROP POLICY IF EXISTS "event_sponsors_delete" ON event_sponsors;
CREATE POLICY "event_sponsors_delete"
ON event_sponsors FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE id = event_id
    AND created_by = auth.uid()
  )
  OR is_admin()
);

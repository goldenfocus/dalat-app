-- Fix: Add admin/superadmin policies to event-materials storage bucket
-- The event_materials TABLE already has admin policies, but the storage.objects
-- policies were missing admin access, causing upload failures for admins
-- editing events they didn't create.

-- Also update the is_event_materials_owner function to include admins,
-- so the existing INSERT/UPDATE/DELETE policies work for admins too.

CREATE OR REPLACE FUNCTION public.is_event_materials_owner(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = (storage.foldername(object_name))[1]::uuid
    AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  );
$$;

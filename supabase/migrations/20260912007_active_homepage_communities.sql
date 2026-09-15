-- Public discovery exposes aggregate counts only, never membership identities.
CREATE OR REPLACE FUNCTION public.get_active_homepage_communities()
RETURNS TABLE (
  id uuid, slug text, name text, description text, cover_image_url text,
  access_type text, settings jsonb, member_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.slug, t.name, t.description, t.cover_image_url,
         t.access_type, t.settings, count(*) AS member_count
  FROM public.tribes t
  JOIN public.tribe_members tm ON tm.tribe_id = t.id AND tm.status = 'active'
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE t.is_listed = true AND t.access_type IN ('public', 'request')
    AND coalesce(p.role, 'user') NOT IN ('admin', 'superadmin')
  GROUP BY t.id
  ORDER BY count(*) DESC, t.name ASC, t.id ASC
  LIMIT 8;
$$;
REVOKE ALL ON FUNCTION public.get_active_homepage_communities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_homepage_communities() TO anon, authenticated, service_role;

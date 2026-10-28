BEGIN;
-- Blog recaps are storage drafts; only the explicitly published narrative is public.
CREATE FUNCTION public.can_view_public_blog_translation(p_id uuid,p_field text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.blog_posts b LEFT JOIN public.blog_categories c ON c.id=b.category_id
  LEFT JOIN public.events e ON e.id=b.event_id
  WHERE b.id=p_id AND (
   b.status='published' OR (b.status='experimental' AND c.slug='news') OR
   (b.status='draft' AND b.recap_published_at IS NOT NULL AND p_field IN ('title','story_content','meta_description') AND e.status='published' AND (e.tribe_id IS NULL OR e.tribe_visibility='public'))
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_view_public_blog_translation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_public_blog_translation(uuid,text) TO anon,authenticated;
DROP POLICY translations_select_public ON public.content_translations;
CREATE POLICY translations_select_public ON public.content_translations FOR SELECT USING (
 NOT is_stale AND CASE
 WHEN content_type='people' THEN public.can_view_people_profile(content_id)
 WHEN content_type='profile' THEN content_id=auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=content_id AND NOT p.is_private)
 WHEN content_type='event' THEN EXISTS (SELECT 1 FROM public.events e WHERE e.id=content_id AND e.status='published')
 WHEN content_type='moment' THEN EXISTS (SELECT 1 FROM public.moments m WHERE m.id=content_id AND m.status='published')
 WHEN content_type='comment' THEN EXISTS (SELECT 1 FROM public.comments c WHERE c.id=content_id AND NOT c.is_deleted AND NOT c.is_hidden)
 WHEN content_type='track' THEN EXISTS (SELECT 1 FROM public.playlist_tracks t WHERE t.id=content_id)
 WHEN content_type='blog' THEN public.can_view_public_blog_translation(content_id,field_name)
 WHEN content_type='venue' THEN EXISTS (SELECT 1 FROM public.venues v WHERE v.id=content_id)
 WHEN content_type='organizer' THEN EXISTS (SELECT 1 FROM public.organizers o WHERE o.id=content_id)
 WHEN content_type='experience' THEN EXISTS (SELECT 1 FROM public.experiences e WHERE e.id=content_id AND e.status='published')
 WHEN content_type='tribe' THEN EXISTS (SELECT 1 FROM public.tribes t WHERE t.id=content_id AND t.is_listed AND t.access_type IN ('public','request'))
 WHEN content_type='menu_item' THEN EXISTS (SELECT 1 FROM public.venue_menu_items i WHERE i.id=content_id AND i.is_available)
 WHEN content_type='menu_section' THEN EXISTS (SELECT 1 FROM public.venue_menu_sections s WHERE s.id=content_id AND s.is_visible)
 WHEN content_type='festival' THEN EXISTS (SELECT 1 FROM public.festivals f WHERE f.id=content_id)
 ELSE false END
);
COMMIT;

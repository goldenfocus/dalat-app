-- User-authorized setup. Resolve the owner and venue from her two actual events.
-- The September 17 schedule is confirmed by the user; copy remains an unpublished draft.
BEGIN;
DO $$
DECLARE owner_id uuid; community_id uuid; past events%ROWTYPE; existing_owner uuid;
BEGIN
 SELECT created_by INTO owner_id FROM events WHERE id='9e61dfc2-1f06-440d-8eb7-ae68287d1304';
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=owner_id AND NOT is_ghost AND username='rachel') OR NOT EXISTS(SELECT 1 FROM events WHERE id='6cf9bd49-e934-4419-b23c-742c480b4c57' AND created_by=owner_id) THEN RAISE EXCEPTION 'Verified community owner could not be resolved'; END IF;
 SELECT id,created_by INTO community_id,existing_owner FROM tribes WHERE slug='professionals';
 IF community_id IS NOT NULL AND existing_owner<>owner_id THEN RAISE EXCEPTION 'Community belongs to another owner'; END IF;
 IF community_id IS NULL THEN
  INSERT INTO tribes(slug,short_slug,name,description,created_by,access_type,is_listed,cover_image_url,settings)
  VALUES('professionals','professionals','Dalat Professionals','A welcoming community for professionals, entrepreneurs, freelancers and curious people in Đà Lạt. Meet, share ideas, learn from each other and support what you’re building. Locals, expats and newcomers are welcome.',owner_id,'public',true,'/images/communities/dalat-professionals-illustration-v1.png','{"cover_is_ai":true}'::jsonb) RETURNING id INTO community_id;
 END IF;
 IF EXISTS(SELECT 1 FROM events WHERE id IN ('9e61dfc2-1f06-440d-8eb7-ae68287d1304','6cf9bd49-e934-4419-b23c-742c480b4c57') AND tribe_id IS NOT NULL AND tribe_id<>community_id) THEN RAISE EXCEPTION 'A past event belongs to another community'; END IF;
 UPDATE events SET tribe_id=community_id,tribe_visibility='public' WHERE id IN ('9e61dfc2-1f06-440d-8eb7-ae68287d1304','6cf9bd49-e934-4419-b23c-742c480b4c57');
 SELECT * INTO past FROM events WHERE id='9e61dfc2-1f06-440d-8eb7-ae68287d1304';
 IF NOT EXISTS(SELECT 1 FROM events WHERE created_by=owner_id AND starts_at>='2026-09-16T17:00:00Z' AND starts_at<'2026-09-17T17:00:00Z') THEN
  INSERT INTO events(slug,title,description,created_by,starts_at,ends_at,status,tribe_id,tribe_visibility,venue_id,location_name,address,google_maps_url,source_metadata)
  VALUES('professionals-september-17','Dalat Professionals — September Gathering',E'Thursday, September 17, 2026\n10:00 am–12:00 pm at Le Pin Café, Đà Lạt.\n\nOptional lunch afterward at a vegetarian restaurant.\n\nDraft for Rachel to finalize: guided life / quarterly review gathering. Final title, description and lunch venue to be added before publication.',owner_id,'2026-09-17T03:00:00Z','2026-09-17T05:00:00Z','draft',community_id,'public',past.venue_id,past.location_name,past.address,past.google_maps_url,'{"setup_source":"user-confirmed schedule; organizer copy pending"}'::jsonb);
 END IF;
END $$;
COMMIT;
SELECT json_build_object('community',(SELECT json_build_object('slug',slug,'short_slug',short_slug,'owner',created_by,'members',member_count) FROM tribes WHERE slug='professionals'),'events',(SELECT json_agg(json_build_object('slug',e.slug,'status',e.status,'starts_at',e.starts_at)) FROM events e JOIN tribes t ON t.id=e.tribe_id WHERE t.slug='professionals')) AS configured;

begin;
-- A short account or an original photo can stand alone. Publication is still explicit.
alter table public.experiences drop constraint publish_review;
alter table public.experiences add constraint publish_review check (
 status <> 'published' or (length(trim(title)) > 0 and permission_confirmed
 and (length(trim(narrative)) > 0 or cardinality(selected_media)>0)
 and ((length(trim(venue_name))=0 and venue_id is null) or venue_confirmed))
);
commit;

\i supabase/tests/people-bootstrap.sql
ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN phone_confirmed_at timestamptz, ADD COLUMN banned_until timestamptz, ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.organizers ADD COLUMN owner_id uuid;
ALTER TABLE public.events ADD COLUMN organizer_id uuid REFERENCES public.organizers(id), ADD COLUMN starts_at timestamptz DEFAULT now(), ADD COLUMN tribe_id uuid, ADD COLUMN tribe_visibility text DEFAULT 'public';
ALTER TABLE public.rsvps ADD COLUMN plus_ones integer DEFAULT 0;
CREATE TABLE public.people_blocks(blocker_id uuid,blocked_id uuid,PRIMARY KEY(blocker_id,blocked_id));
ALTER TABLE public.people_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON public.people_blocks TO authenticated;
CREATE POLICY own_blocks ON public.people_blocks USING(blocker_id=auth.uid()) WITH CHECK(blocker_id=auth.uid());
CREATE TABLE public.event_people(event_id uuid,user_id uuid,PRIMARY KEY(event_id,user_id));
ALTER TABLE public.event_people ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_people TO anon,authenticated;
CREATE POLICY event_people_read ON public.event_people FOR SELECT USING(true);
CREATE TABLE public.event_series(id uuid PRIMARY KEY,created_by uuid,organizer_id uuid);
GRANT SELECT ON public.event_series TO anon,authenticated;
CREATE TABLE public.series_rsvps(series_id uuid,user_id uuid,PRIMARY KEY(series_id,user_id));
ALTER TABLE public.series_rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.series_rsvps TO anon,authenticated;
CREATE POLICY series_public ON public.series_rsvps FOR SELECT USING(true);
CREATE FUNCTION public.can_edit_event(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM events WHERE id=p_id AND created_by=auth.uid()) $$;

CREATE FUNCTION public.is_tribe_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

ALTER TABLE public.events ADD COLUMN slug text, ADD COLUMN image_url text, ADD COLUMN location_name text, ADD COLUMN ai_tags text[], ADD COLUMN sponsor_tier integer;
ALTER TABLE public.rsvps ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE public.series_rsvps ADD COLUMN auto_rsvp boolean DEFAULT true;
CREATE TABLE public.user_follows(follower_id uuid,following_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.moments(id uuid,user_id uuid,event_id uuid,status text,media_url text,created_at timestamptz);
CREATE TABLE public.event_settings(event_id uuid,moments_enabled boolean,moments_who_can_post text);
CREATE TYPE public.event_counts_result AS(event_id uuid,going_count integer,going_spots integer,waitlist_count integer,interested_count integer);

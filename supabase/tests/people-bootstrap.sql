-- Minimal faithful dependencies for an isolated local PostgreSQL instance.
-- This is NOT a production migration or a complete Supabase schema snapshot.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- Hosted Supabase grants these roles function EXECUTE by default. Revoking
-- PUBLIC alone does not remove the explicit inherited defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text UNIQUE, display_name text, bio text, avatar_url text,
 role text NOT NULL DEFAULT 'user', is_private boolean NOT NULL DEFAULT false,
 is_ghost boolean DEFAULT false
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY profiles_select_public ON public.profiles FOR SELECT USING(true);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE TABLE public.venues(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
CREATE TABLE public.organizers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
CREATE TABLE public.tribes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), short_slug text);
CREATE TABLE public.unified_slugs(slug text PRIMARY KEY, entity_type text, entity_id uuid);
CREATE TABLE public.reserved_slugs(slug text PRIMARY KEY, reason text NOT NULL);

CREATE TABLE public.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid REFERENCES public.profiles(id),
 status text DEFAULT 'published', title text
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
CREATE POLICY events_select ON public.events FOR SELECT USING(status='published' OR created_by=auth.uid());
CREATE TABLE public.rsvps (
 event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text DEFAULT 'going', PRIMARY KEY(event_id,user_id)
);
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.rsvps TO anon, authenticated;
GRANT UPDATE, DELETE ON public.rsvps TO authenticated;
GRANT ALL ON public.rsvps TO service_role;
CREATE POLICY rsvps_read ON public.rsvps FOR SELECT
 USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.events e WHERE e.id=event_id));
CREATE POLICY rsvps_update_own ON public.rsvps FOR UPDATE USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY rsvps_delete_own ON public.rsvps FOR DELETE USING(user_id=auth.uid());

CREATE TABLE public.content_translations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 content_type text NOT NULL CONSTRAINT content_translations_content_type_check
  CHECK(content_type IN ('event','moment','profile','blog','venue','comment','organizer','track')),
 content_id uuid NOT NULL,
 source_locale text NOT NULL DEFAULT 'en',
 target_locale text NOT NULL CHECK(target_locale IN ('en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id')),
 field_name text NOT NULL CONSTRAINT content_translations_field_name_check CHECK(field_name IN (
  'title','description','text_content','bio','story_content','technical_content','meta_description',
  'image_alt','image_description','ai_description','ai_title','scene_description','video_summary','audio_summary','pdf_summary',
  'video_transcript','audio_transcript','pdf_extracted_text','content','lyrics')),
 translated_text text NOT NULL,
 translation_status text DEFAULT 'auto', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 UNIQUE(content_type,content_id,target_locale,field_name)
);
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;
-- Existing hosted tables can retain legacy table DML grants. Tests keep those
-- broader grants to prove RLS, rather than missing grants, protects translation.
GRANT SELECT ON public.content_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_translations TO authenticated, service_role;
CREATE POLICY translations_select_public ON public.content_translations FOR SELECT USING(
 content_type<>'profile' OR content_id=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=content_id AND NOT p.is_private));
CREATE POLICY translations_insert_authenticated ON public.content_translations FOR INSERT WITH CHECK(
 EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','moderator','superadmin'))
 OR (content_type='profile' AND content_id=auth.uid()));
CREATE POLICY translations_update_authenticated ON public.content_translations FOR UPDATE USING(
 EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','moderator','superadmin'))
 OR (content_type='profile' AND content_id=auth.uid()));
CREATE POLICY translations_delete_authenticated ON public.content_translations FOR DELETE USING(
 EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','moderator','superadmin'))
 OR (content_type='profile' AND content_id=auth.uid()));

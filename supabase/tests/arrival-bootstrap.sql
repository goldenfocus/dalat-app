-- Only for scripts/test-arrival-sql.sh's disposable local PostgreSQL cluster.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),username text UNIQUE,role text DEFAULT 'user');
CREATE TABLE public.venues(id uuid PRIMARY KEY,owner_id uuid REFERENCES profiles(id));
CREATE TABLE public.venue_managers(venue_id uuid REFERENCES venues(id),profile_id uuid REFERENCES profiles(id),role text,accepted_at timestamptz);
CREATE TABLE public.event_series(id uuid PRIMARY KEY,slug text UNIQUE);
CREATE TABLE public.events(id uuid PRIMARY KEY,created_by uuid REFERENCES profiles(id),series_id uuid REFERENCES event_series(id),venue_id uuid REFERENCES venues(id),status text,starts_at timestamptz,ends_at timestamptz,tribe_id uuid,tribe_visibility text);
CREATE TABLE public.rsvps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid REFERENCES events(id),user_id uuid REFERENCES profiles(id),status text,checked_in_at timestamptz,checked_in_by uuid,no_show_at timestamptz);
CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

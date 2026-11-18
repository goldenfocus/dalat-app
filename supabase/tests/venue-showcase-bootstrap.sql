CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.venues(id uuid PRIMARY KEY,slug text UNIQUE);
CREATE TABLE public.event_series(id uuid PRIMARY KEY,slug text,rrule text);
CREATE TABLE public.events(id uuid PRIMARY KEY,slug text,title text,image_url text,starts_at timestamptz,ends_at timestamptz,capacity integer,venue_id uuid,series_id uuid,status text,has_private_details boolean DEFAULT false);
CREATE TABLE public.venue_menu_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venue_id uuid,slug text,title text,note text,sort integer,is_visible boolean DEFAULT true, UNIQUE(venue_id,slug));
CREATE TABLE public.venue_menu_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venue_id uuid,section_id uuid,name text,description text,price_vnd integer,option_groups jsonb,tags text[],sort integer,is_available boolean DEFAULT true,is_sold_out boolean DEFAULT false);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

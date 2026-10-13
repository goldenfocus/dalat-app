-- Google Places cache on venues. Only google_place_id is kept long-term;
-- every other google_* field is a refreshable cache (see google_synced_at)
-- and is shown with Google attribution, never as our own content.
alter table public.venues
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_user_rating_count integer,
  add column if not exists google_editorial_summary text,
  add column if not exists google_primary_type text,
  add column if not exists google_photos jsonb not null default '[]'::jsonb,
  add column if not exists google_reviews jsonb not null default '[]'::jsonb,
  add column if not exists google_synced_at timestamptz,
  add column if not exists geocode_source text;

-- Venue claims: a signed-in user asks to own an unclaimed venue; a
-- superadmin approves, which sets venues.owner_id (venues_update_owner RLS
-- then lets them edit).
create table if not exists public.venue_claims (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists venue_claims_one_pending
  on public.venue_claims (venue_id, user_id) where status = 'pending';
alter table public.venue_claims enable row level security;
create policy venue_claims_select_own_or_admin on public.venue_claims
  for select to authenticated using (
    user_id = auth.uid() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')));
create policy venue_claims_insert_own on public.venue_claims
  for insert to authenticated with check (
    user_id = auth.uid() and status = 'pending' and reviewed_by is null
    and exists (select 1 from public.venues v where v.id = venue_id and v.owner_id is null));
grant select, insert on table public.venue_claims to authenticated;
grant select, insert, update, delete on table public.venue_claims to service_role;

-- Likes on individual experience photos.
create table if not exists public.experience_media_likes (
  media_id uuid not null references public.experience_media(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);
alter table public.experience_media_likes enable row level security;
create policy experience_media_likes_select on public.experience_media_likes
  for select using (exists (
    select 1 from public.experience_media m join public.experiences e on e.id = m.experience_id
    where m.id = media_id and e.status = 'published'));
create policy experience_media_likes_insert_own on public.experience_media_likes
  for insert to authenticated with check (user_id = auth.uid() and exists (
    select 1 from public.experience_media m join public.experiences e on e.id = m.experience_id
    where m.id = media_id and e.status = 'published'));
create policy experience_media_likes_delete_own on public.experience_media_likes
  for delete to authenticated using (user_id = auth.uid());
grant select on table public.experience_media_likes to anon, authenticated;
grant insert, delete on table public.experience_media_likes to authenticated;
grant select, insert, delete on table public.experience_media_likes to service_role;

-- Comments on experience photos reuse the shared comments table.
alter table public.comments drop constraint if exists comments_target_type_check;
alter table public.comments add constraint comments_target_type_check
  check (target_type = any (array['event','moment','experience_media']));
drop policy if exists comments_insert_authenticated on public.comments;
create policy comments_insert_authenticated on public.comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and case target_type
      when 'event' then exists (select 1 from events where events.id = comments.target_id and events.status = 'published')
      when 'moment' then exists (select 1 from moments where moments.id = comments.target_id and moments.status = 'published')
      when 'experience_media' then exists (
        select 1 from experience_media m join experiences e on e.id = m.experience_id
        where m.id = comments.target_id and e.status = 'published')
      else false
    end
    and (parent_id is null or exists (
      select 1 from comments c
      where c.id = comments.parent_id and c.parent_id is null
        and c.target_type = comments.target_type and c.target_id = comments.target_id
        and not c.is_deleted)));

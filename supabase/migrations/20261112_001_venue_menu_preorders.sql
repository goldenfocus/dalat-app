-- Venue menus + event preorders.
-- A venue publishes a menu (sections + items, VND). Guests attached to an
-- upcoming event at that venue can preorder from it. Pricing is always
-- recomputed server-side in create_event_preorder() — the client sends only
-- item ids and quantities.

alter table public.venues
  add column if not exists preorder_enabled boolean not null default false;

-- Who may manage a venue's menu and see its preorders: owner, accepted
-- owner/editor manager, or site admin/moderator.
create or replace function public.is_venue_editor(p_venue_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from venues v where v.id = p_venue_id and v.owner_id = auth.uid())
    or exists (select 1 from venue_managers m
               where m.venue_id = p_venue_id and m.profile_id = auth.uid()
                 and m.accepted_at is not null and m.role in ('owner','editor'))
    or exists (select 1 from profiles p
               where p.id = auth.uid() and p.role in ('admin','superadmin','moderator'))
  );
$$;
grant execute on function public.is_venue_editor(uuid) to anon, authenticated;

create table if not exists public.venue_menu_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) <= 120),
  title_i18n jsonb not null default '{}'::jsonb,
  note text check (note is null or char_length(note) <= 600),
  note_i18n jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, slug)
);
create index if not exists venue_menu_sections_venue on public.venue_menu_sections (venue_id, sort);

create table if not exists public.venue_menu_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  section_id uuid not null references public.venue_menu_sections(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  name_i18n jsonb not null default '{}'::jsonb,
  description text check (description is null or char_length(description) <= 600),
  description_i18n jsonb not null default '{}'::jsonb,
  price_vnd integer not null check (price_vnd >= 0 and price_vnd <= 100000000),
  tags text[] not null default '{}',          -- e.g. favourite, vegetarian, hot, iced
  image_url text,
  is_available boolean not null default true,  -- listed at all
  is_sold_out boolean not null default false,  -- shown, not orderable
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venue_menu_items_section on public.venue_menu_items (section_id, sort);
create index if not exists venue_menu_items_venue on public.venue_menu_items (venue_id);
create trigger venue_menu_items_updated_at before update on public.venue_menu_items
  for each row execute function update_updated_at();

alter table public.venue_menu_sections enable row level security;
alter table public.venue_menu_items enable row level security;

create policy venue_menu_sections_read on public.venue_menu_sections
  for select using (is_visible or public.is_venue_editor(venue_id));
create policy venue_menu_sections_write on public.venue_menu_sections
  for all to authenticated
  using (public.is_venue_editor(venue_id)) with check (public.is_venue_editor(venue_id));

create policy venue_menu_items_read on public.venue_menu_items
  for select using (is_available or public.is_venue_editor(venue_id));
create policy venue_menu_items_write on public.venue_menu_items
  for all to authenticated
  using (public.is_venue_editor(venue_id)) with check (public.is_venue_editor(venue_id));

grant select on public.venue_menu_sections to anon, authenticated;
grant select on public.venue_menu_items to anon, authenticated;
grant insert, update, delete on public.venue_menu_sections to authenticated;
grant insert, update, delete on public.venue_menu_items to authenticated;
grant all on public.venue_menu_sections to service_role;
grant all on public.venue_menu_items to service_role;

-- ---------------------------------------------------------------------------
-- Preorders
-- ---------------------------------------------------------------------------
create table if not exists public.event_preorders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text check (phone is null or char_length(phone) <= 40),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','confirmed','fulfilled','cancelled')),
  total_vnd integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_preorders_event on public.event_preorders (event_id, status);
create index if not exists event_preorders_user on public.event_preorders (user_id);
-- one live preorder per guest per event (re-submitting replaces it)
create unique index if not exists event_preorders_one_live
  on public.event_preorders (event_id, user_id) where status in ('pending','confirmed');
create trigger event_preorders_updated_at before update on public.event_preorders
  for each row execute function update_updated_at();

create table if not exists public.event_preorder_items (
  id uuid primary key default gen_random_uuid(),
  preorder_id uuid not null references public.event_preorders(id) on delete cascade,
  menu_item_id uuid references public.venue_menu_items(id) on delete set null,
  name_snapshot text not null,
  unit_price_vnd integer not null check (unit_price_vnd >= 0),
  qty integer not null check (qty between 1 and 20)
);
create index if not exists event_preorder_items_preorder on public.event_preorder_items (preorder_id);

alter table public.event_preorders enable row level security;
alter table public.event_preorder_items enable row level security;

create policy event_preorders_read on public.event_preorders
  for select to authenticated using (user_id = auth.uid() or public.is_venue_editor(venue_id));
-- guests may only cancel their own; managers may set any status
create policy event_preorders_update_own on public.event_preorders
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'cancelled');
create policy event_preorders_update_manager on public.event_preorders
  for update to authenticated
  using (public.is_venue_editor(venue_id)) with check (public.is_venue_editor(venue_id));

create policy event_preorder_items_read on public.event_preorder_items
  for select to authenticated using (exists (
    select 1 from public.event_preorders p
    where p.id = preorder_id and (p.user_id = auth.uid() or public.is_venue_editor(p.venue_id))));

grant select, update on public.event_preorders to authenticated;
grant select on public.event_preorder_items to authenticated;
grant all on public.event_preorders to service_role;
grant all on public.event_preorder_items to service_role;

-- Place (or replace) the caller's preorder for an event.
-- p_items: [{"item_id": "<uuid>", "qty": 2}, ...]
create or replace function public.create_event_preorder(
  p_event_id uuid, p_items jsonb, p_note text default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_venue uuid;
  v_enabled boolean;
  v_preorder uuid;
  v_total integer := 0;
  v_count integer;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid_items';
  end if;

  select e.venue_id into v_venue from events e
   where e.id = p_event_id and e.status = 'published'
     and coalesce(e.ends_at, e.starts_at + interval '6 hours') > now();
  if v_venue is null then raise exception 'event_not_open_for_preorder'; end if;
  select preorder_enabled into v_enabled from venues where id = v_venue;
  if not coalesce(v_enabled, false) then raise exception 'preorder_disabled'; end if;

  -- replace any live preorder the guest already has for this event
  update event_preorders set status = 'cancelled'
   where event_id = p_event_id and user_id = v_uid and status in ('pending','confirmed');

  insert into event_preorders (event_id, venue_id, user_id, note, phone)
  values (p_event_id, v_venue, v_uid, nullif(left(trim(p_note), 500), ''), nullif(left(trim(p_phone), 40), ''))
  returning id into v_preorder;

  v_count := 0;
  for r in
    select i.id, i.name, i.price_vnd, least(greatest((x->>'qty')::int, 1), 20) as qty
      from jsonb_array_elements(p_items) x
      join venue_menu_items i on i.id = (x->>'item_id')::uuid
     where i.venue_id = v_venue and i.is_available and not i.is_sold_out
  loop
    insert into event_preorder_items (preorder_id, menu_item_id, name_snapshot, unit_price_vnd, qty)
    values (v_preorder, r.id, r.name, r.price_vnd, r.qty);
    v_total := v_total + r.price_vnd * r.qty;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'no_orderable_items'; end if;
  update event_preorders set total_vnd = v_total where id = v_preorder;
  return v_preorder;
end;
$$;
grant execute on function public.create_event_preorder(uuid, jsonb, text, text) to authenticated;

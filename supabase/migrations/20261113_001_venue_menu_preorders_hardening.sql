-- Hardening for venue menus + event preorders (review follow-ups to 20261112).

-- 1. An item's section must belong to the item's venue, so an editor of one
--    venue can't attach items to another venue's menu.
alter table public.venue_menu_sections
  add constraint venue_menu_sections_id_venue_key unique (id, venue_id);
alter table public.venue_menu_items
  add constraint venue_menu_items_section_same_venue
  foreign key (section_id, venue_id) references public.venue_menu_sections (id, venue_id) on delete cascade;

-- 2. Preorder rows are never updated directly: status changes go through
--    set_preorder_status() so nobody can rewrite totals, venue or event.
revoke update on public.event_preorders from authenticated;
drop policy if exists event_preorders_update_own on public.event_preorders;
drop policy if exists event_preorders_update_manager on public.event_preorders;

-- Guests may cancel their own live preorder; venue editors may set any status.
create or replace function public.set_preorder_status(p_preorder_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row event_preorders%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('pending','confirmed','fulfilled','cancelled') then raise exception 'invalid_status'; end if;
  select * into v_row from event_preorders where id = p_preorder_id for update;
  if not found then raise exception 'not_found'; end if;
  if not (
    is_venue_editor(v_row.venue_id)
    or (v_row.user_id = auth.uid() and p_status = 'cancelled' and v_row.status in ('pending','confirmed'))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update event_preorders set status = p_status where id = p_preorder_id;
end;
$$;
grant execute on function public.set_preorder_status(uuid, text) to authenticated;

-- 3. Reject the whole order if any line isn't orderable (no silent drops), and
--    only open preorders on events the venue's staff can see (not tribe-only).
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
     and (e.tribe_id is null or e.tribe_visibility = 'public')
     and coalesce(e.ends_at, e.starts_at + interval '6 hours') > now();
  if v_venue is null then raise exception 'event_not_open_for_preorder'; end if;
  select preorder_enabled into v_enabled from venues where id = v_venue;
  if not coalesce(v_enabled, false) then raise exception 'preorder_disabled'; end if;

  select count(distinct i.id) into v_count
    from jsonb_array_elements(p_items) x
    join venue_menu_items i on i.id = (x->>'item_id')::uuid
   where i.venue_id = v_venue and i.is_available and not i.is_sold_out;
  if v_count <> (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x) then
    raise exception 'item_unavailable';
  end if;

  -- replace any live preorder the guest already has for this event
  update event_preorders set status = 'cancelled'
   where event_id = p_event_id and user_id = v_uid and status in ('pending','confirmed');

  insert into event_preorders (event_id, venue_id, user_id, note, phone)
  values (p_event_id, v_venue, v_uid, nullif(left(trim(p_note), 500), ''), nullif(left(trim(p_phone), 40), ''))
  returning id into v_preorder;

  for r in
    select i.id, i.name, i.price_vnd, least(greatest(sum((x->>'qty')::int), 1), 20)::int as qty
      from jsonb_array_elements(p_items) x
      join venue_menu_items i on i.id = (x->>'item_id')::uuid
     where i.venue_id = v_venue
     group by i.id, i.name, i.price_vnd
  loop
    insert into event_preorder_items (preorder_id, menu_item_id, name_snapshot, unit_price_vnd, qty)
    values (v_preorder, r.id, r.name, r.price_vnd, r.qty);
    v_total := v_total + r.price_vnd * r.qty;
  end loop;

  update event_preorders set total_vnd = v_total where id = v_preorder;
  return v_preorder;
end;
$$;
grant execute on function public.create_event_preorder(uuid, jsonb, text, text) to authenticated;

create table if not exists public.organizer_claims (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_email text,
  note text check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists organizer_claims_one_pending
  on public.organizer_claims (organizer_id, user_id) where status = 'pending';

alter table public.organizer_claims enable row level security;
revoke all on public.organizer_claims from public, anon, authenticated;
grant select on public.organizer_claims to authenticated;
grant select, insert, update on public.organizer_claims to service_role;

drop policy if exists organizer_claims_select_own_or_admin on public.organizer_claims;
create policy organizer_claims_select_own_or_admin
  on public.organizer_claims for select to authenticated
  using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'superadmin')
    )
  );

-- A shared queue for venues and organizers, with a single in-app delivery per reviewer.
create or replace function public.enqueue_claim_review(
  p_claim_id uuid, p_kind text, p_name text
)
returns void
language sql
set search_path = ''
as $$
  insert into public.scheduled_notifications (
    user_id, type, scheduled_for, payload, reference_type, reference_id
  )
  select
    reviewer.id,
    'venue_claim_review',
    now(),
    jsonb_build_object(
      'type', 'venue_claim_review',
      'userId', reviewer.id,
      'locale', coalesce(reviewer.locale, 'en'),
      'claimId', p_claim_id,
      case p_kind when 'organizer' then 'organizerName' else 'venueName' end, p_name,
      'onlyChannels', jsonb_build_array('in_app')
    ),
    p_kind || '_claim',
    p_claim_id
  from public.profiles as reviewer
  where reviewer.role in ('admin', 'superadmin')
    and reviewer.is_ghost is not true;
$$;

revoke all on function public.enqueue_claim_review(uuid, text, text) from public, anon, authenticated;

create or replace function public.queue_venue_claim_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_claim_review(new.id, 'venue', v.name)
    from public.venues v where v.id = new.venue_id;
  return new;
end;
$$;

create or replace function public.queue_organizer_claim_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_claim_review(new.id, 'organizer', o.name)
    from public.organizers o where o.id = new.organizer_id;
  return new;
end;
$$;

revoke all on function public.queue_organizer_claim_review() from public, anon, authenticated;

create or replace trigger queue_organizer_claim_review
  after insert on public.organizer_claims for each row
  when (new.status = 'pending') execute function public.queue_organizer_claim_review();

-- Serialize submission with ownership changes so a retried request doesn't
-- open another claim after the organizer has been assigned.
create or replace function public.submit_organizer_claim(
  p_slug text, p_user_id uuid, p_email text, p_note text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  target_id uuid;
begin
  select id into target_id from public.organizers
    where slug = p_slug and owner_id is null for update;
  if not found then return false; end if;

  insert into public.organizer_claims (organizer_id, user_id, contact_email, note)
    values (target_id, p_user_id, p_email, p_note)
    on conflict (organizer_id, user_id) where status = 'pending' do nothing;
  return true;
end;
$$;

create or replace function public.review_organizer_claim(
  p_claim_id uuid, p_reviewer uuid, p_action text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  target public.organizers%rowtype;
  claimant_id uuid;
begin
  if p_action is null or p_action not in ('approve', 'reject') then return 'invalid'; end if;
  if not exists (
    select 1 from public.profiles where id = p_reviewer
      and role in ('admin', 'superadmin') and is_ghost is not true
  ) then return 'forbidden'; end if;

  select * into target from public.organizers
    where id = (select organizer_id from public.organizer_claims where id = p_claim_id)
    for update;
  if not found then return 'not_found'; end if;

  select user_id into claimant_id from public.organizer_claims
    where id = p_claim_id and status = 'pending' for update;
  if not found then return 'not_found'; end if;

  if p_action = 'approve' then
    if target.owner_id is not null then return 'already_owned'; end if;
    update public.organizers set owner_id = claimant_id, claim_requested_at = null, claim_requested_by = null
      where id = target.id;
    update public.organizer_claims
      set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
      where id = p_claim_id;
    update public.organizer_claims
      set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
      where organizer_id = target.id and status = 'pending';
    return 'approved';
  end if;

  update public.organizer_claims
    set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_claim_id;
  return 'rejected';
end;
$$;

revoke all on function public.submit_organizer_claim(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_organizer_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_organizer_claim(text, uuid, text, text) to service_role;
grant execute on function public.review_organizer_claim(uuid, uuid, text) to service_role;

-- Prevent the existing worker from sending any queued immediate emails.
update public.scheduled_notifications set status = 'cancelled'
where type = 'venue_claim_review'
  and status in ('pending', 'processing')
  and payload->'onlyChannels' = '["email"]'::jsonb;

-- Recover legacy requests that were actually saved. Many email-only requests
-- never got past the original organizer update policy.
insert into public.organizer_claims (organizer_id, user_id, created_at)
select o.id, o.claim_requested_by, o.claim_requested_at from public.organizers o
where o.owner_id is null and o.claim_requested_by is not null and o.claim_requested_at is not null
  and not exists (
    select 1 from public.organizer_claims c
    where c.organizer_id = o.id and c.user_id = o.claim_requested_by
  )
on conflict (organizer_id, user_id) where status = 'pending' do nothing;

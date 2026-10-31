begin;
-- Private delivery configuration and receipts; never expose addresses or payloads.
create table public.event_followup_settings (
  series_id uuid primary key references public.event_series(id) on delete cascade,
  enabled boolean not null default true,
  enabled_after timestamptz not null default now()
);
create table public.event_followup_deliveries (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','skipped','review')),
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0,
  payload jsonb,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  primary key(event_id,user_id)
);
alter table public.event_followup_settings enable row level security;
alter table public.event_followup_deliveries enable row level security;
revoke all on public.event_followup_settings,public.event_followup_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.event_followup_settings to service_role;
grant select,insert,update,delete on public.event_followup_deliveries to service_role;

-- New Social House occurrences only. No retrospective mail to past attendees.
insert into public.event_followup_settings(series_id)
values ('ad0a0c5e-f718-447c-89f1-6fa3b78e3c52');

create function public.claim_event_followups(p_token uuid,p_now timestamptz default now(),p_limit integer default 25)
returns setof public.event_followup_deliveries
language plpgsql security definer set search_path=public as $$
begin
  with attendees as (
    select event_id,user_id from rsvps where checked_in_at is not null
    union select event_id,user_id from event_arrival_participants where user_id is not null
  )
  insert into event_followup_deliveries(event_id,user_id)
  select e.id,p.id from events e
  join event_followup_settings s on s.series_id=e.series_id and s.enabled
  join attendees a on a.event_id=e.id
  join profiles p on p.id=a.user_id and not coalesce(p.is_ghost,false)
  left join notification_preferences np on np.user_id=p.id
  where e.status='published' and e.starts_at>=s.enabled_after
    and (e.tribe_id is null or e.tribe_visibility='public')
    and e.ends_at is not null and e.ends_at>p_now-interval '7 days'
    and ((date_trunc('day',e.ends_at at time zone 'Asia/Ho_Chi_Minh')+interval '1 day 9 hours') at time zone 'Asia/Ho_Chi_Minh')<=p_now
    and coalesce(np.email_enabled,true)
    and (np.channel_preferences->'post_event_followup' is null or np.channel_preferences->'post_event_followup' ? 'email')
    and (exists(select 1 from rsvps r where r.event_id=e.id and r.user_id=p.id and r.checked_in_at is not null)
      or exists(select 1 from event_arrival_participants a where a.event_id=e.id and a.user_id=p.id))
    and not exists(select 1 from rsvps r where r.event_id=e.id and r.user_id=p.id and (r.status='cancelled' or r.no_show_at is not null))
  on conflict(event_id,user_id) do nothing;

  -- Resend's deduplication window is 24h. Never retry an uncertain send later.
  update event_followup_deliveries set status='review',last_error='retry_window_expired',lease_token=null,lease_until=null
  where status in ('pending','sending') and first_attempt_at<p_now-interval '23 hours'
    and (lease_until is null or lease_until<p_now);

  return query with candidates as (
    select d.event_id,d.user_id from event_followup_deliveries d
    where d.status in ('pending','sending') and (d.lease_until is null or d.lease_until<p_now)
    order by d.event_id,d.user_id limit greatest(1,least(p_limit,25)) for update skip locked
  ) update event_followup_deliveries d set status='sending',lease_token=p_token,
      lease_until=p_now+interval '10 minutes',first_attempt_at=coalesce(d.first_attempt_at,p_now),attempts=d.attempts+1
    from candidates c where d.event_id=c.event_id and d.user_id=c.user_id returning d.*;
end;
$$;
revoke all on function public.claim_event_followups(uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.claim_event_followups(uuid,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;

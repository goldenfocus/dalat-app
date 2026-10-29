-- Internal provenance and retry ledger. No source filenames or diagnostics are public.
create table public.drive_photo_sync_state (
  source_id text primary key,
  lease_token uuid,
  lease_until timestamptz,
  next_scan_at timestamptz not null default now(),
  last_report jsonb,
  last_scan_at timestamptz
);
alter table public.drive_photo_sync_state enable row level security;
revoke all on public.drive_photo_sync_state from anon, authenticated;
grant select, insert, update on public.drive_photo_sync_state to service_role;

create table public.drive_photo_imports (
  source_id text not null references public.drive_photo_sync_state(source_id),
  file_id text not null,
  fingerprint text not null,
  source_path text[] not null,
  source_url text not null,
  event_id uuid references public.events(id) on delete set null,
  moment_id uuid references public.moments(id) on delete set null,
  status text not null check(status in ('imported','duplicate','held','failed')),
  reason text,
  checked_at timestamptz not null default now(),
  primary key (source_id, file_id)
);
alter table public.drive_photo_imports enable row level security;
revoke all on public.drive_photo_imports from anon, authenticated;
grant select, insert, update on public.drive_photo_imports to service_role;

insert into public.drive_photo_sync_state(source_id) values ('social-house-language-exchange');

create function public.claim_drive_photo_sync(p_source text, p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    update drive_photo_sync_state set lease_token=p_token, lease_until=now()+interval '10 minutes'
    where source_id=p_source and next_scan_at<=now() and (lease_until is null or lease_until<now())
    returning source_id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_drive_photo_sync(text,uuid) from public, anon, authenticated;
grant execute on function public.claim_drive_photo_sync(text,uuid) to service_role;
notify pgrst, 'reload schema';

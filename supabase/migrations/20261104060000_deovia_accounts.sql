-- Private identity links. App roles never read another product's auth identifiers.
create table if not exists public.deovia_account_links (
  peer_user_id uuid primary key,
  local_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.deovia_auth_grants (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  challenge text not null check (challenge ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '90 seconds')
);
create table if not exists public.deovia_pending_links (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  peer_user_id uuid not null,
  next_path text not null default '/',
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table public.deovia_account_links enable row level security;
alter table public.deovia_auth_grants enable row level security;
alter table public.deovia_pending_links enable row level security;
revoke all on public.deovia_account_links, public.deovia_auth_grants, public.deovia_pending_links from anon, authenticated;
grant all on public.deovia_account_links, public.deovia_auth_grants, public.deovia_pending_links to service_role;
create index if not exists deovia_grant_expiry on public.deovia_auth_grants(expires_at);
create index if not exists deovia_pending_expiry on public.deovia_pending_links(expires_at);
create or replace function public.deovia_consume_grant(p_hash text, p_challenge text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  delete from public.deovia_auth_grants where code_hash=p_hash and challenge=p_challenge and expires_at > now() returning user_id into result;
  delete from public.deovia_auth_grants where expires_at <= now();
  delete from public.deovia_pending_links where expires_at <= now();
  return result;
end $$;
create or replace function public.deovia_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email)=lower(p_email) limit 1;
$$;
revoke all on function public.deovia_consume_grant(text,text), public.deovia_user_by_email(text) from public, anon, authenticated;
grant execute on function public.deovia_consume_grant(text,text), public.deovia_user_by_email(text) to service_role;

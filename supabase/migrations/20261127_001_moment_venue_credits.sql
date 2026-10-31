-- Public credit without transferring ownership or exposing private Drive paths.
begin;
create table public.moment_venue_credits (
  moment_id uuid primary key references public.moments(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade
);
alter table public.moment_venue_credits enable row level security;
revoke all on public.moment_venue_credits from public, anon, authenticated;
grant select on public.moment_venue_credits to anon, authenticated;
grant select, insert, update, delete on public.moment_venue_credits to service_role;
create policy moment_credit_visible on public.moment_venue_credits for select
  using (exists (select 1 from public.moments m where m.id = moment_id and m.status = 'published'));

-- Only actual imports from this source, never a duplicate pointing at a user's photo.
insert into public.moment_venue_credits(moment_id, venue_id)
select distinct m.id, e.venue_id
from public.drive_photo_imports d
join public.moments m on m.id = d.moment_id and m.event_id = d.event_id
join public.events e on e.id = m.event_id
where d.source_id = 'social-house-language-exchange' and d.status = 'imported'
  and e.venue_id = '436f8b46-d5fe-41ef-8245-e8ffb9ee7980'
  and e.series_id = 'ad0a0c5e-f718-447c-89f1-6fa3b78e3c52'
  and m.media_url like '%/drive/' || m.id::text || '.jpg'
on conflict (moment_id) do nothing;
notify pgrst, 'reload schema';
commit;

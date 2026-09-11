begin;
create table public.phuong_idea_votes (
 user_id uuid not null references public.phuong_members(user_id),
 idea_id text not null check (idea_id in ('drink','photos','meet','bites','bingo','photo-challenge','language','local-tips','teams','music','name-tags','postcards','birthday','body-art')),
 rating text not null check (rating in ('up','down','unsure')),
 primary key (user_id,idea_id)
);
alter table public.phuong_idea_votes enable row level security;
revoke all on public.phuong_idea_votes from anon, authenticated;
grant select, insert, update on public.phuong_idea_votes to authenticated;
create policy "Participants read ideas" on public.phuong_idea_votes for select to authenticated using (exists(select 1 from public.phuong_members where user_id=(select auth.uid())));
create policy "Participants insert own vote" on public.phuong_idea_votes for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.phuong_members where user_id=(select auth.uid())));
create policy "Participants update own vote" on public.phuong_idea_votes for update to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.phuong_members where user_id=(select auth.uid()))) with check (user_id=(select auth.uid()) and exists(select 1 from public.phuong_members where user_id=(select auth.uid())));
commit;

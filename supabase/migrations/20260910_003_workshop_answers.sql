-- Private, attributed workshop answers. No public or cross-account read access.
create table if not exists public.workshop_answers (
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  question_id smallint not null check (question_id between 1 and 6),
  content text not null check (char_length(content) <= 6000),
  updated_at timestamptz not null default now(),
  primary key (author_id, question_id)
);
alter table public.workshop_answers enable row level security;
revoke all on public.workshop_answers from anon;
grant select, insert, update, delete on public.workshop_answers to authenticated;
create policy "Authors read their workshop answers" on public.workshop_answers
  for select to authenticated using ((select auth.uid()) = author_id);
create policy "Authors create their workshop answers" on public.workshop_answers
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Authors edit their workshop answers" on public.workshop_answers
  for update to authenticated using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);
create policy "Authors delete their workshop answers" on public.workshop_answers
  for delete to authenticated using ((select auth.uid()) = author_id);
comment on table public.workshop_answers is 'Phuong workshop answers. Author-private until participants explicitly confirm sharing.';

-- Supabase default privileges include TRUNCATE, which is not subject to RLS.
-- Explicitly limit authenticated users to row-level operations only.
revoke all on public.workshop_answers from authenticated;
grant select, insert, update, delete on public.workshop_answers to authenticated;

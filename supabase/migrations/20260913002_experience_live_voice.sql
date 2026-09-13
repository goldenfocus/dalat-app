begin;
alter table public.experience_sources add column if not exists live_conversation jsonb not null default '[]'::jsonb;
alter table public.experience_media add column if not exists capture_mode text not null default 'record' check(capture_mode in ('record','live'));
-- Append immutable turn IDs under a row lock; retries cannot duplicate evidence.
create or replace function public.append_experience_live_turns(p_id uuid, p_turns jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare existing jsonb; item jsonb;
begin
 select live_conversation into existing from experience_sources where experience_id=p_id for update;
 if existing is null then raise exception 'Missing source'; end if;
 for item in select value from jsonb_array_elements(p_turns) loop
  if not exists(select 1 from jsonb_array_elements(existing) t where t->>'id'=item->>'id') then
   existing := existing || jsonb_build_array(item);
  end if;
 end loop;
 if jsonb_array_length(existing)>200 or octet_length(existing::text)>250000 then raise exception 'Conversation limit'; end if;
 update experience_sources set live_conversation=existing where experience_id=p_id;
end $$;
revoke all on function public.append_experience_live_turns(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.append_experience_live_turns(uuid,jsonb) to service_role;
commit;

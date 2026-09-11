begin;
create table public.phuong_members (
 user_id uuid primary key references auth.users(id),
 role text not null check (role in ('phuong','zan')) unique
);
insert into public.phuong_members(user_id,role) values ('36bdd750-ab6a-4a02-96dd-afd8d6661d29','phuong');
insert into public.phuong_members(user_id,role) values ('303f96f6-0501-465c-9ee5-96e6136bb8bb','zan');
create table public.phuong_plan (
 id boolean primary key default true check(id),
 content jsonb not null default '{}', version integer not null default 0,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
insert into public.phuong_plan(id) values(true);
create table public.phuong_actions (
 id uuid primary key, author_id uuid not null references auth.users(id),
 kind text not null check(kind in ('decision','baseline','brief','results','message')),
 content jsonb not null, created_at timestamptz not null default now()
);
alter table public.phuong_members enable row level security;
alter table public.phuong_plan enable row level security;
alter table public.phuong_actions enable row level security;
revoke all on public.phuong_members, public.phuong_plan, public.phuong_actions from anon, authenticated;
grant select on public.phuong_members, public.phuong_plan, public.phuong_actions to authenticated;
create policy "Read own membership" on public.phuong_members for select to authenticated using(user_id=(select auth.uid()));
create policy "Members read plan" on public.phuong_plan for select to authenticated using(exists(select 1 from public.phuong_members where user_id=(select auth.uid())));
create policy "Members read actions" on public.phuong_actions for select to authenticated using(exists(select 1 from public.phuong_members where user_id=(select auth.uid())));
create function public.submit_phuong_action(p_id uuid,p_kind text,p_content jsonb,p_version integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_role text; v_version integer; v_zan uuid;
begin
 select role into v_role from phuong_members where user_id=auth.uid();
 if v_role is null then raise exception 'Not a participant' using errcode='42501'; end if;
 if p_kind not in ('decision','baseline','brief','results','message') or octet_length(p_content::text)>50000 then raise exception 'Invalid submission'; end if;
 select version into v_version from phuong_plan where id=true for update;
 if exists(select 1 from phuong_actions where id=p_id and author_id=auth.uid()) then return v_version; end if;
 if p_kind <> 'message' then
  if v_role <> 'phuong' then raise exception 'Only Phuong edits this plan' using errcode='42501'; end if;
  if p_version <> v_version then raise exception 'Version conflict' using errcode='40001'; end if;
  update phuong_plan set content=p_content, version=version+1,updated_by=auth.uid(),updated_at=now() where id=true returning version into v_version;
 end if;
 insert into phuong_actions(id,author_id,kind,content) values(p_id,auth.uid(),p_kind,p_content);
 select user_id into v_zan from phuong_members where role='zan';
 if v_zan is not null and v_zan<>auth.uid() then
  insert into notifications(user_id,type,title,body,primary_action_url,primary_action_label,metadata)
  values(v_zan,'collaboration_update','Phương × Dalat.app',
   case p_kind when 'message' then 'Phương sent you a private message.' when 'decision' then 'Phương saved her experiment decision.' when 'baseline' then 'Phương shared the venue baseline.' when 'brief' then 'Phương saved the event brief.' else 'Phương shared experiment results.' end,
   'https://phuong.dalat.app','Open private planner',jsonb_build_object('action_id',p_id));
 end if;
 return v_version;
end $$;
revoke all on function public.submit_phuong_action(uuid,text,jsonb,integer) from public;
grant execute on function public.submit_phuong_action(uuid,text,jsonb,integer) to authenticated;
commit;

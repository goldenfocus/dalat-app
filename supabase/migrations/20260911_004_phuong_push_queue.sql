begin;
-- Reuse the established five-minute notification worker. The existing RPC
-- already creates the in-app row; this queues PUSH ONLY in the same transaction.
create function public.queue_phuong_push() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_zan uuid;
begin
 if not exists(select 1 from phuong_members where user_id=new.author_id and role='phuong') then return new; end if;
 select user_id into v_zan from phuong_members where role='zan';
 if v_zan is not null then
  insert into scheduled_notifications(id,user_id,type,scheduled_for,payload,reference_type,reference_id)
  values(new.id,v_zan,'collaboration_update',now(),
   jsonb_build_object('type','collaboration_update','userId',v_zan,'locale','en','actionId',new.id,'onlyChannels',jsonb_build_array('push')),
   'phuong_action',new.id) on conflict(id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.queue_phuong_push() from public;
create trigger phuong_action_push after insert on public.phuong_actions
for each row execute function public.queue_phuong_push();
commit;

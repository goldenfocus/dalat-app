-- Reconnect only after both accounts have been authenticated and the member
-- confirms the pair. Replace links, never auth users or application data.
create or replace function public.deovia_reconnect(p_local_id uuid, p_peer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.deovia_account_links where local_user_id=p_local_id or peer_user_id=p_peer_id;
  insert into public.deovia_account_links(local_user_id,peer_user_id) values (p_local_id,p_peer_id);
end $$;
revoke all on function public.deovia_reconnect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.deovia_reconnect(uuid,uuid) to service_role;

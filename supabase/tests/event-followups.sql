-- Run after the migration. All fixtures and changes roll back; no mail is sent.
begin;
do $$
declare
  v_event uuid := gen_random_uuid();
  v_users uuid[];
  v_start timestamptz := date_trunc('day',now())+interval '2 days 11 hours';
  v_due timestamptz;
  v_count int;
begin
  select array_agg(id) into v_users from (
    select p.id from profiles p join auth.users u on u.id=p.id
    where not coalesce(p.is_ghost,false) and u.email_confirmed_at is not null
      and u.email not like '%@dalat.app' order by p.created_at limit 4
  ) p;
  if array_length(v_users,1)<4 then raise exception 'Need four existing real profiles for rollback-only fixture'; end if;
  insert into events(id,slug,title,starts_at,ends_at,created_by,series_id,status)
  values(v_event,'followup-test-'||v_event,'Follow-up rollback fixture',v_start,v_start+interval '2 hours',v_users[1],
    'ad0a0c5e-f718-447c-89f1-6fa3b78e3c52','published');
  insert into rsvps(event_id,user_id,status,checked_in_at,no_show_at) values
    (v_event,v_users[1],'going',v_start,null),
    (v_event,v_users[2],'going',null,null),
    (v_event,v_users[3],'going',v_start,v_start),
    (v_event,v_users[4],'going',v_start,null)
  on conflict(event_id,user_id) do update set status=excluded.status,checked_in_at=excluded.checked_in_at,no_show_at=excluded.no_show_at;
  insert into notification_preferences(user_id,email_enabled,channel_preferences)
  values(v_users[1],true,'{}'),(v_users[4],false,'{}')
  on conflict(user_id) do update set email_enabled=excluded.email_enabled,channel_preferences=excluded.channel_preferences;
  v_due := ((date_trunc('day',(v_start+interval '2 hours') at time zone 'Asia/Ho_Chi_Minh')+interval '1 day 9 hours') at time zone 'Asia/Ho_Chi_Minh');
  perform claim_event_followups(gen_random_uuid(),v_due-interval '1 minute',25);
  if exists(select 1 from event_followup_deliveries where event_id=v_event) then raise exception 'Sent before morning'; end if;
  perform claim_event_followups(gen_random_uuid(),v_due,25);
  select count(*) into v_count from event_followup_deliveries where event_id=v_event;
  if v_count<>1 then raise exception 'Attendance or opt-out filter failed: %',v_count; end if;
  if not exists(select 1 from event_followup_deliveries where event_id=v_event and user_id=v_users[1] and attempts=1) then raise exception 'Wrong attendee'; end if;
  perform claim_event_followups(gen_random_uuid(),v_due+interval '1 minute',25);
  if exists(select 1 from event_followup_deliveries where event_id=v_event and attempts<>1) then raise exception 'Concurrent reclaim'; end if;
  perform claim_event_followups(gen_random_uuid(),v_due+interval '11 minutes',25);
  if not exists(select 1 from event_followup_deliveries where event_id=v_event and attempts=2) then raise exception 'Lease recovery failed'; end if;
  perform claim_event_followups(gen_random_uuid(),v_due+interval '24 hours',25);
  if not exists(select 1 from event_followup_deliveries where event_id=v_event and status='review') then raise exception 'Unsafe late retry'; end if;
  if has_table_privilege('anon','public.event_followup_deliveries','SELECT') or has_table_privilege('authenticated','public.event_followup_deliveries','SELECT') then raise exception 'Private receipts exposed'; end if;
end;
$$;
rollback;

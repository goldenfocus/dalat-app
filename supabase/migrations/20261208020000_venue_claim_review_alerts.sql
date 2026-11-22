alter type public.notification_type add value if not exists 'venue_claim_review';

create function public.queue_venue_claim_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scheduled_notifications (
    user_id, type, scheduled_for, payload, reference_type, reference_id
  )
  select
    reviewer.id,
    'venue_claim_review',
    now(),
    jsonb_build_object(
      'type', 'venue_claim_review',
      'userId', reviewer.id,
      'locale', coalesce(reviewer.locale, 'en'),
      'claimId', new.id,
      'venueName', venue.name,
      'onlyChannels', jsonb_build_array(delivery.channel)
    ),
    'venue_claim',
    new.id
  from public.venues as venue
  cross join public.profiles as reviewer
  cross join (values ('in_app'), ('email')) as delivery(channel)
  where venue.id = new.venue_id
    and reviewer.role in ('admin', 'superadmin')
    and reviewer.is_ghost is not true
    and reviewer.id <> new.user_id;

  return new;
end;
$$;

revoke all on function public.queue_venue_claim_review() from public, anon, authenticated;

create trigger queue_venue_claim_review
after insert on public.venue_claims
for each row
when (new.status = 'pending')
execute function public.queue_venue_claim_review();

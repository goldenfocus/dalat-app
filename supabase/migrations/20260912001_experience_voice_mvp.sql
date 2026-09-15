begin;
-- September 12, 2026: additive experience model. No existing Moment/Venue is rewritten.
create table public.experiences (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id),
 status text not null default 'draft' check(status in ('draft','published')),
 title text not null default '', narrative text not null default '', summary text not null default '',
 venue_id uuid references public.venues(id), venue_name text not null default '', venue_address text not null default '',
 venue_confirmed boolean not null default false, visit_date date not null default current_date,
 category text not null default 'food' check(category in ('food','coffee','outdoors','culture','stay','other')),
 tags text[] not null default '{}', original_language text not null default 'en',
 observations jsonb not null default '[]', photos jsonb not null default '[]', selected_media uuid[] not null default '{}',
 permission_confirmed boolean not null default false, sponsorship text not null default '',
 published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint publish_review check(status <> 'published' or (length(trim(title)) > 0 and length(trim(narrative)) >= 40 and venue_confirmed and permission_confirmed and cardinality(selected_media)>0))
);
create index experiences_author on public.experiences(author_id, created_at desc);
create index experiences_venue on public.experiences(venue_id) where status='published';
create index experiences_category on public.experiences(category,published_at desc) where status='published';
create table public.experience_sources (
 experience_id uuid primary key references public.experiences(id) on delete cascade,
 transcribed_audio_ids uuid[] not null default '{}', notes text not null default '', transcript text not null default '', optional_question text not null default '',
 generation jsonb, ai_started_at timestamptz, ai_attempts integer not null default 0
);
create table public.experience_media (
 id uuid primary key, experience_id uuid not null references public.experiences(id) on delete cascade,
 path text not null unique, preview_path text, kind text not null check(kind in ('photo','audio')),
 mime text not null, created_at timestamptz not null default now()
);
create table public.experience_venue_submissions (
 experience_id uuid primary key references public.experiences(id) on delete cascade,
 name text not null, address text not null, status text not null default 'pending' check(status in ('pending','resolved')),
 created_at timestamptz not null default now()
);
alter table public.experiences enable row level security;
alter table public.experience_sources enable row level security;
alter table public.experience_media enable row level security;
alter table public.experience_venue_submissions enable row level security;
create policy experiences_read on public.experiences for select using(status='published' or author_id=auth.uid());
create policy experiences_create on public.experiences for insert to authenticated with check(author_id=auth.uid() and status='draft');
-- Mutations run through validated, authenticated server routes. Clients cannot bypass publication gates.
create policy sources_read on public.experience_sources for select to authenticated using(exists(select 1 from public.experiences e where e.id=experience_id and e.author_id=auth.uid()));
create policy media_read on public.experience_media for select using(exists(select 1 from public.experiences e where e.id=experience_id and (e.author_id=auth.uid() or (e.status='published' and kind='photo' and experience_media.id=any(e.selected_media)))));
create policy submissions_read on public.experience_venue_submissions for select to authenticated using(exists(select 1 from public.experiences e where e.id=experience_id and e.author_id=auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('experience-originals','experience-originals',false,20971520,array['image/jpeg','image/png','image/webp','image/heic','image/heif','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/mpeg']);
create policy experience_upload on storage.objects for insert to authenticated with check(bucket_id='experience-originals' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.experiences e where e.id::text=(storage.foldername(name))[2] and e.author_id=auth.uid() and e.status='draft'));
create policy experience_original_owner on storage.objects for select to authenticated using(bucket_id='experience-originals' and (storage.foldername(name))[1]=auth.uid()::text);
-- Atomic lease prevents duplicate billable calls, with a bounded retry allowance per draft.
create function public.claim_experience_ai(p_id uuid) returns boolean language sql security definer set search_path=public as $$
 with claimed as (update experience_sources set ai_started_at=now(),ai_attempts=ai_attempts+1 where experience_id=p_id and ai_attempts<12 and (ai_started_at is null or ai_started_at<now()-interval '3 minutes') returning 1) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_experience_ai(uuid) from public, anon, authenticated;
grant execute on function public.claim_experience_ai(uuid) to service_role;

commit;

-- Additive, read-only topic discovery. Original experiences remain unchanged.
-- SECURITY INVOKER retains caller RLS; unpublished accounts never become results.
begin;
create or replace function public.normalize_experience_topic(value text)
returns text language sql immutable strict parallel safe
set search_path = '' as $$
  select trim(regexp_replace(regexp_replace(lower(value), '^#+', ''), '[-_[:space:]]+', ' ', 'g'));
$$;
create or replace function public.experiences_by_topic(
  p_terms text[], p_category text default null, p_offset integer default 0
) returns setof public.experiences
language sql stable security invoker set search_path = '' as $$
  select e.* from public.experiences e
  where e.status = 'published'
    and (p_category is null or e.category = p_category)
    and cardinality(p_terms) between 1 and 12
    and exists (
      select 1 from (
        select public.normalize_experience_topic(t) as term from unnest(e.tags) t
        union all
        select public.normalize_experience_topic(part)
        from jsonb_array_elements(e.observations) o,
          lateral regexp_split_to_table(o->>'value', ',\s*|;\s*| / | and | và | et ', 'i') part
        where o->>'source_type' in ('firsthand', 'impression')
      ) evidence where evidence.term = any(p_terms)
    )
  order by e.published_at desc, e.id
  limit 25 offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;
revoke all on function public.experiences_by_topic(text[], text, integer) from public;
grant execute on function public.experiences_by_topic(text[], text, integer) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- 20261113 added the composite (section_id, venue_id) FK; keeping the old
-- single-column section_id FK as well gives PostgREST two relationships
-- between venue_menu_sections and venue_menu_items, so every embedded
-- `venue_menu_items(...)` select fails with PGRST201. The composite FK
-- already guarantees the section exists.
alter table public.venue_menu_items drop constraint if exists venue_menu_items_section_id_fkey;
notify pgrst, 'reload schema';

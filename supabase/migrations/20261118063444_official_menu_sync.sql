BEGIN;
ALTER TABLE public.venue_menu_items ADD COLUMN IF NOT EXISTS source_key text;
ALTER TABLE public.venue_menu_items ADD COLUMN IF NOT EXISTS source_snapshot jsonb;
ALTER TABLE public.venue_menu_sections ADD COLUMN IF NOT EXISTS source_snapshot jsonb;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS menu_source_checked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS venue_menu_source_key ON public.venue_menu_items(venue_id, source_key) WHERE source_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_official_venue_menu(p_venue_id uuid, p_sections jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  section jsonb; item jsonb; section_row public.venue_menu_sections%ROWTYPE;
  item_row public.venue_menu_items%ROWTYPE; source_keys text[] := '{}';
  item_sort integer; item_count integer := 0; first_sync boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.venues WHERE id=p_venue_id AND slug='social-house-dalat') THEN
    RAISE EXCEPTION 'Unsupported menu source';
  END IF;
  IF jsonb_typeof(p_sections) <> 'array' OR jsonb_array_length(p_sections) < 5 THEN RAISE EXCEPTION 'Incomplete menu'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_venue_id::text || ':menu', 0));
  SELECT menu_source_checked_at IS NULL INTO first_sync FROM public.venues WHERE id=p_venue_id;

  FOR section IN SELECT value FROM jsonb_array_elements(p_sections) LOOP
    SELECT * INTO section_row FROM public.venue_menu_sections WHERE venue_id=p_venue_id AND slug=section->>'slug';
    IF NOT FOUND THEN
      INSERT INTO public.venue_menu_sections(venue_id,slug,title,note,sort,source_snapshot)
      VALUES(p_venue_id,section->>'slug',section->>'title',section->>'note',(section->>'sort')::integer,section - 'items') RETURNING * INTO section_row;
    ELSE
      UPDATE public.venue_menu_sections SET
        title=CASE WHEN source_snapshot IS NULL OR title=source_snapshot->>'title' THEN section->>'title' ELSE title END,
        note=CASE WHEN source_snapshot IS NULL OR note IS NOT DISTINCT FROM source_snapshot->>'note' THEN section->>'note' ELSE note END,
        source_snapshot=section - 'items'
      WHERE id=section_row.id;
    END IF;
    item_sort := 0;
    FOR item IN SELECT value FROM jsonb_array_elements(section->'items') LOOP
      IF (item->>'price')::integer < 1000 OR coalesce(item->>'key','')='' THEN RAISE EXCEPTION 'Invalid menu item'; END IF;
      source_keys := array_append(source_keys,item->>'key');
      SELECT * INTO item_row FROM public.venue_menu_items WHERE venue_id=p_venue_id AND
        (source_key=item->>'key' OR (source_key IS NULL AND section_id=section_row.id AND name IN(item->>'previousName',item->>'name')))
        ORDER BY source_key NULLS LAST,id LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO public.venue_menu_items(venue_id,section_id,name,description,price_vnd,option_groups,tags,sort,source_key,source_snapshot)
        VALUES(p_venue_id,section_row.id,item->>'name',item->>'description',(item->>'price')::integer,item->'option_groups',
          ARRAY(SELECT jsonb_array_elements_text(item->'tags')),item_sort,item->>'key',item);
      ELSE
        UPDATE public.venue_menu_items SET
          name=CASE WHEN source_snapshot IS NULL OR name=source_snapshot->>'name' THEN item->>'name' ELSE name END,
          description=CASE WHEN source_snapshot IS NULL OR description IS NOT DISTINCT FROM source_snapshot->>'description' THEN item->>'description' ELSE description END,
          price_vnd=CASE WHEN source_snapshot IS NULL OR price_vnd=(source_snapshot->>'price')::integer THEN (item->>'price')::integer ELSE price_vnd END,
          option_groups=CASE WHEN source_snapshot IS NULL OR option_groups=source_snapshot->'option_groups' THEN item->'option_groups' ELSE option_groups END,
          source_key=item->>'key', source_snapshot=item
        WHERE id=item_row.id;
      END IF;
      item_sort := item_sort + 10;
      item_count := item_count + 1;
    END LOOP;
  END LOOP;
  IF item_count < 35 OR item_count <> cardinality(ARRAY(SELECT DISTINCT unnest(source_keys))) THEN RAISE EXCEPTION 'Incomplete or duplicate menu'; END IF;
  -- Keep receipts and IDs intact. Removed source dishes disappear from new orders.
  UPDATE public.venue_menu_items SET is_available=false
  WHERE venue_id=p_venue_id AND source_key IS NOT NULL AND NOT(source_key=ANY(source_keys));
  -- Retire only known seed leftovers on the initial connection; custom event drinks stay.
  IF first_sync THEN
    UPDATE public.venue_menu_items SET is_available=false WHERE venue_id=p_venue_id AND source_key IS NULL
      AND name IN('Cold Brew Cold Foam','Matcha Cloud Latte','Fresh Lemon','Pancake Tacos','Chicken Soup','Mushroom Soup');
    UPDATE public.venue_menu_sections SET is_visible=false WHERE venue_id=p_venue_id AND slug='mama-noodle-soup';
  END IF;
  UPDATE public.venues SET menu_source_checked_at=now() WHERE id=p_venue_id;
  RETURN jsonb_build_object('items',item_count,'sections',jsonb_array_length(p_sections));
END;
$$;
REVOKE ALL ON FUNCTION public.sync_official_venue_menu(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_official_venue_menu(uuid,jsonb) TO service_role;
COMMIT;

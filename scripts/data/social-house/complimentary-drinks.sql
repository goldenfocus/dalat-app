-- Set these to owner-authorized prices in the same transaction before running:
-- SET LOCAL dalat.lime_water_vnd = '...';
-- SET LOCAL dalat.ginger_tea_vnd = '...';
-- SET LOCAL dalat.iced_coffee_vnd = '...';
-- Owner requested the cheapest menu price for lime/ginger, and the Black Coffee price for chilled coffee.
-- No fallback prices: missing configuration aborts rather than misstates the bill.
DO $$
DECLARE
 venue constant uuid := '436f8b46-d5fe-41ef-8245-e8ffb9ee7980';
 series uuid;
 section constant uuid := '97f9fa2a-6731-47e9-8772-b665e46f8570';
 prices integer[] := ARRAY[current_setting('dalat.lime_water_vnd')::integer,current_setting('dalat.ginger_tea_vnd')::integer,current_setting('dalat.iced_coffee_vnd')::integer];
BEGIN
 SELECT id INTO STRICT series FROM event_series WHERE slug='language-exchange-social-house-z8oc';
 IF EXISTS(SELECT 1 FROM unnest(prices) price WHERE price<=0 OR price>1000000) THEN RAISE EXCEPTION 'Owner-authorized positive prices are required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM series_drink_sponsors WHERE series_id=series) THEN RAISE EXCEPTION 'Missing Social House series sponsor'; END IF;
 -- Future occurrences inherit only this dedicated section. Existing overrides stay explicit.
 DELETE FROM series_sponsored_drink_sections WHERE series_id=series;
 INSERT INTO venue_menu_sections(id,venue_id,slug,title,sort,is_visible)
 VALUES(section,venue,'language-exchange-drinks','Language exchange drinks',-1,true)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO series_sponsored_drink_sections(series_id,section_id) VALUES(series,section);
 INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd,sort,is_available)
 VALUES
 ('906b110b-d267-4351-84a7-bb3326b3efc0',venue,section,'Lime water',prices[1],0,true),
 ('14cd5a6e-d90c-4b70-a7b5-f990a2791a83',venue,section,'Ginger tea',prices[2],1,true),
 ('1be61b29-8e77-4c0e-b5d5-b85a3cdce08e',venue,section,'Iced coffee',prices[3],2,true)
 ON CONFLICT(id) DO NOTHING;
 UPDATE venue_menu_items SET description='Black coffee, served chilled.'
 WHERE id='1be61b29-8e77-4c0e-b5d5-b85a3cdce08e' AND description IS NULL;
 -- Lock current/future inherited campaigns; preserve every historic order and override.
 PERFORM c.event_id FROM event_drink_sponsors c JOIN events e ON e.id=c.event_id
 WHERE e.series_id=series AND c.ends_at>=now() AND NOT c.menu_override
 ORDER BY c.event_id FOR UPDATE OF c;
 DELETE FROM event_sponsored_drinks d USING events e,event_drink_sponsors c
 WHERE e.id=d.event_id AND c.event_id=e.id AND e.series_id=series
 AND c.ends_at>=now() AND NOT c.menu_override;
 INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
 SELECT e.id,i.id FROM events e JOIN event_drink_sponsors c ON c.event_id=e.id
 CROSS JOIN venue_menu_items i WHERE e.series_id=series AND c.ends_at>=now()
 AND NOT c.menu_override AND i.section_id=section AND i.venue_id=e.venue_id
 ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM event_drink_sponsors c JOIN events e ON e.id=c.event_id
 WHERE e.series_id=series AND c.ends_at>=now() AND NOT c.menu_override
 AND (SELECT count(*) FROM event_sponsored_drinks d WHERE d.event_id=e.id)<>3) THEN
  RAISE EXCEPTION 'Expected exactly three complimentary drinks';
 END IF;
END $$;

-- Disposable historical records written before the cutoff migration exists.
INSERT INTO auth.users(id) VALUES('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002');
INSERT INTO profiles(id,username) VALUES('d1000000-0000-4000-8000-000000000001','cutoff_early'),('d1000000-0000-4000-8000-000000000002','cutoff_late');
INSERT INTO venues(id,owner_id,preorder_enabled) VALUES('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',true);
INSERT INTO event_series(id,slug,arrival_enabled) VALUES('d3000000-0000-4000-8000-000000000001','language-exchange-social-house-z8oc',true);
INSERT INTO series_drink_sponsors(series_id,sponsor_name,rsvp_limit) VALUES('d3000000-0000-4000-8000-000000000001','EZViet',100);
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','coffee','Coffee');
INSERT INTO series_sponsored_drink_sections(series_id,section_id) VALUES('d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Coffee',40000);
INSERT INTO events(id,series_id,venue_id,created_by,status,starts_at,ends_at,arrival_enabled) VALUES('d6000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','published',((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+time '18:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',now()+interval '12 hours',true);
INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','going',((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+time '15:59:59') AT TIME ZONE 'Asia/Ho_Chi_Minh'),
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','going',((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+time '16:00:01') AT TIME ZONE 'Asia/Ho_Chi_Minh');
INSERT INTO event_preorders(id,event_id,venue_id,user_id,status,total_vnd,sponsored_vnd,sponsor_status,sponsor_item_id,is_reservation) VALUES
 ('d7000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','pending',40000,40000,'reserved','d5000000-0000-4000-8000-000000000001',true),
 ('d7000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','pending',40000,40000,'reserved','d5000000-0000-4000-8000-000000000001',true);

INSERT INTO event_arrival_requests(event_id,request_id,identity_key,payload_hash,receipt) VALUES('d6000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000009','fixture','fixture','{"order":{"id":"d7000000-0000-4000-8000-000000000002","status":"pending","items":[]}}');

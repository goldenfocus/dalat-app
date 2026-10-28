-- Disposable pre-migration fixture, deleted by arrival-opt-in.sql below.
INSERT INTO event_series(id,slug) VALUES
 ('91000000-0000-4000-8000-000000000001','language-exchange-social-house-z8oc'),
 ('91000000-0000-4000-8000-000000000002','language-exchange-social-house-z8oc-unrelated');
INSERT INTO events(id,series_id,status,starts_at,ends_at) VALUES
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','published',now()+interval '1 day',now()+interval '1 day 2 hours'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','published',now()-interval '1 hour',now()+interval '1 hour'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','published',now()-interval '3 days',now()-interval '2 days'),
 ('92000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002','published',now()+interval '1 day',now()+interval '2 days'),
 ('92000000-0000-4000-8000-000000000005',NULL,'published',now()+interval '1 day',now()+interval '2 days');

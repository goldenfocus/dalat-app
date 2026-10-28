#!/usr/bin/env bash
# Never reads .env or connects to hosted data. Disposable local Docker PostgreSQL.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="dalat-arrival-test-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:15 >/dev/null
ready=false
for ((i=0;i<60;i++)); do
 if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 0.2
done
if [[ "$ready" != true ]]; then echo 'PostgreSQL did not start' >&2; exit 1; fi
for file in supabase/tests/arrival-bootstrap.sql \
 supabase/migrations/20261112_001_venue_menu_preorders.sql \
 supabase/migrations/20261113_001_venue_menu_preorders_hardening.sql \
 supabase/migrations/20261121_001_event_arrival.sql \
 supabase/tests/arrival-security.sql; do
 docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$repo_root/$file"
done
# Exact launch-series backfill is exercised with rows that predate the new migration.
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/arrival-opt-in-fixture.sql"
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/migrations/20261122_001_event_arrival_opt_in.sql"
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/arrival-opt-in.sql"
# Independent sessions contend on one request. Both must receive the same receipt.
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id) VALUES('81000000-0000-4000-8000-000000000001');
INSERT INTO profiles(id,username) VALUES('81000000-0000-4000-8000-000000000001','arrival_concurrent');
INSERT INTO venues(id,owner_id) VALUES('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001');
INSERT INTO events(id,created_by,venue_id,status,starts_at,ends_at) VALUES('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','published',now(),now()+interval '2 hours');
SQL
docker exec -i -e PGAPPNAME=arrival-concurrent-first "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('83000000-0000-4000-8000-000000000001'||'86000000-0000-4000-8000-000000000001',0));
SELECT pg_sleep(1);
SELECT arrival_submit('83000000-0000-4000-8000-000000000001',NULL,repeat('9',64),'86000000-0000-4000-8000-000000000001','{"nickname":"Concurrent","practiceLanguage":"both"}');
COMMIT;
SQL
first_pid=$!
started=false
for ((i=0;i<50;i++)); do
 if [[ "$(docker exec "$container" psql -X -At -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='arrival-concurrent-first' AND wait_event='PgSleep'")" == 1 ]]; then started=true; break; fi
 sleep 0.02
done
if [[ "$started" != true ]]; then echo 'Concurrent request did not start' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
SELECT arrival_submit('83000000-0000-4000-8000-000000000001',NULL,repeat('9',64),'86000000-0000-4000-8000-000000000001','{"nickname":"Concurrent","practiceLanguage":"both"}');
SQL
wait "$first_pid"
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM event_arrival_participants)<>1 OR (SELECT count(*) FROM event_arrival_requests)<>1 THEN RAISE EXCEPTION 'Concurrent retry duplicated participant or receipt'; END IF;
END $$;
SQL
# Different staff requests for one participant serialize on participant identity.
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id) VALUES('81000000-0000-4000-8000-000000000002');
INSERT INTO profiles(id,username) VALUES('81000000-0000-4000-8000-000000000002','arrival_staff_2');
INSERT INTO event_staff(event_id,user_id,role) VALUES('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','orders');
UPDATE venues SET preorder_enabled=true;
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','drinks','Drinks');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','Coffee',35000);
SQL
docker exec -i -e PGAPPNAME=arrival-staff-first "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('83000000-0000-4000-8000-000000000001'||id::text,1)) FROM event_arrival_participants;
SELECT pg_sleep(1);
SELECT arrival_submit('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',repeat('8',64),'86000000-0000-4000-8000-000000000002',jsonb_build_object('staffEntry',true,'participantId',id,'nickname','Concurrent','practiceLanguage','both','items','[{"item_id":"85000000-0000-4000-8000-000000000001","qty":1}]'::jsonb)) FROM event_arrival_participants;
COMMIT;
SQL
first_pid=$!
started=false
for ((i=0;i<50;i++)); do
 if [[ "$(docker exec "$container" psql -X -At -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='arrival-staff-first' AND wait_event='PgSleep'")" == 1 ]]; then started=true; break; fi
 sleep 0.02
done
if [[ "$started" != true ]]; then echo 'Concurrent staff request did not start' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
SELECT arrival_submit('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',repeat('7',64),'86000000-0000-4000-8000-000000000003',jsonb_build_object('staffEntry',true,'participantId',id,'nickname','Concurrent','practiceLanguage','both','items','[{"item_id":"85000000-0000-4000-8000-000000000001","qty":1}]'::jsonb)) FROM event_arrival_participants;
SQL
wait "$first_pid"
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM event_preorders)<>1 OR (SELECT count(*) FROM event_arrival_requests)<>3 THEN RAISE EXCEPTION 'Concurrent staff orders duplicated active orders'; END IF;
END $$;
SQL
echo 'Event arrival PostgreSQL authorization, idempotency, tampering and legacy preorder tests passed.'

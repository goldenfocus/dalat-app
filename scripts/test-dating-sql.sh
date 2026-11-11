#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="dalat-dating-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:15 >/dev/null
for i in {1..40}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 0.25; done
for file in supabase/tests/people-bootstrap.sql; do docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$file"; done
sed '1d' supabase/tests/dating-bootstrap.sql | docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1
for file in supabase/migrations/20261201010000_private_dating.sql supabase/migrations/20261201020000_activity_privacy_functions.sql supabase/tests/dating-security.sql; do
 docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$file"
done
echo 'Dating SQL authorization, messaging, age boundaries, privacy and moderation passed.'
# A send racing a pass must wait, then reject after the pass commits.
docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.dating_suspensions;
UPDATE public.dating_profiles SET enabled=true,min_age=18,max_age=100;
DELETE FROM public.dating_actions;
INSERT INTO public.dating_actions(actor_id,target_id,action) VALUES
('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000003','like'),
('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000001','like');
SQL
docker exec -i -e PGAPPNAME=dating-pass-lock "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000001',false);
SELECT public.dating_act('79000000-0000-4000-8000-000000000003','pass',true);
SELECT pg_sleep(2);
COMMIT;
SQL
pass_pid=$!
for i in {1..100}; do
 if [[ "$(docker exec "$container" psql -X -At -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='dating-pass-lock' AND wait_event='PgSleep'")" == 1 ]]; then break; fi
 sleep 0.02
done
if docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1 >"/tmp/dating-race-$$.log" 2>&1 <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000003',false);
SELECT public.dating_send_message('79000000-0000-4000-8000-000000000001','must not send');
SQL
then echo 'FAIL: message crossed a committed pass'; exit 1; fi
wait "$pass_pid"
rg -q 'unavailable' "/tmp/dating-race-$$.log"
rm "/tmp/dating-race-$$.log"
echo 'Concurrent pass/send serialization passed.'

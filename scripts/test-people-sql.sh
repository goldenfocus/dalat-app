#!/usr/bin/env bash
# Isolated PostgreSQL security test: never reads .env or connects to Supabase.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin="${PG_BIN:-$(pg_config --bindir)}"
sql_tmp="$(mktemp -d /tmp/dalat-people-sql.XXXXXX)"
cleanup() {
  "$pg_bin/pg_ctl" -D "$sql_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$sql_tmp"
}
trap cleanup EXIT
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGPASSWORD PGOPTIONS
unset PGTARGETSESSIONATTRS PGSSLMODE PGREQUIRESSL PGGSSENCMODE PGCHANNELBINDING
export PGPASSFILE="$sql_tmp/no-pgpass"
mkdir "$sql_tmp/socket"
"$pg_bin/initdb" -D "$sql_tmp/data" -U postgres --auth=trust --no-locale --encoding=UTF8 >"$sql_tmp/init.log"
"$pg_bin/pg_ctl" -D "$sql_tmp/data" -l "$sql_tmp/server.log" \
  -o "-k $sql_tmp/socket -h '' -p 56439 -F" -w start >/dev/null
psql_local=("$pg_bin/psql" -X -h "$sql_tmp/socket" -p 56439 -U postgres -d postgres -v ON_ERROR_STOP=1)
if ! "${psql_local[@]}" -q -f "$repo_root/supabase/tests/people-bootstrap.sql" >"$sql_tmp/tests.log" 2>&1; then
  cat "$sql_tmp/tests.log" >&2
  exit 1
fi

# A real pre-existing claimant must stop the entire migration without being
# renamed or replaced. Exercise the failure before applying the clean case.
"${psql_local[@]}" -q -c "INSERT INTO public.unified_slugs(slug,entity_type,entity_id) VALUES('people','profile','79000000-0000-4000-8000-000000000001')"
if "${psql_local[@]}" -q -f "$repo_root/supabase/migrations/20261107_001_meet_people.sql" >"$sql_tmp/conflict.log" 2>&1; then
  echo 'FAIL: existing /people claimant did not prevent migration' >&2
  exit 1
fi
if ! rg -q 'conflicts with an existing handle' "$sql_tmp/conflict.log"; then
  cat "$sql_tmp/conflict.log" >&2
  exit 1
fi
"${psql_local[@]}" -q <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.unified_slugs WHERE slug='people' AND entity_id='79000000-0000-4000-8000-000000000001')
   OR EXISTS(SELECT 1 FROM public.reserved_slugs WHERE slug='people')
   OR to_regclass('public.people_profiles') IS NOT NULL THEN
   RAISE EXCEPTION 'Route conflict changed existing data or left a partial migration';
 END IF;
END $$;
DELETE FROM public.unified_slugs WHERE slug='people';
SQL
if ! "${psql_local[@]}" -q \
  -f "$repo_root/supabase/migrations/20261107_001_meet_people.sql" \
  -f "$repo_root/supabase/tests/people-security.sql" >"$sql_tmp/tests.log" 2>&1; then
  cat "$sql_tmp/tests.log" >&2
  exit 1
fi

# Hold a source edit open while a worker tries to persist the prior revision.
# Real concurrent connections prove the translation trigger serializes on the
# parent row, not merely that a sequential timestamp comparison happens.
"${psql_local[@]}" -q <<'SQL'
INSERT INTO auth.users(id) VALUES('79000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,username) VALUES('79000000-0000-4000-8000-000000000002','concurrency_fixture');
INSERT INTO public.people_profiles(user_id,enabled,help_offered)
VALUES('79000000-0000-4000-8000-000000000002',true,'Old source');
SQL
source_revision="$("${psql_local[@]}" -At -c "SELECT content_updated_at FROM public.people_profiles WHERE user_id='79000000-0000-4000-8000-000000000002'")"
PGAPPNAME=people-source-edit "${psql_local[@]}" -q >"$sql_tmp/source-edit.log" 2>&1 <<'SQL' &
BEGIN;
UPDATE public.people_profiles SET help_offered='New source'
WHERE user_id='79000000-0000-4000-8000-000000000002';
SELECT pg_sleep(1);
COMMIT;
SQL
edit_pid=$!
edit_started=false
for ((attempt = 0; attempt < 50; attempt++)); do
  if [[ "$("${psql_local[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='people-source-edit' AND wait_event='PgSleep'")" == '1' ]]; then
    edit_started=true
    break
  fi
  sleep 0.02
done
if [[ "$edit_started" != true ]]; then
  cat "$sql_tmp/source-edit.log" >&2
  echo 'FAIL: concurrent source edit did not start' >&2
  exit 1
fi
if "${psql_local[@]}" -q -v VERBOSITY=verbose -v source_revision="$source_revision" >"$sql_tmp/stale-write.log" 2>&1 <<'SQL'
SET ROLE service_role;
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at)
VALUES('people','79000000-0000-4000-8000-000000000002','vi','help_offered','Stale worker result',:'source_revision');
SQL
then
  echo 'FAIL: stale concurrent translation was accepted' >&2
  exit 1
fi
wait "$edit_pid"
if ! rg -q '40001: Stale People translation source revision' "$sql_tmp/stale-write.log"; then
  cat "$sql_tmp/stale-write.log" >&2
  exit 1
fi
"${psql_local[@]}" -q <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.content_translations WHERE content_type='people' AND content_id='79000000-0000-4000-8000-000000000002')
   OR (SELECT help_offered FROM public.people_profiles WHERE user_id='79000000-0000-4000-8000-000000000002')<>'New source' THEN
   RAISE EXCEPTION 'Concurrent source edit / stale translation protection failed';
 END IF;
END $$;
SQL
echo 'Meet People PostgreSQL RLS, grants, and privacy tests passed.'

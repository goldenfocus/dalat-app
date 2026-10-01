# Migrations

Supabase applies every `*.sql` file in this directory in lexical filename order.
Name a new file `YYYYMMDD_NNN_short_description.sql`, with a version greater than
the latest file already here.

## Data API grants

On 2026-10-30, new tables, views, and sequences in `public` stop receiving
automatic `anon` / `authenticated` / `service_role` grants. Existing hosted
tables keep the grants they already have. Local resets and preview databases
built with `auto_expose_new_tables = false` already behave this way.

A migration that creates a public table must decide access in that same file:

```sql
create table public.example (
  id uuid primary key default gen_random_uuid()
);

alter table public.example enable row level security;

-- Only the roles that actually call this table through supabase-js / PostgREST.
grant select on table public.example to anon, authenticated;
grant select, insert, update on table public.example to service_role;
```

Grant `service_role` for server code that uses the service key. Grant
`authenticated` or `anon` only for browser or cookie-session calls that RLS
allows. If a signed-in insert writes a `serial` or identity column, also
`grant usage, select on sequence ... to` that role.

If the table must stay off the Data API (it is only used by a `security definer`
function or by the migration owner), say so instead of granting:

```sql
-- data-api-grant: none public.example
```

`scripts/check-data-api-grants.mjs` fails the build when a public table is
missing that decision. The check also refuses a grant in the least-privilege
backfill that production does not already have, so that backfill stays a no-op
on the hosted project.

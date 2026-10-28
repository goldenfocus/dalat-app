# Event arrival and venue orders

Guest: `/events/<slug>/arrive`. Staff: `/events/<slug>/host`.

The Social House language-exchange series is opted in. Other events default off;
`events.arrival_enabled` controls each occurrence. New occurrences inherit the
series setting at insertion. This is deliberately independent of publishing.

The event creator, venue owner/editor and site administrators can open **Team**
and add an existing account by its exact username. Welcome staff can check guests
in. Order takers can also take and progress orders. Event managers can assign
roles. All access is event-scoped and uses each person's own login.

At the door, open **Arrivals**, show the QR, or find an RSVP/add a walk-in.
The QR leads only to the public guest flow and grants no staff access. A guest
can finish without creating an account. Arrival opens six hours before the event
and closes two hours after its end. Keep a paper list when connectivity fails;
do not promise a successful check-in or accepted order until the screen confirms.

**Orders** shows a shared queue, refreshing every five seconds while visible.
Accept → mark served. Payment is recorded separately when collected at the venue.
Existing orders are shown before staff can accidentally duplicate them. A missing
refresh is visible with the last successful update time. No online payments,
newsletter enrollment or cross-app account linking are performed.

## Release and security checks

- `bash scripts/test-arrival-sql.sh`: disposable PostgreSQL tests, including real
  concurrent requests, role boundaries, server pricing and legacy preorders.
- `npx vitest run lib/arrival components/arrival`
- `node scripts/check-data-api-grants.mjs`
- `node scripts/check-translation-catalogs.mjs`
- Normal typecheck, lint, build and live mobile guest/staff checks.

Migrations `20261121_001_event_arrival.sql` and
`20261122_001_event_arrival_opt_in.sql` were applied via the repository's
Management API SQL runner. A production-schema check-in/order/payment test was
performed inside a rolled-back transaction before the first migration was applied.
The tables and RPCs are service-only. API routes validate the signed-in staff
identity, enforce same-origin mutations and keep guest secrets in HttpOnly cookies.
Private nicknames, staff records and order notes never enter public translations.
Public menu labels reuse the existing translated menu sources and original controls.

## Practice rounds

The Social House event page and staff desk include **Start practice** for staff who
can welcome guests. The server includes every existing arrival and legacy checked-in
RSVP, deduplicated by account; nobody checks in twice. Language preferences guide
pairing, repeat partners are avoided when possible, and an odd attendee joins a trio.
The host controls round changes; late arrivals enter on the next round.

Participants use the same DaLat event page and their existing login or guest receipt
to see only their assigned group and practice prompts. Staff see all groups and can
announce partners for guests without phones. The separate EZViet practice room is
independent; this event-page flow does not require joining it. All group data stays
in the service-only `event_practice_rooms` table; compare-and-swap updates prevent
two staff members from starting the same round twice. Private names are excluded
from public translation storage. UI and prompt instructions cover all 12 locales;
Vietnamese/English example phrases intentionally preserve their teaching language.

The event page always shows **Find your partner**, including when a phone has no
recognized check-in cookie. Existing accounts/receipts resolve automatically. A
guest can also enter the eight-character code on their check-in confirmation;
this restores only their own group through a signed, event-scoped, six-hour
HttpOnly cookie. Recovery is rate-limited and never re-registers the guest or
advances a round. Hosts can read this code from the arrival list. The receipt page
also shows pairings directly, so guests do not need to discover another route.

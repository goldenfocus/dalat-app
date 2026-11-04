# Event arrival and venue orders

Guest: `/events/<slug>/arrive`. Staff: `/events/<slug>/host`.

The Social House language-exchange series is opted in. Other events default off;
`events.arrival_enabled` controls each occurrence. New occurrences inherit the
series setting at insertion. This is deliberately independent of publishing.

For signed-in attendees, the event RSVP, mobile sticky bar and welcome card share the saved order
state. Pending, confirmed and fulfilled orders show **Drink selected**, the saved
items, and **View your drink**, which opens the existing preparation receipt.
Cancelled orders return to **Choose your drink**. A failed lookup offers the
neutral view action without claiming the selection is missing. This is a private,
request-scoped lookup using the attendee's existing session and order read policy.

The event creator, venue owner/editor and site administrators can open **Team**
and add an existing account by its exact username. Welcome staff can check guests
in. Order takers can also take and progress orders. Event managers can assign
roles. All access is event-scoped and uses each person's own login.

At the door, open **Arrivals**, show the QR, or find an RSVP/add a walk-in.
The same search field finds existing accounts by username (with or without `@`),
partial display name, or exact email address. Name matching ignores case and
Vietnamese accents. Select the matching account, confirm their name/languages,
and check them in; the guest does not need to log in or RSVP first. Saved language
choices are reused, and the account-backed arrival joins the existing practice
roster. People without an account still use **Add walk-in**.

Account search is limited to signed-in staff with this event's welcome authority,
returns at most ten non-ghost accounts, and never returns email addresses. Partial
name searches respect profile discoverability; an exact username/email can locate
a person at the door. Queries use a private, rate-limited POST, not URL parameters.
Assisted registration and check-in commit together, preserve existing RSVPs/orders,
reject full or closed events, and use the existing idempotent receipt. No invitation
email is sent by this action. Search results show people already checked in.

The QR leads only to the public guest flow and grants no staff access. A guest
can finish without creating an account. Arrival opens six hours before the event
and closes two hours after its end. Keep a paper list when connectivity fails;
do not promise a successful check-in or accepted order until the screen confirms.

**Orders** shows a shared queue, refreshing every five seconds while visible.
Accept → mark served. Payment is recorded separately when collected at the venue.
Existing orders are shown before staff can accidentally duplicate them. A missing
refresh is visible with the last successful update time. No online payments,
newsletter enrollment or cross-app account linking are performed.

Guest-facing EZViet drink sponsorship attributions link to `https://ezviet.org`
in a new tab. The receipt, sponsored cart and existing-order offer retain their
localized labels and keep the event and saved drink selection open.
The preparation confirmation shows one success heading, event name, ordered
items, sponsor credit and guest amount due, followed by Event details and a
secondary language-edit action. Repeated instructions, subtotal, profile header
and reservation explanations are omitted. Cancelled/served status, order notes
and paid extras remain visible; an unprepared reservation is never labelled as
sent to the venue.

The Social House language-exchange series also displays EZViet's current
wordmark as a linked sponsor on the series page and upcoming event pages.
`series_sponsors` carries that attribution into new occurrences from its
effective date without changing earlier events or drink accounting. The logo is
an unchanged copy of `https://ezviet.org/brand/ezviet-wordmark.svg`.

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

The canonical practice session is on the Social House event page and staff desk.
Managers, organizers and staff with arrival welcome authority can draft and publish
rounds. Each person uses their own login; an arrival receipt or its recovery code
never grants host authority. These controls remain restricted to the Social House
language-exchange series.

### Attendance and participation

A plain RSVP or a drink reservation is preparation, not an arrival and not a place
in pairing. The roster reuses event arrivals and legacy RSVPs with a non-null
check-in timestamp, deduplicated by account; nobody checks in again to play.
Existing arrivals default to Playing for continuity. Identified event staff, event
creators, venue owners, accepted venue owner/editor managers and administrative
staff default to Hosting. Staff identification uses authority records, never names.
A host who wants to play can opt in explicitly.

Attendees can choose Playing, Visiting, Taking a break, Hosting or Left. Authorized
hosts can change these statuses on the checked-in roster, including for someone
without a phone. Only Playing people enter a new draft. This is an attendance
workflow, not location detection: staff should confirm that people marked arrived
are actually present. Browser presence, an open tab and advance preparation do not
establish physical attendance.

Changing participation affects future drafts and invalidates an existing draft;
it does not silently move people in the published round. Late arrivals enter the
next draft. There is no automatic missing-partner repair or mid-round reassignment.
The host can pause or end the current round, correct the roster and publish a fresh
reviewed round when needed.

Saved language preferences are reused. Pairing favors reciprocal language help,
uses known self-reported ability as a secondary fit signal, avoids previous partners
when possible, and puts an odd attendee in a trio. Unknown ability does not exclude
someone. No gender collection or gender-based matching is part of this flow.
Stable event numbers distinguish people with the same name; they are separate from
physical table numbers and round group numbers.

### Draft, tables and publication

The host's primary sequence is Draft groups → Review draft → Start round. A draft
is host-only and changes no attendee assignment. Start publishes the exact reviewed
groups and tables atomically. Every mutation carries the room revision; concurrent
changes are rejected rather than overwriting another host. Starting also compares
the draft against fresh eligible arrivals, language preferences and table settings.
If these change, the host must draft again. A running or paused round must end or
reach zero before another draft can be published.

Collapsed settings contain duration, available-table toggles and Balanced / Prefer
downstairs / Prefer upstairs. The working inventory is tables 1–7 downstairs and
8–14 upstairs. Table 5 is the bar and starts unavailable. Furniture details need
on-site confirmation; the inventory is not a venue safety-capacity claim.

Balanced keeps gatherings of up to ten players downstairs when seats allow and
spreads larger groups across floors. Floor preferences allow a fallback when the
preferred floor is full. Pairs favor small tables, the trio is seated first, and
larger tables can hold more than one clearly numbered practice group. The bar is
last choice even when enabled. Allocation never exceeds configured table seats;
insufficient available capacity blocks drafting with a visible error. Changing
availability affects a future draft, not the table assignments already published.

### Attendee view and clock

A recognized attendee's event card leads with the physical table and floor,
partner display names and stable event numbers, the group number and countdown.
Ordinary attendees receive only their own published group and table; complete
rosters, drafts and other groups are host-only. Hosts can announce assignments for
guests without phones.

The default round is twelve minutes. The server persists start/end timestamps and
pause state; the client measures its offset from server time. Pausing freezes the
remaining duration across reloads, Extend adds two minutes, and Resume persists a
new end time. The attendee card shows a language-swap cue in the second half.
End records a ninety-second changeover. Reaching zero displays Round complete;
it does not silently shuffle partners or start a new round. The host explicitly
drafts, reviews and starts the next round. No background phone alarm is promised.

The page polls while visible and refreshes on focus, reconnect and app return.
Failures preserve the last assignment with a refresh action; stale data is not a
claim that a new round started. The event page shows Find your partner when no
arrival is recognized. Existing account sessions and guest receipts resolve
automatically. A guest can enter the eight-character check-in confirmation code
to restore only their own group through a signed, event-scoped, six-hour HttpOnly
cookie. Recovery is rate-limited, never creates another arrival and never advances
a round. The arrival receipt also displays the same event practice card.

### EZViệt activity handoff and privacy

Open activity links to EZViệt's `/challenges?event=<slug>&practice=1`; a completed
round links to `/challenges?event=<slug>`. Only the public event slug is forwarded.
No attendee identity, private roster, arrival credential or service key crosses
that link. DaLat remains the authority for pairing, physical tables and round
clock. This flow does not join or synchronize the separate legacy EZViệt pairing
room. EZViệt owns the activity and optional seven-day challenge; its sign-in and
progress storage remain separate. A link alone does not establish shared accounts,
physical attendance, challenge acceptance or learning completion.

Participation, tables, drafts and clocks reuse the service-only
`event_practice_rooms` JSON state; this change needs no new DaLat schema. Mutations
validate same-origin requests and server-side authority. Private responses retain
`Cache-Control: private, no-store` and `Vary: Cookie`; cookie-dependent practice
APIs must also bypass CDN caching. Private names and roster state never enter the
public translation registry. Static controls, status labels and table/floor copy
are localized in all twelve UI catalogs.

### Verification scope

On 2 November 2026 the local full suite passed 1,570 tests in 260 files, including
practice model, API, server mutation and component coverage. Tests exercise owner
and no-show exclusion, own-status changes without duplicate arrival, unauthorized
writes, stale drafts, compare-and-swap conflicts, table capacity and floor policies,
private group projections, guest recovery, and two rounds with clock controls.
Full TypeScript checking, targeted ESLint and the webpack production build with
all prebuild gates passed. All twelve catalogs contained 3,860 matching keys with
valid ICU arguments; all 61 client namespaces were covered. A read-only public
content translation audit completed without errors and found no pending venue,
organizer, community, experience, menu or comment fields, but unrelated event,
moment, profile, track, People and blog backlogs remain. This is not a claim of
global public-content translation completion.

The server tests use explicit fake dependencies; they are not a live database
concurrency or production-release claim.

The public no-login [host rehearsal](practice-rehearsal.md) reuses the real UI and
model with synthetic data at `/practice/rehearsal`. Its documented mobile checks
cover table settings, both floors, host/attendee switching and two rounds. It never
calls the event API or starts a real session. Cross-device production refresh,
real venue connectivity, actual table availability and live EZViệt acceptance must
be verified separately before claiming the complete event journey is live.


### Compact practice and host edits (2 November follow-up)

Practice uses visible English/Vietnamese controls and a scoped cool glass surface.
Names with verified DaLat avatars (or guest initials), table/floor and the clock
lead the attendee view. Group numbers remain host-only. Participation is a short
status button, with mid-round opt-in labelled for the next round. Hosts use compact
clock/utility controls and a 20-minute default for newly drafted rounds; explicitly
saved durations remain unchanged.

Hosts may swap two existing people across unpublished draft groups by tapping
them or desktop drag/drop. API action `swap` requires `draftId`, both participant
IDs, host authority, expected revision and a fresh roster fingerprint. It preserves
members, group sizes and table capacity and changes the draft ID. Starting an old
version fails; published groups stay unchanged.

### Host account check-in verification (4 November 2026)

Account search, assisted registration and check-in passed the disposable PostgreSQL
security suite and a rolled-back transaction against the current production schema.
The production-schema check found an existing unregistered account, resolved it by
username and exact email, registered and checked it in, then repeated the request
without duplication. The transaction was rolled back; no test attendance remained.
API/component tests cover session authority, cross-origin requests, rate limiting,
stale search responses and already-arrived results. All twelve new UI catalog
entries were independently reviewed. Private operational text remains excluded
from the public translation worker.

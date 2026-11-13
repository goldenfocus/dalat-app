# Language-exchange tables

The Social House pilot is restricted to `language-exchange-social-house-z8oc-YYYYMMDD`.
It uses the existing private `event_language_profiles` store. A person saves spoken
languages and levels once, plus a primary and optional additional practice languages.
Old single-language profiles remain valid. No cross-app account linking is implied.

## Guest journey

RSVP collects missing preferences and immediately requests the persisted table plan.
The event and `/prepare` show the table before the game starts. Plans may rebalance
while everyone is still expected. The first arrival or manual host move locks seats;
subsequent arrivals fill vacancies without moving people already assigned.

Check-in is the presence confirmation. An RSVP identity changes into its arrival
identity without losing its table. Guests get only their own table and teammates,
with quiet arrival marks. Recovery codes never appear in other guests' responses.
The main action opens offline bilingual conversation cards. During play the table
number becomes a subtle watermark; the chevron reveals the floor and teammates.
Profile editing and participation sit behind small controls.

The host may issue a signed, six-hour QR receipt for a guest added at the door.
`/events/<slug>/play#ticket=...` consumes the fragment, removes it from the address bar,
and sets an HttpOnly, event-scoped cookie. It grants that guest's view, never staff
permission. The existing eight-character receipt recovery remains available.

## Host journey

The table board shows present/expected counts and distinct expected/no-show marks.
Tap two people to swap, drag a person to another table, or select a person and tap
an available seat. A host confirmation of an expected account performs the actual
check-in. The eye opens a read-only guest preview without impersonation.
Start Game starts a 20-minute round while preserving the assigned seats. Pause,
resume, add two minutes, end, floor preference and available tables remain available.
English and Vietnamese speakers are distributed first when the roster allows it;
additional languages improve matches. Flags represent selected languages only.

## Verification

`/practice/rehearsal` remains an isolated sample with no event API writes. It shares
the planner and controls but is not evidence of an authenticated guest journey.

Release checks use separate authenticated host and guest browser sessions against
a disposable local PostgreSQL, Supabase Auth and PostgREST stack. They exercise
saved languages, actual RSVP, pre-start seats, check-in, refresh, host moves,
no-shows, Start Game, cards, receipt recovery, authorization and revision conflicts.
A regression checks JSONB key-order changes cannot cause polling to rewrite seats.
SQL tests validate both old and multiple-target profiles and immutable snapshots.
All 12 locale boundaries include `eventPractice`, including `/prepare` and `/play`.
No test account or synthetic RSVP is inserted into a public production event.

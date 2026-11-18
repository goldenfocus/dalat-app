# Language-exchange tables

The Social House pilot is restricted to `language-exchange-social-house-z8oc-YYYYMMDD`.
It uses the existing private `event_language_profiles` store. A person saves spoken
languages and levels once, plus a primary and optional additional practice languages.
Old single-language profiles remain valid. No cross-app account linking is implied.

## Guest journey

RSVP collects missing language preferences. Check-in, whether self-service or staff-assisted, confirms presence. The planner assigns a physical table only when at least two checked-in people cover Vietnamese and English. Unmatched guests see a waiting state that refreshes automatically every five seconds; they do not receive a provisional table number. Their private view does not expose the rest of the waiting list.

Once assigned, seats stay stable as new people arrive. Additional guests may fill mixed tables or form new mixed groups. A temporary absence does not silently move the remaining seated guests; their game waits until a mixed pair is present again. The floor policy targets 60% upstairs within table capacity. Further shared languages improve matching.

The host may issue a signed, six-hour QR receipt for a guest added at the door.
`/events/<slug>/play#ticket=...` consumes the fragment, removes it from the address bar,
and sets an HttpOnly, event-scoped cookie. It grants that guest's view, never staff
permission. The existing eight-character receipt recovery remains available.

## Host journey

The table board shows present/expected counts and distinct expected/no-show marks.
Tap a person to reveal their spoken languages and controls. Drag to swap, or select a person and tap an available seat. A host confirmation of an expected account performs the actual
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
saved languages, actual RSVP, waiting, check-in, refresh, host moves,
no-shows, Start Game, cards, receipt recovery, authorization and revision conflicts.
A regression checks JSONB key-order changes cannot cause polling to rewrite seats.
SQL tests validate both old and multiple-target profiles and immutable snapshots.
All 12 locale boundaries include `eventPractice`, including `/prepare` and `/play`.
No test account or synthetic RSVP is inserted into a public production event.

## Shared-phone game (18 November 2026)

The public `/practice/rehearsal` starts with 50 fictional checked-in guests and three hosts. The 10/34-person scenarios remain available for check-in practice. This uses the same guest and staff components as the real event, with isolated browser-only state. Reset never writes to an event.

At a table, Play is available before the host starts a timed round once two present people cover Vietnamese and English. One phone shows the current speaker and a language partner as two avatars with names, then a bilingual card with a play button beneath each language. Each next turn rotates speakers and uses that speaker's saved learning level; there is no manual word/phrase selector, mission title, twist, or reward claim. Beginner/unknown levels use words, intermediate uses short phrases, and fluent/native uses longer phrases. The host roster shows Learning plus flags; selecting a person reveals Speaks plus flags.

Real-event turn position is stored only on the shared device, keyed by event, table, and round. Seating and attendance still use the existing authenticated server state; game progress does not synchronize between devices. Rehearsal progress resets on reload. Audio is reused from existing exact-text EZViet recordings and served from local static assets (no microphone, speech scoring, or paid generation). The small By EZViet link opens https://ezviet.org in a separate tab. Learning cards intentionally retain both source languages; the interface supports all 12 locales.

Language-exchange event pages and the rehearsal skip automatic cross-app account probing. Signed-out staff use the normal DaLat sign-in; opening a guest ticket never initiates an EZViet redirect. Explicit account linking elsewhere is unchanged.

Guests receive a physical table only after a checked-in Vietnamese-English pair can be formed. Unmatched guests and RSVP-only guests stay in the host waiting pool, with no guessed table and no other waiting guests exposed in their guest view. Compatible check-ins form tables automatically; late arrivals can fill mixed tables without moving seated guests. If no physical table remains, the group stays waiting instead of sharing a table number with an unrelated group.

## Opening-night desk

The rehearsal now starts with 50 expected guests and zero checked in. `Check-in`, `Tables`, and `Guest view` share one tab bar. Check-in has a visible sample QR, name search, explicit per-person Check in actions, and an X to mark someone absent. The sample QR opens a separate, isolated guest rehearsal; it does not synchronize attendance between devices or touch the real event. Use Guest view in the same rehearsal to observe its current assignment. The optional Check in all sample guests action is inside rehearsal details.

The real staff desk uses the same Check-in / Tables navigation before its existing orders, sponsor, and team tools. Check-in opens by default, and its real door QR is visible immediately. Existing @username/email search and walk-in forms remain the real check-in path. The existing invitation dialog is available here too; it does not mark an invitee present. Selecting a person on a table shows controls beside that person, including guest preview, receipt QR, and attendance correction.

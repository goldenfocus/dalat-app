# Host rehearsal

Route: `/practice/rehearsal` (or `/<locale>/practice/rehearsal`). Public, no login,
noindex, sample-only. It reuses EventPractice and PracticeHost with an injected
in-memory response transport and the real pairing, table allocation and clock model.
It does not call the event practice API, reveal attendees or start a real round.
Automatic PWA updates do not reload this route mid-rehearsal. A deliberate refresh
still resets its sample state.

Live event pages and their host/arrival subpages use normal page scrolling. The
site header, bottom navigation, playback controls and actionable notices stay in
the document flow. The floating camera shortcut, duplicate mobile RSVP bar and
completed-upload notification are removed; the page's RSVP and Moments actions
remain available. The presence roster has no separate scrolling area, so its
last attendee and the draft action can be reached with the same page scroll.

The compact sample toolbar offers ten or 34 players, Host / Mai and reset.
English and Tiếng Việt stay visible above it. The slate/ice-blue glass treatment is
scoped to practice, including the rehearsal shell; other app themes are preserved.

Choose ten or 34 sample players. Morgan is a working host and Casey is a visitor;
both remain out of pairing unless deliberately changed. The full available table
inventory matches the event model, with the bar unavailable initially. Reset,
changing sample attendance, or refreshing clears the sample event. Switching Host /
Attendee preserves it. Nothing persists across tabs or refreshes. Language navigation also starts a new
sample session. In a real event the server retains published rounds.

Attendees see names/avatars, physical table/floor, countdown and one activity action.
Hosts also see the same activity action before and during rounds, including while
hosting or before checking themselves in. It opens EZViệt in a separate tab so the
host can keep the event controls open. Opening the activity does not start a round
or change pairings; only the reviewed-draft start action does that.
Visible group numbers and the participation form are removed. A compact status
button offers Playing or sitting out. Joining during a live round explicitly says
Play next round and never changes that round. A host sees icon controls for
pause/resume, +2 minutes and end; table settings, roster and published groups open
from quiet utility icons. Existing DaLat account relationships provide avatars;
guests use initials. No external account inference or identity bridge is added.

Rehearse: open table settings, block an occupied table, select a floor preference
and save. Draft groups, review the proposed physical tables and partners, then start.
New rounds default to 20 minutes. Tap one person then a person in another group to
swap them; desktop drag/drop uses the same action. Only unpublished drafts change.
Each swap generates a new draft ID and retains roster/revision/capacity checks.
In a real event, arrivals after a draft do not block starting its reviewed groups.
Those arrivals wait for the next draft; existing participants, tables and language
preferences must still match the reviewed draft before it can start.
Switch to Attendee (Mai) to find the published table, partner and countdown. Return
to Host to pause, add two minutes, resume or end. Draft/review/start a second round
and check Mai's new assignment. A large balanced draft should use both floors.

Rehearsal activity links open the generic EZViệt practice/challenge hub without
sample event or participant identity. These external activities are separate from
the in-memory rehearsal.

This page proves UI and model behavior with synthetic data. It cannot establish
real host authorization, cross-device refresh, venue connectivity, physical table
availability, identity linking or actual challenge acceptance. Those remain release
checks on the real event flow. It grants no additional server permission.

## Live event translation boundaries

The event `/host` and `/arrive` pages also render `EventPractice`. Their nested
`NextIntlClientProvider` message sets must include `eventPractice` alongside
`arrival`, `menuOptions` and `translations`: a nested message set replaces the
parent set rather than merging it. Loading the namespace in the route island alone
does not reach these panels. Both pages ship the practice messages for the request
locale, including button labels and accessible names, in all 12 supported locales.

`components/practice/route-translations.test.tsx` exercises both page boundaries
with the real practice panel and language provider, including settings and roster
controls. Its sample transport does not call or mutate a real event.

## Local verification, 2 November 2026

At `http://localhost:3215/practice/rehearsal`, Chrome at 375×812:
- Ten players: blocked table 4, preferred upstairs, saved and drafted. Round 1 gave
  Mai table 8 upstairs with Alex. Sample host and visitor remained excluded.
- Started round 1; attendee showed stable numbers and a running countdown. Checked
  both Evening Café and Morning Mist themes; controls and names fit without clipping.
- Host paused, extended two minutes, resumed, ended, and received the 90-second
  changeover. Drafted and started round 2: Mai table 12 upstairs with Jamie.
- Vietnamese route: localized host draft/review/start and attendee table, floor,
  partner, countdown and activity control verified at 375px; no horizontal overflow.
- Reset to 34 players: 17 draft groups spread across both floors, with shared-table
  group numbers clear and no bar assignment.

Screenshots: `/tmp/dalat-rehearsal-375-dark.png` and
`/tmp/dalat-rehearsal-375-light.png`. These are local synthetic evidence, not a
production or multi-device rehearsal claim.

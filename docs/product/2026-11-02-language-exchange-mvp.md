# Language exchange: next-event MVP

Status: planning specification, not implemented or a release claim.
Recorded: 2 November 2026. Target: the event the owner says is in two days;
confirm the actual occurrence and local date before configuring it.

## Intention and scope

Make arrival, finding partners, changing rounds and continuing practice feel easy.
The venue should have fewer interruptions and a clear order queue. Learners should
leave with someone to practise with and a small reason to return next week.

This is a product synthesis of the owner's event review and brainstorming, not a
raw transcript. Owner requirements and implementation proposals are separated below.
The full deferred idea inventory is in
[the roadmap](2026-11-02-language-exchange-roadmap.md). Do not treat either document
as evidence that a feature exists or as authority to announce prizes or spend money.

## Confirmed owner direction

- Skip gender collection and gender-based matching for now.
- Keep the event experience simple; reuse account details and saved language levels.
- Separate advance preparation from physical presence. Only present, playing people
  enter pairings. Visiting, working and hosting people can attend without playing.
- No second check-in to join practice. Existing attendees retain their arrival record.
- Put host start controls and each attendee's partners, physical table and timer on
  the event page. Games and learning progress belong in EZViệt.
- Allow the host to block occupied tables and choose floor preferences behind
  collapsed settings. Small events should not empty the downstairs atmosphere;
  crowded events must spread out to reduce noise.
- Offer a voluntary seven-day challenge after a round. Preserve longer/group/online
  challenges as future options. The owner discussed up to three challenge buddies.
- Reuse listening, speaking, recordings, pitch comparison and deliberate peer sharing.
- Save this wider direction now; build only what is reliable for the next event.

## Release priority

1. Reliable attendance and playing eligibility; event-page host controls; partner and
   table visibility; authoritative round clock; a usable second round.
2. A small reusable speaking activity using existing EZViệt capabilities.
3. Seven-day challenge invitations, acceptance and daily completion, only after the
   first two work end to end. This is new work, not a label for a practice link.

The pre-event rehearsal is the release decision point. If challenge acceptance or
durable daily completion does not work, ship the event mechanics and link to actual
existing practice without promising a challenge or prize. Record the gap explicitly.

## Event mechanics

Host default view: eligible-player count, Draft groups, Review draft, Start round.
Managers, organizers and authorized co-hosts share the same server-enforced controls.
Drafting changes no live assignment. Publication is atomic; stale drafts must be
recomputed when eligible participants or available tables change.

Collapsed settings: Balanced (default), Prefer downstairs, Prefer upstairs; available
table toggles; round duration. Language compatibility, useful level balance and
repeat avoidance guide matching. Unknown levels do not exclude someone. No gender
field or gender rule in this release.

Balanced is adaptive, not a forced 50/50 split: a small group can remain downstairs,
while larger attendance spreads across floors before downstairs becomes oppressive.
Exact attendance thresholds are provisional and should be tuned with the host;
seat counts do not establish safe occupancy or acoustic comfort. Host overrides win.
Prefer small tables for pairs, with trios for odd numbers. Physical capacity is
separate from practice-group size. Large tables may host clearly identified groups
when necessary; the bar is last choice. Never exceed the configured table capacity.

Working inventory, based on the owner's description; verify on site:

| Floor | Table | Seats | Notes |
| --- | --- | ---: | --- |
| Downstairs | 1 | 4 | Written description overrides conflicting sketch |
| Downstairs | 2 | 6 | Verify against sketch |
| Downstairs | 3 | 6 | |
| Downstairs | 4 | 2 | |
| Downstairs | 5 | 4 | Bar; availability and suitability need confirmation |
| Downstairs | 6 | 2 | Shelf |
| Downstairs | 7 | 2 | Shelf |
| Upstairs | 8–12 | 2 each | Five tables |
| Upstairs | 13–14 | 4 each | Two tables |

Total: 26 downstairs, 18 upstairs, 44 including the bar, 40 without it. This is a
working furniture inventory, not a legal venue-capacity claim. A simple numbered
floor diagram is sufficient; host taps update availability, not camera inference.
New blocks normally affect the next draft. Mid-round moves are explicit and targeted.

Attendee event card leads with: table number and floor, partners' display names and
stable event numbers, round countdown, Open activity. Keep the card above the fold.
Guest recovery must reuse attendance and reveal only that guest's group. Test PWA
refresh, reconnect, duplicate taps and private API cache isolation.

Plan two rounds as the essential event outcome, with a third optional. Proposed
starting defaults: 12-minute rounds, midpoint language swap, 90-second changeover.
Hosts can pause/extend and start the next round. Persist start/end timestamps so
reloads agree; do not rely on a local timer or promise background phone alarms.
Use a host display/announcement as a room-wide cue. Never silently reshuffle people
because a phone wakes late. A timer ending is not proof that learning occurred.

## Round-end challenge invitation

Keep this short: “Round complete” plus an accurate activity summary if available,
then “Practise together this week?” with Challenge Mary and Not now.
Show time actually tracked or completed activities; do not invent words learned,
pronunciation improvements or proficiency changes. Do not obstruct the next round.

An invitation is pending until the other person accepts. In a trio, invitations go
to each selected person independently; do not add a group-consent system for launch.
One buddy is the main path. Up to three distinct accepted buddies may share the
same daily progress if that cap fits the existing implementation cleanly. Do not
create three sets of daily homework. No automatic follow or access to recordings.

Use the round's existing partner selection plus a private QR/link for in-person
sharing. Links expire, are unguessable, reveal no contact details and require the
recipient to deliberately accept. Account claiming must not duplicate an existing
participant or expose attendance to arbitrary link holders. QR acceptance is not
proof of ownership of someone else's account.

Do not build email/phone lookup, contact enumeration, SMS or automated invitations
for this launch. No messages are sent by this planning task. Existing EZViệt sign-in
can save learning progress; never claim that it already creates a shared DOV/Deovia
account or migrates DaLat identity. A verified identity bridge is a separate dependency.

## Seven-day learning contract — proposed pilot defaults

- One event cohort with a published seven-day schedule in Asia/Ho_Chi_Minh. Show exact
  dates before acceptance. Daily windows start the day after the event; avoid a
  late-night registration creating an immediate missed day.
- One approximately three-minute activity per day, suited to the learner's chosen
  course. Vietnamese and English learning remain supported through shared components.
- Suggested completion threshold: five of seven days. Clearly distinguish this
  recommendation from the owner's approved seven-day duration; confirm promotional
  terms before advertising a particular threshold.
- Prepare and check all seven activities before inviting people. A placeholder daily
  card or an arbitrary game link is not a working learning programme.
- Record actual completion server-side, idempotently, with the challenge, learner,
  activity, course and cohort day. Repeated taps/retries do not duplicate credit.
- One person's progress survives a buddy declining, leaving, disappearing or failing
  to review. No required peer response, AI score, positive rating or shared audio is
  necessary to earn completion. Do not award credit merely for opening a page.
- Private progress first. Sharing a selected recording is a separate deliberate step.
  Use existing per-recording access controls and revocation; no public batch upload.
- A small buddy progress view is enough. Notification delivery and automatic reviewer
  assignment are later work, not dependencies disguised as launch essentials.

## Speaking activity and pitch demonstration

Reuse the existing example → listen → record → replay → optional retry/save flow.
Do not rebuild the live teacher as a new event-specific experience. Inspect the
current shared PracticeDialog, PracticeContour and recording/history hooks first.

An optional demo can compare native and learner pitch movement. Use a short native
reference in the selected dialect; for English, use appropriate stress/intonation
guidance rather than a Vietnamese lexical-tone judgement. Preserve gaps and uncertain
frames. Different people naturally have different pitch ranges: matching absolute
hertz is not the goal. A contour is a listening aid, not a pronunciation score.

Test a real phone at venue-like noise levels. Unclear audio should prompt a retry
or offer listening/manual partner practice; it must not mark the learner wrong.
Recording is explicit, microphone state visible, replay controllable, and saving
private. No continuous room recording. Gameplay is not consent to train models,
publish a voice or export it to a research pipeline. Optional research consent
remains separate and off by default.

## Rewards: unresolved, not approved promotion terms

Owner ideas include a ₫1 million draw, winner-and-friends food/drinks, Hall of Fame,
future shirts and sponsors; earlier exploratory amounts included ₫2.5m/₫5m/₫10m.
No budget, prize package, winner count, invite weighting or terms are finalized.

Recommended pilot: one completion-based eligibility record per learner. Up to three
buddies increases social support, not entries merely for inviting. If bonus entries
are later chosen, specify qualifying accepted/active buddies and a server-enforced
cap; no self-invites, duplicate-account farming or unlimited invitation points.

Do not announce “unlimited food/drinks for you and your friends.” It has no bounded
cost, guest count or service entitlement. Define a capped venue package, eligible
items, number of guests, redemption window and who funds it before any promotion.
Hall of Fame publication is opt-in. Feedback can be negative without losing rewards.
No legal exemption is assumed because a prize is small or participation is free.
Confirm local promotion requirements before announcing or operating a random draw.
This task authorizes neither funding nor a public announcement.

## Identity, privacy and source ownership

DaLat owns event/RSVP/arrival, venue inventory and orders; use one canonical event
session authority for matching/table/clock rather than parallel rooms in both apps.
EZViệt owns learning activities, attempts, feedback and challenge progress. A secure
bridge carries narrow event context; never forward broad service credentials or
pretend unrelated-domain cookies are shared. Prove account ownership when linking;
never merge people solely by name or matching email text. Guest event participation
remains possible without mandatory account creation.

Event history should eventually link date/venue, actual attendance, partners and
activities. Keep it private by default. A mutual connection and block/report path
must precede unsolicited messaging. Do not publish contact information, full rosters,
real-time positions or recordings from event participation alone.

## Concrete rehearsal and acceptance

- Host drafts and starts from the event page; staff authorization rejects outsiders.
- A present visitor/working owner and a no-show are never paired; an existing checked-in
  player is paired without checking in again. Late arrival joins a subsequent draft.
- Test two players, an odd group, ten-player small gathering and a larger multi-floor
  group, occupied tables, insufficient seats and changed availability before publish.
- Both partners see the same group/table and timer after reload, app switching and
  reconnect. Anonymous users cannot retrieve private groups; cache remains private.
- Complete two rounds with a real changeover. No duplicate room or stale assignment.
- Activity recording/replay works on phones; denied microphone and noisy/uncertain
  input have useful fallbacks. Never mistake a screenshot for this verification.
- Invite/accept/decline/reload persists; a declined/unaccepted invitation grants no
  access. Course choice and original identity survive the route between apps.
- Daily completion is durable, handles retries/day boundaries and remains available
  without a buddy review. Reward logic is absent unless finalized and verified.
- Verify English/Vietnamese learning parity and supported DaLat localization in the
  actual short mobile viewport. Practice automation stays muted except audio checks.

## Current evidence and handoff

Read on 2 November: EZViệt live docs identify release 0.2.63; local origin/main is
5932692. The catalog describes recording, replay, private history and deliberate
sharing; docs/practice-review.md describes existing review access and peer feedback.
Source inspection finds PracticeContour, PracticeDialog and teacher PitchGraph.
This is reuse evidence, not proof of a working event challenge or a noisy-room demo.
Live account linking and a complete seven-day challenge were not verified here.

Relevant EZViệt source/document paths: docs/PROJECT.md; docs/practice-review.md;
docs/knowledge/features.json; components/practice/PracticeDialog.tsx;
components/practice/PracticeContour.tsx; components/teacher/PitchGraph.tsx;
lib/teacher/pitch.ts. Re-read current source and mandatory skills before editing.

This change saves a plan only. No application code, schema, account, reward,
notification, public event or production deployment is changed by this document.

# Language exchange: preserved ideas and expansion roadmap

Status: idea inventory and proposed sequencing, not an implementation promise.
Recorded: 2 November 2026. Source: owner-supplied event review and visible planning
conversation, faithfully summarized. Names, jokes and private dialogue are omitted.
The current launch boundary is the [next-event MVP](2026-11-02-language-exchange-mvp.md).

## Decisions and changed directions

| Topic | Earlier direction | Current direction and reason |
| --- | --- | --- |
| Partner location | Event names/numbers alone | Add real numbered tables/floors; people could not find partners |
| Eligibility | Recorded check-ins / extra practice join | Distinct present + playing state; preserve existing arrival and exclude absent/working people |
| Floors | Upstairs-first | Adaptive Balanced default, host floor override; retain atmosphere at small events and reduce crowding at large ones |
| Gender matching | Exploratory mixed/same gender preference | Skip entirely now; no gender collected |
| Challenge duration | 7/14/21 days | Seven days for first release; preserve longer durations for later |
| Buddy count | One, three or a larger group | One obvious invitation; up to three simple buddy relationships if cheap; larger shared groups deferred |
| Rewards | Various cash amounts and unlimited hospitality | Unresolved; no public promise or spend until capped package, funding and rules exist |
| Shared identity | Automatic account port / embedded app modules | Desired seamless identity; actual verified ownership/linking required, no duplicate credentials or blind merging |

## A. Event operations and reusable venue module

- Shared manager, organizer, co-host, welcome and order-service capabilities; one
  person can hold several roles without sharing an account.
- Account members prepare and RSVP online; guests scan one QR and can participate
  without an account. Optional account creation follows a deliberate sign-in flow.
- Canonical DaLat event entry from EZViệt, SocialDaLat and venue QR codes. EZViệt
  presents the games; do not duplicate event/session state or build iframe coupling.
- Save a compact language/level summary for next time; suggest adjustments only
  from supported learning evidence, with correction available to the learner.
- Host floor-plan editor, saved capacities/zones and availability toggles. Optional
  real floor photos can be a schematic background; no camera occupancy system planned.
- Small groups remain sociable; larger groups spread across floors. Host can block
  regulars' tables, exclude unsuitable bar seating and review a draft before publish.
- Reliable round-end prompts, language swaps, changeovers, pauses and extensions;
  host-controlled second/third rounds. Announced group photos without forcing
  uncomfortable practice density.
- Future partner preferences: prefer a previous buddy or privately avoid someone.
  A block/safety exclusion must outrank a preference, without exposing the reason.
  Do not silently force a reunion merely because two people completed a challenge.
- Replicate a proven venue template to new venues; ambassadors use scoped permissions,
  local table/menu configuration and a short runbook. No hardcoded Social House IDs
  in shared product logic. Defer a generalized restaurant SaaS until this loop works.

## B. Drinks, food and venue value

- Sponsored first-drink options only: lime water, ginger tea, iced coffee.
- Iced coffee has simple milk and sugar checkboxes; quantities/levels later only if
  venue service benefits. Establish actual product variants and prices with the venue.
- Show the sponsored first drink as ₫0 / complimentary EZViệt while retaining regular
  menu prices for additional items and correct sponsor/venue accounting.
- Going RSVP must qualify before 16:00 on event day in Asia/Ho_Chi_Minh; online
  preparation is not physical arrival. Define exact cutoff, eligibility transitions,
  any quantity cap and one redemption/person/event on the server, not only in the UI.
- After cutoff, show the regular flow without a stale offer. Do not retroactively
  invalidate a qualifying early RSVP because the person arrives after 16:00.
- Preserve an already-selected drink visibly; do not ask them to choose it again.
- Preorder totals, arrival-based preparation release, clear new/preparing/served
  queue, separate payment state and venue-side payment. Paid extra orders must not
  overwrite an active preparing ticket.
- Venue-supplied food photos and full-menu orders during the evening. Preserve
  product provenance, stock and service clarity. Track delivery destination when
  practice tables change; do not silently send a ready order to an obsolete table.
- Registration earns genuine convenience: saved preferences, order history, quick
  repeat order and receipts. Guest ordering remains useful. Measure fewer staff
  interruptions, prep times, paid orders and repeat visits, not registration alone.
- Later embed the proven ordering capability into venue sites with clear tenant,
  menu, staff, payment and order ownership. No new payment processor implied here.

## C. Challenges and social practice

- Invite the current partner at round end; a trio can invite each other. Voluntary
  accept/decline, no interruption to seat changes or penalty for saying no.
- Start with seven days and one short daily activity; possible later 14/21-day
  durations negotiated by both people. A traveller leaving soon can still practise
  remotely; future event attendance and learning completion are distinct concepts.
- Up to three buddy relationships can share one daily activity. Later support
  explicitly consenting group challenges, including larger groups such as twelve.
- Challenge hub, QR/link sharing, profile challenge button, optional availability
  status and asynchronous invitations with expiry. Later email/phone invitations
  require privacy-preserving lookup, verified claim, rate limits and deliberate send.
- Private challenge submissions, optional voice takes, retries before submitting,
  peer comments and review using existing per-recording permissions.
- No peer review should strand the learner. First allow independent completion;
  later offer opt-in helper/teacher queues, review-age tracking and reassignment.
  Never automatically make a private take public or expand its audience for coverage.
- Notifications for invitations, received feedback and review needs; verify actual
  delivery and user controls rather than assuming a stored event notifies anyone.
- Cooperative or competitive formats, completion points and public recognition
  are distinct configurations. Avoid scoring raw fluency against beginners.
- Daily reminders, opt-out, quiet hours and local-day handling. No manipulative
  requirement to recruit three people or lose all progress after one missed day.
- Online discovery/chess-style asynchronous challenges and later two-minute formats
  after the local community and moderation process are useful.

## D. Speaking, evidence and learning progress

- Existing short phrase → native example → explicit recording → replay → retry/save
  is the event demonstration candidate. Reuse shared course-aware components.
- Native and learner pitch graphs, optional hertz detail, understandable contours.
  Dialect-aware comparison; uncertain audio remains uncertain. Pitch alone is not
  a pronunciation certificate. English activities use suitable stress/intonation.
- Seven small activities connect event conversations to daily local/social language.
  Record attempts and completion, not fictional learning gains. Compare an initial
  and later attempt without promising quantified improvement from attendance.
- Private progress, learner-controlled shared recordings and helpful peer feedback.
  Helpful votes describe community appreciation, not reviewer qualifications.
- Optional research/tester feedback with separate explicit consent. Honest criticism
  qualifies equally; no demand for positive public reviews, automatic voice training
  or silent model improvement from event recordings.
- Later verified AI speech feedback, meaningful audio alignment and tone evaluation
  require acoustic evidence and quality review. A transcript is not proof of a tone.
- Human voice chat, live video practice, teacher-led class sessions, transcripts,
  classroom settings, business accounts and eventually authorized teacher avatars
  are distinct future projects. Reuse existing classroom capability where applicable;
  do not promise to replace Zoom or impersonate/clone a teacher at this stage.

## E. Event memory, identity and reconnecting

- Private profile timeline of attended event dates/venues, partners and activities,
  connected to actual check-in/session records, not RSVP alone.
- Profile links and mutual connect → messaging, with block/report and access controls
  from the first messaging release. Reconnecting should avoid needing phone numbers
  without turning attendance into permission for unsolicited contact.
- Equivalent event history may appear in DaLat and EZViệt through shared data, with
  one source for each record. Do not expose private profiles or venue locations.
- Verified shared Deovia identity, account-link recovery and learning profile creation;
  no copying passwords, name-based merging or assumed cross-domain session cookies.
  A companion identity discussion was architecture-only in prior evidence; recheck
  the other work before depending on it or starting a competing implementation.

## F. Incentives and promotion concepts

- Owner considered a completion-based draw and ₫1m, ₫2.5m, ₫5m or ₫10m cash prizes;
  winner-and-friends hospitality; food credits; shirts; opt-in Hall of Fame across
  EZViệt and the language-exchange community; future venue/sponsor packages.
- All are ideas, not an approved budget or offer. “Open bar/all you can eat for your
  friends” needs a guest cap, included items, time window, sponsor and total liability.
- First recommendation was a capped pilot reward fund, e.g. ₫1m total, with earned
  food credits as an alternative to randomness. Venue costs and terms remain unknown.
- If a draw is chosen, define entry rules, completion threshold, eligibility dates,
  attendance requirement, maximum buddy bonuses, duplicate-account checks, selection
  method, prize fulfillment and disclosures before recruitment. A second event's
  return-attendance condition must be stated up front, not added after completion.
- Do not equate number of invites, microphone time, high peer ratings or positive
  feedback with prize eligibility. Proposed MVP: one completion record/person/cohort.
- Confirm applicable Vietnamese promotion rules before a public cash/draw campaign.
  Official reference: https://dichvucong.moit.gov.vn/VdxpTTHCOnlineDetail.aspx?DocId=424
  describes a registration procedure, not a case-specific legal determination.
- Flyers, community announcements and the host introduction should advertise only
  features rehearsed end to end and prizes with finalized terms. No posting or
  invitation delivery is authorized by this planning document.

## Proposed sequencing and success measures

1. Next event: attendance/playing, tables, partner card, two reliable rounds, one
   existing speaking activity; add verified seven-day invitation/completion if ready.
2. First week: measure activity starts/completions, accepted buddy invitations,
   failed saves, unresolved reviews and next-event return. Ask a short optional
   “What was confusing?” question independently from reward qualification.
3. Next iteration: private event memory and mutual reconnect, useful notifications,
   helper coverage, small capped reward experiment and venue service improvements.
4. After evidence: more durations/group formats, online practice, sponsor programmes,
   ambassador templates and multi-venue operations.
5. Separate later business track: teacher live sessions, richer AI evaluation and
   consented avatars. Do not let this replace or delay the event foundation.

Track both learner value and operating effort: completed short practices, returning
learners, connection acceptance, reduced host interventions, noise/comfort feedback,
order errors, staff interruptions, fulfillment times and actual reward cost per
returning learner. Targets and outcomes are not yet measured.

## Maintenance

Future implementation should link its PR/commit and verification evidence here,
move only actually delivered items into implemented status, and update owning
EZViệt feature docs through its mandatory review workflow. Keep this idea inventory
as historical context; current product behavior belongs in the live knowledge base.

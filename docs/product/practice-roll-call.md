# Host roll call before pairing

Requested 4 November 2026: before starting the event game, ask who is really there
and mark absent players with an X.

The event's host practice panel opens with its existing checked-in players. The
host confirms each person with a checkmark or marks them absent with X. Pairing is
disabled until every playing person has an answer and at least two are present.
Visitors and working hosts stay outside pairing unless they opt in to play.

Presence is a separate, event-scoped answer in the existing private practice-room
state. It does not delete the arrival, change RSVP history, or penalize an account.
Only authorized event hosts can change presence. Answers persist across refreshes
and devices through the existing revision-checked save; guests cannot self-confirm
or inspect anyone else's roll-call answers. An X can be corrected to present later.

Changing presence clears an unstarted draft so the host reviews the new groups.
Published rounds stay unchanged. A new arrival after a reviewed draft waits for
the next pairing; they do not block starting the already-reviewed group. Before
the next draft, the host confirms the new arrival. Already-published legacy rounds
remain usable after rollout, while new events begin with unconfirmed presence.

The public rehearsal uses the same presence and pairing rules with synthetic people
in browser memory. All roll-call labels and accessible control names use the twelve
existing UI catalogs. No private operational records enter public translations.

Verification: model, mutation authorization/revisions, request validation, locale
routes, and the host roll-call-to-draft-to-start journey have regression coverage.
Production and visual verification are recorded in the release receipt.

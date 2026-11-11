# Private member dating

Release scope: real member profiles, free incoming likes, mutual messaging and
site-wide activity privacy. The earlier isolated design Site remains a demo;
production `/dating` contains no fictional members or simulated messages.

## Member journey

The public, localized `/dating` page is indexable. Sign-in continues back to
`/dating?start=1`. The account must have a confirmed email or phone and a complete,
non-private/non-ghost identity. Members choose their birth year, gender, whom to
meet, an age range, and optional first-date interests. “Meet people” saves and
activates. Settings can pause immediately; pausing does not weaken activity privacy.

A birth year alone represents a one-year age interval. Both endpoints of that
interval must fit the other person's preferences. Members born in the current
18-year boundary year supply a private birthday to establish adulthood. This is
self-declared age eligibility, not an identity-verification badge. Age, email and
phone confirmation do not prove that a person is safe. Underage/impersonation
reports go to the moderation queue.

Each side must enable dating and fit the other's current gender/age boundaries.
A like never bypasses those boundaries. Incoming eligible likes are visible for
free. Two current likes permit messages; a pass, block, pause, suspension or new
incompatible preference closes future messaging and thread access. Passes suppress
rediscovery in both directions. There are no automatic romantic notifications,
read receipts, exact location, public dating badges, paid exceptions or fake counts.

## Privacy and enforcement

All dating tables deny direct anonymous/authenticated Data API access. The private
RPC layer derives the caller from `auth.uid()` and checks eligibility itself.
The activity predicate lives in the unexposed `dating_private` schema; the public
RPC list cannot be used to query another account's privacy status. Never expose
that schema in PostgREST configuration.

New dating members start with activity visible only to themselves and authorized
event hosts. They can choose mutual dating connections or signed-in members.
A separate per-person restriction survives a pass. A block hides activity in both
directions except authorized operational host/staff access. RSVP, recurring-series
and event-People reads obey this rule. Anonymous callers see counts, not identities.

Legacy friend attendance/feed RPCs now bind the requesting account and apply the
same activity predicate. Upload recommendations and series-subscription checks
are caller-bound. Public aggregate count RPCs remain independent of hidden users;
the UI no longer calculates public counts by downloading RSVP rows.

Publicly authored events, existing public posts, photos, screenshots and other
accounts can still identify someone. This release does not claim to retract those.
Existing profile avatars remain public assets; private dating cards only request
trusted Dalat CDN/storage URLs and cannot embed arbitrary tracking images.

Per-account limits cover discovery, profile edits, likes, messages and reports.
Profile, pair and block mutations use consistent advisory locks. A concurrent
pass/block cannot be bypassed by a racing send. Sensitive reads/responses are
private/no-store; no personal dating content enters public translation storage.

## Moderation

`/admin/dating` is available to existing admin/moderator roles. Reports include
reason and optional detail, immediately block the target, and allow authorized
staff to inspect the pair's recent message evidence. Staff can mark reviewed or
suspend dating access. This is a staffed review workflow, not automated safety
certification. Operational ownership stays with the site's existing moderators.

## Release procedure

1. Ship the three aggregate-count callers before restricting RSVP reads.
2. Test both new SQL migrations on real isolated PostgreSQL, including a
   concurrent pass/send test, plus API, UI, avatar-origin and metadata tests.
3. Complete and independently review all 12 UI catalogs. Keep private user text
   out of the translation worker. Audit existing People coverage separately.
4. Apply both dating migrations atomically, record exact sources in migration
   history, and exercise actual-schema synthetic fixtures inside a rolled-back
   savepoint. Verify no fixture accounts, events, messages or reports remain.
5. Land/deploy the app from a verified committed tree. Check public HTML and
   canonical/locale metadata, unauthenticated API responses, private schema
   isolation, and live desktop/mobile navigation before declaring production.

No version scheme exists in this application; release identity is the commit.

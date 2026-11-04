# Deovia accounts — DaLat.app and EZViet

The two products keep their existing Supabase account IDs, profiles, permissions and data.
A verified member is provisioned in the other product when their signed-in browser uses the
app. Visiting the other product can establish its own local session through a short,
browser-bound sign-in handoff. Dormant accounts are provisioned on use, not bulk-copied.

Only a verified email plus display name and avatar can seed a new profile. Existing accounts
are never matched or merged by email. An email collision opens a one-time confirmation flow:
sign in to the existing local account, then explicitly connect it. Different emails can be
linked this way too. No RSVPs, recordings, history, roles, paid tiers, or host privileges move.

## Trust and rollout

Both servers need `DEOVIA_ACCOUNTS_ENABLED=1` and the same random
`DEOVIA_ACCOUNTS_SECRET` (at least 64 characters). Keep the secret server-only in each
hosting project's secret store. Origins are fixed to https://dalat.app and https://ezviet.org;
preview deployments do not become trusted peers. Apply the additive
`20261104060000_deovia_accounts.sql` migration in both projects first. Disable the flag
on both to stop new handoffs without changing existing sessions or data. A handoff starts
only when the peer reports readiness, so deploying one app first does not strand visitors.

Start creates an HttpOnly, Secure, SameSite=Lax browser binding and a random state.
The source verifies its session with Auth, then issues a 90-second code bound to SHA-256
of the browser verifier. Only the authenticated peer server can exchange it; SQL deletes
it atomically so it cannot replay. The destination uses its own Supabase server API to
establish a session only for the linked local user. Session tokens, passwords and email
links never go into redirects. Responses are private/no-store and suppress referrers.

The three private tables and two lookup/consume functions are service-role only. Links
are one-to-one and never overwritten. Onboarding still runs on each product when needed.
Sign-out suppresses automatic sign-in on that site until the user deliberately signs in.
Local logout does not log out the other site. Accounts with verified MFA factors use their
normal local sign-in; this bridge does not bypass MFA. Expired or unavailable handoffs
return to the requested local page. Existing local sign-in remains available.

Public RSVP rosters and in-page RSVP writes are separate work; this change links accounts
without expanding the audience of event, practice or profile data. Guests remain guests.

## Verification

Check provisioning in both directions, an existing-email collision, explicit linking of
independently authenticated accounts, reload and cross-site sign-in, cancellation, logout,
expired/wrong-verifier/replayed codes, anonymous access denial, no permission escalation,
and 375px light/dark login/confirmation. Delete only disposable test identities afterwards.

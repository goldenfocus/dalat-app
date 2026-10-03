# Meet People implementation plan

## Product decision

Meet People extends the existing Dalat identity. The first release helps people find friends, activity companions, collaborators, and useful help. Dating is a separate, private extension of that identity, delivered after the community foundation and contact permissions are working.

The three permissions stay distinct: eligibility allows discovery; mutual interest allows contact; agreement on a specific plan allows a meeting. None implies the next.

The original September 17 meetup target has passed. Validate this release with the next suitable meetup rather than encoding that date or a particular organizer.

## Repository audit

- Next.js App Router, React, Supabase SSR authentication, next-intl, Tailwind/Radix components. Keep the existing stack.
- Existing identity: `profiles`, `app/[locale]/[slug]/profile-content.tsx`, and `components/profile/profile-edit-form.tsx`. Names, photos, and biography stay here.
- `profiles.discoverable` is an existing inviter-search setting, defaulting on; it is not consent to join People.
- Private profiles have separately protected biographies (`20260912004_profile_privacy.sql`). People must honor `is_private` in database access, not just the page.
- Events already have RSVP state and attendee lists. Public-event attendance remains visible under existing policies. People event participation is an additional, clearly explained choice.
- Tribes/community membership and unilateral follows already exist. Neither authorizes private messaging or dating.
- There is no existing private conversation, person blocking, or person safety-report workflow suitable for reuse. Event streaming chat is public and must not become the private messaging backend.
- The translation endpoint invalidates content; the existing Mac mini worker generates translations. Both queue/collector and worker writes need explicit People support.
- Content navigation has room for People. Avoid an eighth mobile bottom-nav icon.
- Rollout preflight confirmed the live site currently runs on Vercel behind Cloudflare: production responses carry `x-vercel-id`, and GitHub records the current main SHA as a Vercel production deployment. The checked-in Wrangler configuration also intentionally has no routes. Preserve that existing deployment path; do not migrate hosting as part of People.

## Phase 1: community discovery

Deliver a working slice:

1. Opt in from profile settings or `/people/edit`; default off. Reuse existing photo/name/bio.
2. Choose community intentions, interests, and languages explicitly. Optional free text: “I can help with” and “I’d love help with.” No required skill or profession.
3. Browse authenticated, opted-in, non-private, non-ghost members at `/people`. Filter by intention/language and search name/help text. Use bounded pagination, substantial profile cards, no swiping or popularity score.
4. Open the existing profile and see its People section only when authorized.
5. Save edits deliberately; allow immediate opt-out without overwriting unsaved draft text.
6. Block within Meet People; explain that existing public profiles and event activity are outside that scope. Offer unblocking in the editor.
7. Report a person privately. Provide an actual staff review queue at `/admin/people-reports`; staff can mark reports reviewed. This queue needs a named human owner before pilot launch.
8. At an event, a current “going” attendee can explicitly share their People profile with signed-in viewers who can access that event. Leaving the RSVP, disabling People, or becoming private revokes consent; rejoining does not silently restore it.

All UI copy is translated in the 12 existing locales. Help text joins the existing translation worker. Original text remains available while translations are pending. User photos keep the existing R2/CDN path.

## Database and privacy contract

Prepared migration: `supabase/migrations/20261107_001_meet_people.sql`. Its ordering follows the existing migration filenames; it does not imply a production application date.

| Object | Purpose and access |
| --- | --- |
| `people_options` | Stable intention/interest/language keys; extend through catalog data and localized copy. |
| `people_profiles` | One row per existing profile; owner edits, signed-in authorized discovery only. No dating/contact/birthday data. |
| `people_blocks` | Owner-visible block records; exclusion works in either direction throughout People. |
| `people_reports` | Reporter and staff access only; staff can change review status. One open report per reporter/target. |
| `event_people` | Separate explicit event consent, subject to event access and current RSVP. |
| `discover_people` | Bounded, parameterized search running with the caller’s RLS. |
| `content_translations` extension | Add `people`, help fields, and a nullable source revision. People translation access follows its source profile visibility. |

No existing public profile fields become a hidden-data store. No service-role client serves People pages or member mutations. Private data is not globally cached or placed in SEO metadata. Discovery pages are noindex, and routes use request-scoped authentication.

Source edits atomically remove prior help translations. Worker writes must carry the exact `content_updated_at` timestamp in `source_updated_at`; a database trigger rejects a job that finishes after a newer edit. Keep full timestamp precision. Opt-out, private profiles, and bilateral blocks hide translations as well as original text.

The migration checks `/people` for an existing route/handle conflict and aborts transactionally instead of renaming someone. A conflict needs a specific resolution before rollout.

Approval is required before applying this migration/RLS change under AGENTS.md Rule 5. Preparation, code, and isolated test databases do not alter production.

## Phase 2: controlled introductions

Add purpose-specific connection requests with pending/accepted/withdrawn/closed states, one outstanding request per pair and purpose, bounded sending, and a quiet close/expiry experience. Ignored and declined requests must not expose read receipts, rejection reasons, or reminders that encourage pursuit.

Start with a short introduction and recipient acceptance. Decide whether a minimal in-app reply thread is necessary for the pilot; do not repurpose public event chat. External contact details (including Zalo) require deliberate sharing after acceptance. Build disconnect/report/block behavior before enabling requests. Existing follows are not connections.

Receiving business, friendship, or activity contact never unlocks dating details. Community moderation must address people using another purpose to bypass unwanted romantic contact.

## Phase 3: private dating

Use separate protected tables and policies; never add romantic fields to `people_profiles` or public identity rows.

- Establish adult eligibility and correction/verification handling before launch; do not infer age from photos.
- Require both people to opt in and meet each other’s explicit hard boundaries for romantic discovery. No exception because someone paid, looks healthy, or wants to try anyway.
- Private mutual interest is the proposed default. Reveal an introduction only after both independently express interest. A direct dating-request inbox remains an explicit optional product choice.
- Keep a person’s age/gender/relationship preferences private. Avoid ethnicity, financial-status filtering, precise location, or inferred preferences in the initial dating release.
- Dating details remain on the existing identity, in a deliberate section visible only to eligible viewers. No romantic badges or interest states in ordinary attendee lists.
- Event attendance is not automatically dating context. Reusing attendance for dating requires separate consent.
- Allow immediate pause, withdrawal, and blocking. Optional timed discoverability expires automatically; it never imposes a minimum period of exposure.
- After mutual interest, offer chat first, a short coffee, or a group activity according to both people’s choices. Confirm a specific meeting; do not auto-book someone’s time or reveal their external contact details.
- No paid secrecy promise or sugar-specific financial-arrangement category in this release. That would require a separate product, moderation, legal, and payment-provider decision.
- Family connections are between adult guardians; no independently discoverable or contactable child profiles.

Open decisions before this phase: adult eligibility method; exact private information shown before/after mutual interest; whether optional direct romantic invitations are worth the community pressure; and who handles safety reports. The earlier brainstorm is not a finalized consent specification for these decisions.

## Validation and rollout

1. Run real PostgreSQL RLS/grant tests with `bash scripts/test-people-sql.sh`. The harness creates a disposable local cluster and never reads production environment files. Include anonymous/member/owner/staff roles, direct writes, blocks, private/ghost/opt-out exclusion, event revocation, translation leakage, route-conflict rollback, and concurrent stale-worker completion.
2. Run targeted API, input-validation, editor, and translation tests. Verify UI errors do not falsely claim a successful opt-out.
3. Run TypeScript, lint on affected code, prebuild guards, and production build. Record unrelated baseline failures separately.
4. Inspect mobile and desktop discovery/editor/event states. Local fixture previews demonstrate presentation and interaction only; do not represent them as a production end-to-end test.
5. Review the prepared migration and obtain approval. Inspect actual remote migration state before applying; never apply unrelated pending migrations opportunistically.
6. Apply the approved migration, deploy the updated translation worker, and enable its `PEOPLE_TRANSLATIONS_ENABLED=true` setting. The approved release sets the public app flag to true in `next.config.ts`; an explicit `NEXT_PUBLIC_PEOPLE_ENABLED=false` build disables it. The translation worker still requires its own explicit flag. Push through the existing Vercel production integration after the required rebase and build.
7. Exercise the real authenticated flows with consenting test accounts before inviting the community. No unsolicited invitations or messages.
8. Run a small meetup pilot. Ask whether members found someone worth meeting/helping, whether the meeting happened, and whether they felt comfortable seeing each other again. Do not optimize for time spent browsing or number of likes.

The release flag hides People navigation and disables its member endpoints; it does not delete member data or revoke database permissions. Pausing the launch and deleting data are separate actions. Never drop the tables as a casual rollback.

Pushes follow the repository’s fetch/rebase/build/push sequence. A rebase conflict stops for user input. Keep this worktree until approval and rollout finish, then remove it under the worktree protocol.

## Implementation status — October 2, 2026

Phase 1 is implemented in the isolated `meet-people` worktree. Phases 2 and 3 remain planned; no connection-request or dating interface is enabled. The user approved rollout with “ship it.” The exact migration was applied to production with its history record in one transaction, then verified against the local file hash and database permissions. No unrelated migration was applied. The approved app release enables People by default at build time, with an explicit false override available.

Validation completed:

- 88 focused Vitest tests passed across API authorization, input validation, profile hydration, translation revisions, editor behavior, event consent, and failure handling.
- 91 real PostgreSQL assertions passed in a disposable local cluster. The harness also verified transactional route-conflict rollback and a concurrent stale translation worker/source-edit race. Final production-schema checks added regressions for nullable RSVP status and hosted default function grants.
- TypeScript, targeted ESLint, whitespace checks, and every prebuild guard passed. The existing translation worker script retains its pre-existing console warnings.
- `NEXT_PUBLIC_PEOPLE_ENABLED=true npm run build` passed, including all 491 static pages. People pages and APIs remain dynamic. The rollout uses the existing Vercel integration confirmed during production preflight.
- Desktop and mobile fixture checks covered discovery, the Vietnamese editor, German event sharing, reporting after blocking, immediate opt-out, and failed withdrawal. German navigation fits 320px and 390px without horizontal overflow. The actual signed-out discovery page shows the sign-in gate and noindex metadata.

Visual interactions used fictional local profiles and mocked writes. The temporary preview route and development server were removed after testing. Authenticated testing against the actual migrated service remains required before community invitations; these local checks do not substitute for it.

Production preflight confirmed the required schema and an unclaimed `/people` route. The report queue still needs active human review during the pilot. Existing public profiles and RSVP lists retain their existing visibility; People controls only its own discovery and event profile sharing, as explained in the interface.

# Tribes Visibility — Design

**Date:** 2026-07-20
**Status:** Approved by Yan — **scope reduced 2026-07-20 after collision discovery** (see "Descoped" below)

> **Descoped to a parallel session.** A concurrent worktree (`worktree-tribes-visibility`, commit `ce2b3b3`, unpushed) already implements §1 (`tribes.member_count` + trigger + backfill, migration `20261015_001_tribe_public_visibility.sql`), §7 (discovery ordering by `member_count DESC`, via a `SECURITY DEFINER` reader rather than `lib/tribes.ts`), and a rewrite of `join-tribe-button.tsx` including 12-locale fixes for its hardcoded English. Those sections are **not built here** and are retained below only as a record of intent.
>
> Their root-cause analysis corrects this spec: the "0 members" problem is not that RLS *hides* rows, it is that **RLS is applied before the aggregate**, so `tribe_members(count)` returns a clean `0` with no error — a public tribe with 3 members advertised "0 members" to every prospective joiner.
>
> **This branch builds only:** §2 `TribeChip`, §3 event page, §4 inline attach, §5 `PATCH /api/events/[slug]/tribe`, §6 moments, and the §8 i18n keys those require.
**Scope:** Phase 1 of promoting tribes — make an event's tribe visible everywhere it matters, and make attaching a tribe a one-tap action. Tribe invite/share flow is Phase 2 and specced separately.

## Context

Tribes are **write-complete but read-invisible**. `components/events/event-form.tsx` has shipped a working "Hosting as" tribe selector since January 2026 (lines 716-717, 776-777) that writes `events.tribe_id` and `events.tribe_visibility`. Nothing in the app has ever read it back:

- `app/[locale]/events/[slug]/page.tsx` (1429 lines) contains **zero** occurrences of "tribe". Its main select pulls `profiles, organizers, event_series, venues` — no `tribes` join.
- All moments surfaces (`app/[locale]/moments/**`, `components/moments/**`) contain zero tribe references.
- `components/tribes/tribe-card.tsx` shows no member or event count.

### Production reality (queried 2026-07-20)

| Metric | Value |
|---|---|
| Tribes | 10 — 1 organic (`the GOAT`, invite_only) + 8 seeded 2026-07-10 + `DaLat Cycling Group` (2026-07-19) |
| Total `tribe_members` rows | **12** — nine tribes have exactly 1 member (the seed leader) |
| DaLat Cycling Group members | 3 |
| Published events | 168 |
| **Events with a `tribe_id`** | **1** (`dalat-15km-cycling-exploration-6bnj`, `tribe_visibility: public`) |
| Profiles | 187 |
| Users reachable by push | 14 (17 subscriptions) |

The constraint is not visibility — it is that events are not attached to tribes and tribes have no members. This design fixes the read path *and* removes the friction on the write path, because a tribe chip that renders on 1 of 168 events changes nothing on its own.

### Decisions (made with Yan)

1. **Inline attach chip** on the event page, not a create-flow-only prompt — it must work for the 167 events that already exist.
2. **Include the counts migration** (Tier A) — cards need signals of life.
3. **No mass invite blast.** An "invite everyone on dalat.app" send would be 173 emails (only 14 users can receive push) through a template layer that covers en/fr/vi only — 9 of 12 locales would silently receive English. Discovery stays in-app and opt-in.

## Components

### 1. Migration — `tribes.member_count` + `tribes.event_count` (Tier A)

Adds two `INTEGER NOT NULL DEFAULT 0` columns to `tribes`, backfilled from current data, maintained by triggers.

Rationale: `tribe_members` RLS (`20260204_001_tribes_v2_fix_recursion.sql`) only reveals rows to members and creators, so an anonymous ISR render counts 0 for every tribe. The 2026-07-10 spec skipped counts for exactly this reason. Denormalized columns on `tribes` — which *is* publicly readable for `public`/`request` access types — are the correct fix and avoid loosening any RLS policy.

- `member_count`: trigger on `tribe_members` INSERT/DELETE/UPDATE OF status, counting rows where `status = 'active'`.
- `event_count`: trigger on `events` INSERT/DELETE/UPDATE OF tribe_id, status, tribe_visibility — counting `status = 'published' AND tribe_visibility = 'public'` only, so a member-only event never leaks its existence through a public count.
- Triggers use `SECURITY DEFINER` and must route through the existing `is_tribe_member()` / `is_tribe_admin()` helpers if they read tribe state, per the recursion incident fixed in `20260204_001`.
- Backfill runs in the same migration, after the columns and before the triggers are attached.
- Migration filename must use a timestamp verified against prod `supabase_migrations.schema_migrations` — not inferred from `ls supabase/migrations/`, which drifts behind prod.

### 2. `TribeChip` — `components/tribes/tribe-chip.tsx` (new, shared)

One component, three consumers (event page, moments, album). Props: `tribe` (slug, name, cover_image_url, settings), `size`, and optional `showJoin`.

- Renders tribe avatar (same `cover_image_url` → `settings.avatar_url` → gradient-initial fallback chain as `TribeCard`, extracted to a shared helper rather than duplicated) + name + `t("tribeLabel")`.
- Whole chip is a `Link` to `/tribes/[slug]`, ≥44px touch target, `active:scale-95` per the touch-target conventions in CLAUDE.md.
- **Join affordance** (`showJoin`), shown to signed-in non-members on the event page. `join-tribe-button.tsx` is being rewritten by the parallel session, so this branch must not import or edit it. Instead the chip renders a compact join **only for `access_type === 'public'`** — a single POST to the existing `/api/tribes/[slug]/membership`, no modal, no new branching. `request` / `invite_only` / `secret` chips simply link to the tribe page, where the full access-type flow already lives.
- Hidden for signed-out visitors and existing members.

### 3. Event page — `app/[locale]/events/[slug]/page.tsx`

- Extend the main select to join `tribes(id, slug, name, cover_image_url, settings, access_type)`.
- Render `TribeChip` adjacent to the existing organizer attribution.
- **Visibility rule:** render the chip whenever `tribe_id` is set. This does not leak anything — an event with `tribe_visibility = 'members_only'` is already hidden from non-members by the `events_select_visible` RLS policy, so anyone who can see the page is entitled to see which tribe hosts it.

### 4. Inline attach control — `components/events/event-tribe-attach.tsx` (new)

Rendered in place of `TribeChip` when the viewer may edit the event and `tribe_id` is null; rendered alongside it (as a small "change" affordance) when set.

- Visible only to the event owner (`created_by === user.id`) or an admin — mirrors the `events_update_owner` and `events_update_admin` policies.
- Options come from `GET /api/tribes/me`, filtered to `leader` / `admin` roles — identical to the existing filter in `event-form.tsx:391`.
- Writes through a new `PATCH /api/events/[slug]/tribe`.

### 5. `PATCH /api/events/[slug]/tribe` (new)

Body: `{ tribe_id: string | null, tribe_visibility?: 'public' | 'members_only' }`.

**This route exists because RLS is not sufficient.** `events_update_owner` authorizes on event ownership only — it does not check the *target tribe*. Without a server-side guard, any user could attach their own event to any tribe, surfacing it to that tribe's members and on its tribe page. The route must:

1. Authenticate; 403 if not the event owner or an admin.
2. When `tribe_id` is non-null, verify the caller is `leader` or `admin` of that tribe; 403 otherwise.
3. Default `tribe_visibility` to `'public'` on attach — the inline chip is a promotion action, and `members_only` (the column default) would hide the event from the feed, which is the opposite of intent. Changing visibility to members-only stays in the full event form.
4. Return the updated tribe so the chip can re-render without a page reload.

### 6. Moments — tribe context

`app/[locale]/moments/[id]/page.tsx` already selects `events!moments_event_id_fkey(*)` (line 43), so `tribe_id` is present with no query change; it needs the nested `tribes(...)` join added. Moments inherit their tribe transitively from their event — **no schema change, no `moments.tribe_id` column**. Render `TribeChip` in the moment detail and album header.

### 7. Discovery ordering — `lib/tribes.ts`

`getDiscoverTribes()` orders `created_at` ascending, so `DaLat Cycling Group` — the newest tribe and the only one with real membership — sorts **last of 10**, and is the tribe most likely cut off in the 8-item homepage strip. Reorder by `member_count DESC, event_count DESC, created_at ASC` and extend `DiscoverTribe` with the two counts.

The strip's 8-item cap stays. With 10 tribes, "see all" reveals 2 more; the cap is not the constraint.

### 8. i18n

New keys under the existing `tribes` namespace, added to **all 12** `messages/*.json` before any component uses them: `tribeLabel`, `addToTribe`, `changeTribe`, `attachSuccess`, `attachFailed`, `noTribesToAttach`, `memberCount` (ICU plural), `eventCount` (ICU plural).

`tribes` and `events` are both already registered in `lib/i18n/client-namespaces.ts` (lines 20, 76 and 10, 43) — no registration change needed. The namespace guard must pass, and deploy must be verified green after push (the 2026-07-09 incident: a missing client-namespace registration failed 3 consecutive prod deploys for ~1h while every session smoke-tested the last good deployment).

## Explicitly out of scope

- Tribe invite/share flow (invite by link, email, username) — **Phase 2, separate spec.**
- Any mass/admin blast to all users.
- `moments.tribe_id` denormalization.
- Join affordance on the *moments* chip (event page only in Phase 1).
- Backfilling tribes onto the 167 unattached events.

## Pre-existing defects found, not fixed here

Recorded so they are not lost. Each is outside this change's blast radius; fixing them is not required for Phase 1 and would violate the surgical-changes rule.

1. **The invite code is unreachable for every discoverable tribe.** `components/tribes/tribe-settings-modal.tsx` gates the invite-code block behind `access_type === "invite_only" || "secret"`, but discovery lists only `public`/`request`. The 9 findable tribes are exactly the 9 with no invite affordance. **This is the direct cause of "I don't even have an invite button" and is the core of Phase 2.**
2. **Hardcoded English in `tribe-settings-modal.tsx`:** `<p …>Share link: {inviteUrl}</p>` — a direct violation of the 12-locale rule. Phase 2 fixes it as part of rebuilding that surface.
3. **`handleCopyCode` copies the raw code, not the share URL** — same file.
4. **Dead invite backend.** `app/api/tribes/[slug]/contacts/bulk-invite/route.ts`, `components/tribe/contact-list.tsx`, `components/tribe/contact-upload.tsx` (note singular `components/tribe/`) are imported nowhere. The route also selects `events.start_time`, a column that does not exist (it is `starts_at`), so every email it sent would render `Invalid Date`. Phase 2 decides whether to wire it up or delete it.
5. **`components/tribes/my-tribes-dropdown.tsx`** — built, never mounted, still dead since the 2026-07-10 handover.
6. **Notification templates cover en/fr/vi only** (`lib/notifications/templates.ts:45-51`); the other 9 locales silently fall back to English. Blocking for any tribe-invite email in Phase 2.

## Verification

1. Migration applied — confirm against prod `supabase_migrations.schema_migrations`, and verify `member_count` on `DaLat Cycling Group` reads 3 and `event_count` reads 1.
2. Local build green, including the client-namespace guard.
3. `/events/dalat-15km-cycling-exploration-6bnj` renders the DaLat Cycling Group chip; clicking it lands on the tribe page.
4. As owner, an unattached event shows "Add to a tribe"; attaching persists and the chip renders.
5. **Authorization test:** a user who is not leader/admin of a tribe receives 403 from `PATCH /api/events/[slug]/tribe` for that tribe.
6. `/vi/events/<slug>` renders Vietnamese chip copy; no `MISSING_MESSAGE` in any of the 12 locales.
7. Homepage strip lists DaLat Cycling Group first.
8. Post-push: poll `gh api repos/<owner>/<repo>/commits/<sha>/status` until **success** before ending the session.

## Risks

- **Counts drift** if a trigger misses a path. Mitigated by counting from a single source per column and backfilling in the same migration; a re-backfill statement is idempotent and can be re-run.
- **Migration is Tier A** — SQL is presented to Yan for approval before it runs against prod.
- **Attach is a promotion action with a visibility side effect** (defaults to `public`). Stated in the UI copy so an organizer is not surprised that attaching also publishes to the feed.

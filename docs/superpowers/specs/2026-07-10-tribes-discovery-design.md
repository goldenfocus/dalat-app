# Tribes Discovery — Design

**Date:** 2026-07-10
**Status:** Approved by Yan (lean launch, seeded tribes, homepage strip)
**Scope:** The missing front door for tribes: a `/tribes` index page, a homepage discovery strip, and seed content. Detail pages, create flow, join-by-code, API, RLS, and notifications already exist and are not modified.

## Context

Tribes shipped as a complete backend + detail experience (migrations `20260130_001_tribes_v2.sql` et al., `app/[locale]/tribes/[slug]`, `/new`, `/join/[code]`, `GET/POST /api/tribes`) but no discovery surface was ever built. `/tribes` 404s, nothing links to tribes, and `components/tribes/my-tribes-dropdown.tsx` was built but never mounted. Prod has 1 invite-only tribe and 1 member — the index would be empty without seeding.

Access types: `public` (instant join), `request` (approval), `invite_only`, `secret`. The existing list query filters to `access_type IN ('public','request') AND is_listed = true` — the index inherits exactly this visibility rule, so invite-only/secret tribes never appear.

## Decisions (made with Yan)

1. **Seed starter tribes** before launch (~8, owned by Yan's account) — page never launches empty.
2. **Homepage strip** is the sole new entry point. No bottom-nav change, no desktop header change, no user-menu change (deferred).
3. **Lean launch (approach A):** no search, no categories, no schema changes. Rich-directory features deferred until tribe count warrants them.

## Components

### 1. `/tribes` index — `app/[locale]/tribes/page.tsx`

- Server component, ISR: data via `unstable_cache` + `createStaticClient` (never `createClient` — ISR rule in CLAUDE.md), `revalidate: 300`.
- Query (same visibility rule as `GET /api/tribes`): listed public/request tribes with member count; ordered by member count desc, then `created_at` desc. No creator join — cards don't display the creator. No pagination at launch (single fetch, cap 60).
- Page header: translated title + subtitle, "Start a tribe" button → `/tribes/new`.
- Grid of `TribeCard`s: 2-col mobile → 3-col desktop.
- Empty state (defensive; should not render post-seed): mist-vibe founder CTA → `/tribes/new`.
- `generateMetadata`: translated title/description, OG/canonical per engine-optimization defaults; `CollectionPage` JSON-LD via `lib/structured-data`.
- Fetch failure → empty array → empty state. Never 500s the page.

### 2. `TribeCard` — `components/tribes/tribe-card.tsx`

- Tribe-identity-first: cover/avatar if present, else deterministic gradient + tribe initial (seeded tribes share one owner; creator identity is deliberately not shown on cards).
- Name, description (`line-clamp-2`), member count (pluralized i18n key), access badge: "Open" (`public`) / "Request to join" (`request`).
- Whole card is a `Link` to `/tribes/[slug]`, ≥44px touch target, `active:scale` feedback per touch-target conventions.

### 3. Homepage strip — `components/home/tribes-strip.tsx`

- Server component following the `MomentsStripServer` pattern; placed after `ForYouSection` in `app/[locale]/page.tsx`.
- Same cached fetch as the index (shared `unstable_cache` function in `lib/tribes.ts`, exported for both surfaces), shows up to 8 tribes, horizontal scroll, "See all" → `/tribes`.
- Renders nothing (returns `null`) if fetch is empty/fails — homepage is never degraded by tribes.

### 4. i18n

- New keys under the existing `tribes` namespace: `discoverTitle`, `discoverSubtitle`, `startTribe`, `seeAll`, `memberCount` (ICU plural), `accessOpen`, `accessRequest`, `emptyTitle`, `emptyCta`, `findYourTribe` (strip heading).
- Added to **all 12** `messages/*.json` first, then used in components.
- `tribes` is already registered in `lib/i18n/client-namespaces.ts` — no registration change needed. Guard (`scripts/check-client-namespaces.mjs`) must pass; deploy must be verified green after push (Jul 9 incident).
- Tribe names/descriptions are user content shown as-is; adding tribes to the content-translation pipeline is out of scope.

### 5. Seeding — `scripts/seed-tribes.mjs`

- One-time script; credentials from env (`SUPABASE_SERVICE_ROLE_KEY` via `.env.local` / vault) — **never hardcoded** (Jul 9 security-review finding on sibling scripts).
- Owner resolved at runtime: `profiles` row matching `SEED_OWNER_USERNAME` env var (script exits with a clear error if unset or not found — no guessing).
- Inserts 8 tribes: Hiking & Trails, Coffee Crawl, Pickleball Đà Lạt, Digital Nomads, Photography Walks, Food Adventures, Sunrise Runners, Board Games & Chill — `access_type: 'public'`, `is_listed: true`, slugs kebab-case, descriptions in the Dalat vibe (warm, cheeky, no corporate).
- Idempotent: skips a slug that already exists.
- Run once against prod after the code deploys; tribes are editable/deletable through the existing UI afterward.

## Explicitly out of scope

Search/filters/categories, my-tribes dropdown mounting, bottom-nav changes, tribe content translation, tribe cover-image upload flow changes, pagination.

## Verification

1. Local: build green (includes namespace guard), `/tribes` renders seeded data against prod DB in dev.
2. Post-push: poll `gh api .../commits/<sha>/status` until deploy **success** (mandatory).
3. Prod: `/tribes` 200 + shows seeded tribes; `/vi/tribes` shows Vietnamese UI strings; homepage strip visible with "See all"; tribe card click lands on detail page; Lighthouse-visible layout shift none (strip below the fold).

## Risks

- ISR staleness: member counts lag ≤5 min — acceptable.
- Seeded tribes all owned by one account — mitigated by tribe-identity-first cards; Yan can transfer leadership later (modal exists).
- Homepage strip adds one cached query to the homepage render — same pattern/cost as existing strips.

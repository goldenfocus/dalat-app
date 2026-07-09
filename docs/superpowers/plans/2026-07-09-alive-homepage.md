# Alive Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage feel alive — real photos from past occurrences as covers for imageless recurring events, past-proof social lines instead of "0 going", organizer auto-RSVP everywhere, and a small kill-switchable ghost boost.

**Architecture:** All new data is resolved **write-time** by a nightly SQL function into denormalized columns on `events` — the fragile `RETURNS TABLE` feed RPCs (`get_events_by_lifecycle_deduplicated`, `get_upcoming_events_paginated`, `get_homepage_moments_strip`) are **never modified**. Cards receive the new data via a batch fetch that mirrors the existing `get_event_counts_batch` pattern. Ghost membership lives in a service-role-only table invisible to the public API.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), next-intl (12 locales), Vercel cron, vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-alive-homepage-design.md`

## Ground truth (verified 2026-07-09)

- Remote DB migrations synced through version `20260921`. New migrations MUST use `20260925_*` or later.
- ⚠️ `supabase/migrations/20260803b_001_smart_reminders.sql` (untracked, other session) is **silently skipped** by the CLI (letter in timestamp). Its `rsvps.reminder_7d_sent_at` etc. columns DO NOT exist in prod. **Do not reference them.**
- `moments`: owner col is `user_id`, media kind col is `content_type` (`'photo'`,`'image'` = photos), published status is `'published'`, media in `media_url`. Quality: `moment_metadata.quality_score` (join `moment_id = moments.id`, use `COALESCE(mm.quality_score, 0.5)`).
- `rsvps`: `(event_id, user_id)` UNIQUE, `status` in `going|waitlist|interested|cancelled`, `plus_ones int`, `no_show_at timestamptz` (from `20260803_001_event_checkin.sql`), `created_at`.
- `events`: `image_url`, `cover_moment_id`, `series_id`, `capacity` (NULL = unlimited), `created_by`, `organizer_id`, `status` in `draft|published|cancelled`, `starts_at`, `source_platform` (NULL or `'manual'` = native; `facebook|instagram|luma|...` = imported).
- Series occurrences: inserted app-side by `app/api/series/route.ts`; DB trigger `on_series_event_created` → `auto_rsvp_for_series_subscribers()` (`20260129_001_recurring_events.sql:121-143`) fires AFTER INSERT on events with `series_id`. **Creator is NOT auto-RSVP'd there** — that's our hook.
- Counts pattern: `lib/cache/server-cache.ts` → `getCachedEventCountsBatch` → RPC `get_event_counts_batch` → `counts` map → `EventGrid` → cards. Cards render `spotsText = capacity ? "{going_spots}/{capacity}" : "{going_spots}"`.
- Cards used by `EventGrid` (components/events/event-grid.tsx): `EventCardFramed` (default, L188), `EventListCard` (list view), `EventImmersiveCard` (immersive view), `EventCardCompact` (compact density, receives NO counts). `EventHeroCard` used for "Happening Now".
- Cover pattern in every card: `hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url)`, else `<EventDefaultImage>`.
- Homepage feed: `components/events/event-feed-scrollable.tsx` (fetches lifecycle events L31-35 + counts batch L45, renders EventGrid L111-116). Upcoming page: `app/[locale]/events/upcoming/[[...page]]/page.tsx` (own `getEventCounts` aggregating `rsvps` in JS, L120-147).
- Cron pattern: copy `app/api/cron/mark-no-shows/route.ts` — `GET`, `Bearer ${CRON_SECRET}` auth, lazy service-role client, register in `vercel.json`.
- Notifications: `notifications` table, INSERT is service-role-only; app-side insert pattern in `lib/notifications/channels/in-app.ts:38-68`. `notification_type` is an ENUM (no photographer type yet — we add `'photo_featured'`).
- i18n: card strings in `events.*` namespace; 12 files in `messages/`: de,en,es,fr,id,ja,ko,ms,ru,th,vi,zh.
- Tests: vitest (`npm run test:run`), config `vitest.config.ts`, existing tests are `hooks/*.test.ts`.
- Loyalty/points: app-side only (`awardPoints` in `app/api/notifications/rsvp/route.ts:92`) — SQL-inserted ghost RSVPs never earn points. `new_rsvp` organizer notifications are also app-side — SQL inserts don't fire them.

---

## Phase 1 — Real History

### Task 1: Migration — columns, refresh function, triggers, backfill

**Files:**
- Create: `supabase/migrations/20260925_001_alive_homepage.sql`

- [ ] **Step 1: Write the migration file** with the following content:

```sql
-- Alive Homepage Phase 1: fallback covers from past occurrences, past-proof
-- stats, organizer auto-RSVP, seed_profiles registry (empty until Phase 2).
-- Spec: docs/superpowers/specs/2026-07-09-alive-homepage-design.md
-- NOTE: does NOT touch get_events_by_lifecycle_deduplicated /
-- get_upcoming_events_paginated / get_homepage_moments_strip.

-- 1) New denormalized columns on events (write-time resolved)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS fallback_image_url text,
  ADD COLUMN IF NOT EXISTS fallback_moment_id uuid,
  ADD COLUMN IF NOT EXISTS fallback_photo_credit text,
  ADD COLUMN IF NOT EXISTS last_occurrence_went int,
  ADD COLUMN IF NOT EXISTS last_occurrence_photos int;

-- 2) Ghost registry — SERVICE ROLE ONLY. RLS enabled with no policies =
-- deny-all for anon/authenticated; service role bypasses RLS.
-- Created in Phase 1 so stats functions can exclude it from day one.
CREATE TABLE IF NOT EXISTS seed_profiles (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seed_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seed_profiles FROM anon, authenticated;

-- 3) Notification type for photographer credit
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_featured';

-- 4) Nightly refresh: resolve fallback cover + past-proof stats for upcoming
-- imageless series events. Returns newly-credited photographers so the cron
-- route can notify them (one-time: only rows whose fallback_moment_id changed).
CREATE OR REPLACE FUNCTION refresh_fallback_covers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_credited jsonb;
BEGIN
  CREATE TEMP TABLE tmp_fallback ON COMMIT DROP AS
  WITH upcoming AS (
    SELECT e.id, e.series_id, e.title, e.slug,
           e.fallback_moment_id AS old_moment_id
    FROM events e
    WHERE e.status = 'published'
      AND e.starts_at > now()
      AND e.series_id IS NOT NULL
      AND (e.image_url IS NULL OR e.image_url = '')
  ),
  prev AS (
    -- most recent PAST occurrence in the same series
    SELECT DISTINCT ON (u.id)
      u.id AS upcoming_id, u.title, u.slug, u.old_moment_id,
      p.id AS prev_event_id, p.cover_moment_id
    FROM upcoming u
    JOIN events p ON p.series_id = u.series_id
      AND p.starts_at < now()
      AND p.status = 'published'
    ORDER BY u.id, p.starts_at DESC
  ),
  best AS (
    -- best photo of that occurrence: organizer-curated cover_moment_id wins,
    -- then quality score (same preference order as the moments strip — but
    -- computed here, write-time, NOT in the strip RPC)
    SELECT DISTINCT ON (pr.upcoming_id)
      pr.upcoming_id,
      m.id AS moment_id, m.media_url, m.user_id AS photographer_id,
      prof.username AS photographer_username
    FROM prev pr
    JOIN moments m ON m.event_id = pr.prev_event_id
      AND m.status = 'published'
      AND m.content_type IN ('photo', 'image')
      AND m.media_url IS NOT NULL AND m.media_url <> ''
    LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
    JOIN profiles prof ON prof.id = m.user_id
    ORDER BY pr.upcoming_id,
      CASE WHEN pr.cover_moment_id = m.id THEN 0 ELSE 1 END,
      COALESCE(mm.quality_score, 0.5) DESC,
      m.created_at DESC
  ),
  stats AS (
    SELECT pr.upcoming_id,
      (SELECT COALESCE(SUM(1 + r.plus_ones), 0)::int
         FROM rsvps r
        WHERE r.event_id = pr.prev_event_id
          AND r.status = 'going'
          AND r.no_show_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM seed_profiles s
                           WHERE s.profile_id = r.user_id)) AS went,
      (SELECT COUNT(*)::int
         FROM moments m
        WHERE m.event_id = pr.prev_event_id
          AND m.status = 'published'
          AND m.content_type IN ('photo', 'image')) AS photos
    FROM prev pr
  )
  SELECT pr.upcoming_id, pr.title, pr.slug, pr.old_moment_id,
         b.moment_id, b.media_url, b.photographer_id, b.photographer_username,
         s.went, s.photos
  FROM prev pr
  LEFT JOIN best b ON b.upcoming_id = pr.upcoming_id
  JOIN stats s ON s.upcoming_id = pr.upcoming_id;

  -- newly credited photographers (moment changed and exists)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'event_id', t.upcoming_id,
    'event_title', t.title,
    'event_slug', t.slug,
    'moment_id', t.moment_id,
    'photographer_id', t.photographer_id,
    'photographer_username', t.photographer_username
  )), '[]'::jsonb)
  INTO v_credited
  FROM tmp_fallback t
  WHERE t.moment_id IS NOT NULL
    AND t.moment_id IS DISTINCT FROM t.old_moment_id;

  UPDATE events e
  SET fallback_image_url = t.media_url,
      fallback_moment_id = t.moment_id,
      fallback_photo_credit = t.photographer_username,
      last_occurrence_went = t.went,
      last_occurrence_photos = t.photos
  FROM tmp_fallback t
  WHERE e.id = t.upcoming_id
    AND (e.fallback_moment_id IS DISTINCT FROM t.moment_id
      OR e.fallback_image_url IS DISTINCT FROM t.media_url
      OR e.last_occurrence_went IS DISTINCT FROM t.went
      OR e.last_occurrence_photos IS DISTINCT FROM t.photos);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated,
                            'credited', v_credited);
END;
$$;
REVOKE ALL ON FUNCTION refresh_fallback_covers() FROM anon, authenticated, public;

-- 5) Deletion hygiene: a deleted/unpublished moment must never linger as a
-- cover (red-team: consent + stale OG images).
CREATE OR REPLACE FUNCTION clear_fallback_on_moment_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.status <> 'published' THEN
    UPDATE events
    SET fallback_image_url = NULL,
        fallback_moment_id = NULL,
        fallback_photo_credit = NULL
    WHERE fallback_moment_id = OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS on_moment_removed_clear_fallback ON moments;
CREATE TRIGGER on_moment_removed_clear_fallback
AFTER DELETE OR UPDATE OF status ON moments
FOR EACH ROW EXECUTE FUNCTION clear_fallback_on_moment_removal();

-- 6) Creator auto-RSVP on series occurrence generation.
-- COPY THE ENTIRE EXISTING FUNCTION BODY from
-- supabase/migrations/20260129_001_recurring_events.sql:121-143
-- (auto_rsvp_for_series_subscribers) and append the creator block below
-- BEFORE "RETURN NEW;". Do NOT rewrite the subscriber logic from scratch.
--
--   -- Auto-RSVP the series creator (skip imported events: one importer
--   -- avatar "going" to every scraped event is anti-social-proof and
--   -- pollutes get_recommended_events' ln(1+going) ranking)
--   IF NEW.created_by IS NOT NULL
--      AND (NEW.source_platform IS NULL OR NEW.source_platform = 'manual') THEN
--     INSERT INTO rsvps (event_id, user_id, status, plus_ones)
--     VALUES (NEW.id, NEW.created_by, 'going', 0)
--     ON CONFLICT (event_id, user_id) DO NOTHING;
--   END IF;

-- 7) Backfill: organizer RSVP on UPCOMING events only.
-- Guards (red-team): upcoming-only (auto_mark_no_shows must not brand
-- organizers no-shows on past events); created_at backdated past the 7-day
-- get_friend_activity() window (no feed flood); skip imported events; skip
-- full events (never displace capacity); ON CONFLICT keeps explicit
-- cancelled/interested choices.
INSERT INTO rsvps (event_id, user_id, status, plus_ones, created_at)
SELECT e.id, e.created_by, 'going', 0, now() - interval '8 days'
FROM events e
WHERE e.status = 'published'
  AND e.starts_at > now()
  AND e.created_by IS NOT NULL
  AND (e.source_platform IS NULL OR e.source_platform = 'manual')
  AND (e.capacity IS NULL OR
       (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM rsvps r
         WHERE r.event_id = e.id AND r.status = 'going') < e.capacity)
ON CONFLICT (event_id, user_id) DO NOTHING;
```

When appending the creator block in section 6, first paste the verbatim current body of `auto_rsvp_for_series_subscribers()` from `20260129_001_recurring_events.sql:121-143` into a `CREATE OR REPLACE FUNCTION` statement, then insert the commented block as real code before `RETURN NEW;`.

- [ ] **Step 2: Dry-run**

Run: `npx supabase db push --dry-run`
Expected: lists exactly `20260925_001_alive_homepage.sql` as pending (20260803b will be reported skipped — pre-existing, not ours).

- [ ] **Step 3: Push and verify applied**

```bash
npx supabase db push
npx supabase migration list | tail -5
```
Expected: `20260925` present in BOTH local and remote columns. **Do not proceed until confirmed** (Mar 4 scar tissue).

- [ ] **Step 4: Run the refresh once and spot-check**

Create `/private/tmp/.../check.sql` is not available here; use a one-off script `scripts/run-refresh-fallback.mjs`:

```js
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data, error } = await supabase.rpc("refresh_fallback_covers");
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
const { data: sample } = await supabase
  .from("events")
  .select("slug, fallback_image_url, fallback_photo_credit, last_occurrence_went, last_occurrence_photos")
  .not("fallback_image_url", "is", null)
  .limit(5);
console.table(sample);
```

Run: `set -a; source .env.local; set +a; node scripts/run-refresh-fallback.mjs` (or `vercel env pull` first if `.env.local` lacks the service key).
Expected: `ok: true`, `updated > 0` (the weekly English/Jam/Karaoke events have past occurrences with photos), sample rows show real `cdn.dalat.app` URLs and sane went/photos numbers.

- [ ] **Step 5: Verify seed_profiles is invisible to the public API**

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/seed_profiles?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | head -c 300
```
Expected: `[]` or a permission error — never rows. (RLS deny-all + revoke.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260925_001_alive_homepage.sql scripts/run-refresh-fallback.mjs
git commit -m "feat: alive homepage phase 1 schema — fallback covers, past-proof stats, organizer auto-RSVP"
```

### Task 2: Social-proof helper (TDD)

**Files:**
- Create: `lib/events/social-proof.ts`
- Test: `lib/events/social-proof.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  MIN_VISIBLE_GOING,
  shouldShowGoingCount,
  getCardCoverUrl,
  getPastProof,
  type EventSocial,
} from "./social-proof";

const social = (o: Partial<EventSocial> = {}): EventSocial => ({
  event_id: "e1",
  fallback_image_url: null,
  fallback_photo_credit: null,
  last_occurrence_went: null,
  last_occurrence_photos: null,
  ...o,
});

describe("shouldShowGoingCount", () => {
  it("hides counts below threshold (the '0 going' killer)", () => {
    expect(shouldShowGoingCount(0)).toBe(false);
    expect(shouldShowGoingCount(2)).toBe(false);
  });
  it("shows counts at/above threshold", () => {
    expect(shouldShowGoingCount(MIN_VISIBLE_GOING)).toBe(true);
    expect(shouldShowGoingCount(12)).toBe(true);
  });
  it("treats undefined counts as hidden", () => {
    expect(shouldShowGoingCount(undefined)).toBe(false);
  });
});

describe("getCardCoverUrl", () => {
  it("prefers a real uploaded image", () => {
    expect(
      getCardCoverUrl("https://cdn.dalat.app/event-media/x.jpg",
        social({ fallback_image_url: "https://cdn.dalat.app/moments/y.jpg" }))
    ).toBe("https://cdn.dalat.app/event-media/x.jpg");
  });
  it("falls back to the past-occurrence moment", () => {
    expect(
      getCardCoverUrl(null,
        social({ fallback_image_url: "https://cdn.dalat.app/moments/y.jpg" }))
    ).toBe("https://cdn.dalat.app/moments/y.jpg");
  });
  it("returns null when nothing available (card shows default)", () => {
    expect(getCardCoverUrl(null, social())).toBeNull();
    expect(getCardCoverUrl(null, undefined)).toBeNull();
  });
  it("ignores the default-image url as a custom image", () => {
    expect(
      getCardCoverUrl("/images/defaults/event-default-desktop.png", social())
    ).toBeNull();
  });
});

describe("getPastProof", () => {
  it("returns both stats when both are meaningful", () => {
    expect(getPastProof(social({ last_occurrence_went: 12, last_occurrence_photos: 40 })))
      .toEqual({ kind: "both", went: 12, photos: 40 });
  });
  it("photos-only when went is small", () => {
    expect(getPastProof(social({ last_occurrence_went: 2, last_occurrence_photos: 40 })))
      .toEqual({ kind: "photos", went: 2, photos: 40 });
  });
  it("went-only when no photos", () => {
    expect(getPastProof(social({ last_occurrence_went: 12, last_occurrence_photos: 0 })))
      .toEqual({ kind: "went", went: 12, photos: 0 });
  });
  it("null when nothing meaningful", () => {
    expect(getPastProof(social({ last_occurrence_went: 1, last_occurrence_photos: 0 }))).toBeNull();
    expect(getPastProof(social())).toBeNull();
    expect(getPastProof(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/events/social-proof.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { isDefaultImageUrl } from "@/lib/media-utils";

export interface EventSocial {
  event_id: string;
  fallback_image_url: string | null;
  fallback_photo_credit: string | null;
  last_occurrence_went: number | null;
  last_occurrence_photos: number | null;
}

export type PastProof =
  | { kind: "both"; went: number; photos: number }
  | { kind: "photos"; went: number; photos: number }
  | { kind: "went"; went: number; photos: number };

/** Counts below this read as "dead event" — hide them, show past-proof instead. */
export const MIN_VISIBLE_GOING = 3;

export function shouldShowGoingCount(goingSpots: number | undefined): boolean {
  return (goingSpots ?? 0) >= MIN_VISIBLE_GOING;
}

/** Uploaded image wins; else the resolved past-occurrence moment; else null (default art). */
export function getCardCoverUrl(
  imageUrl: string | null | undefined,
  social: EventSocial | undefined
): string | null {
  if (imageUrl && !isDefaultImageUrl(imageUrl)) return imageUrl;
  return social?.fallback_image_url ?? null;
}

export function getPastProof(social: EventSocial | undefined): PastProof | null {
  if (!social) return null;
  const went = social.last_occurrence_went ?? 0;
  const photos = social.last_occurrence_photos ?? 0;
  const wentMeaningful = went >= MIN_VISIBLE_GOING;
  if (wentMeaningful && photos > 0) return { kind: "both", went, photos };
  if (photos > 0) return { kind: "photos", went, photos };
  if (wentMeaningful) return { kind: "went", went, photos };
  return null;
}
```

Check `isDefaultImageUrl`'s actual signature in `lib/media-utils.ts` first; if it doesn't handle the `/images/defaults/` path used in the test, adjust the test's URL to whatever it does match (it's the same helper every card already uses).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run lib/events/social-proof.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/events/social-proof.ts lib/events/social-proof.test.ts
git commit -m "feat: social-proof helpers — cover fallback, hidden low counts, past-proof"
```

### Task 3: i18n keys — ALL 12 locale files

**Files:**
- Modify: `messages/en.json`, `messages/vi.json`, `messages/ko.json`, `messages/zh.json`, `messages/ru.json`, `messages/fr.json`, `messages/ja.json`, `messages/ms.json`, `messages/th.json`, `messages/de.json`, `messages/es.json`, `messages/id.json`

- [ ] **Step 1: Add these keys to the `events` namespace in every file** (next to the existing `going`/`went` keys):

| key | en | vi | ko | zh | ru | fr | ja | ms | th | de | es | id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pastProofBoth` | `{went} went · {photos} photos last time` | `{went} người đi · {photos} ảnh lần trước` | `지난번 {went}명 참여 · 사진 {photos}장` | `上次 {went} 人参加 · {photos} 张照片` | `В прошлый раз: {went} были · {photos} фото` | `{went} venus · {photos} photos la dernière fois` | `前回{went}人参加・写真{photos}枚` | `{went} hadir · {photos} foto kali lepas` | `ครั้งก่อน {went} คนมา · {photos} รูป` | `Letztes Mal: {went} dabei · {photos} Fotos` | `{went} fueron · {photos} fotos la última vez` | `{went} hadir · {photos} foto terakhir kali` |
| `pastProofPhotos` | `{photos} photos last time` | `{photos} ảnh lần trước` | `지난번 사진 {photos}장` | `上次 {photos} 张照片` | `{photos} фото с прошлого раза` | `{photos} photos la dernière fois` | `前回の写真{photos}枚` | `{photos} foto kali lepas` | `{photos} รูปจากครั้งก่อน` | `{photos} Fotos vom letzten Mal` | `{photos} fotos la última vez` | `{photos} foto terakhir kali` |
| `pastProofWent` | `{went} went last time` | `{went} người đi lần trước` | `지난번 {went}명 참여` | `上次 {went} 人参加` | `В прошлый раз были {went}` | `{went} venus la dernière fois` | `前回{went}人参加` | `{went} hadir kali lepas` | `ครั้งก่อน {went} คนมา` | `Letztes Mal {went} dabei` | `{went} fueron la última vez` | `{went} hadir terakhir kali` |
| `photoBy` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` | `📸 @{name}` |
| `spotsAvailable` | `{count} spots` | `{count} chỗ` | `{count}자리` | `{count} 个名额` | `{count} мест` | `{count} places` | `{count}枠` | `{count} tempat` | `{count} ที่` | `{count} Plätze` | `{count} plazas` | `{count} tempat` |

- [ ] **Step 2: Verify no locale file was missed and JSON is valid**

Run:
```bash
node -e "
const fs = require('fs');
const keys = ['pastProofBoth','pastProofPhotos','pastProofWent','photoBy','spotsAvailable'];
for (const f of fs.readdirSync('messages').filter(f => f.endsWith('.json'))) {
  const m = JSON.parse(fs.readFileSync('messages/' + f));
  const missing = keys.filter(k => !m.events?.[k]);
  if (missing.length) { console.error('MISSING in ' + f + ': ' + missing); process.exitCode = 1; }
}
console.log('checked all locale files');"
```
Expected: `checked all locale files`, no MISSING lines, exit 0.

- [ ] **Step 3: Commit**

```bash
git add messages/
git commit -m "i18n: past-proof, photo credit, and spots keys in all 12 locales"
```

### Task 4: Types + batch fetch (server cache)

**Files:**
- Modify: `lib/types/index.ts` (re-export `EventSocial` for convenience)
- Modify: `lib/cache/server-cache.ts`

- [ ] **Step 1: Re-export the type** in `lib/types/index.ts` near `EventCounts`:

```ts
export type { EventSocial } from "@/lib/events/social-proof";
```

(If `lib/types` must stay import-free of lib code, instead define the interface in `lib/types/index.ts` and have `social-proof.ts` import it — match whichever direction the codebase already uses; `EventCounts` lives in `lib/types`, so mirroring it there is fine.)

- [ ] **Step 2: Add the batch fetcher** to `lib/cache/server-cache.ts`, directly below `getCachedEventCountsBatch` and copying its structure (`unstable_cache` + `createStaticClient` — NEVER `createClient`, this runs in ISR):

```ts
export const getCachedEventSocialBatch = unstable_cache(
  async (eventIds: string[]): Promise<Record<string, EventSocial>> => {
    if (eventIds.length === 0) return {};
    const supabase = createStaticClient();
    if (!supabase) return {};
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, fallback_image_url, fallback_photo_credit, last_occurrence_went, last_occurrence_photos"
      )
      .in("id", eventIds);
    if (error || !data) return {};
    const map: Record<string, EventSocial> = {};
    for (const row of data) {
      map[row.id] = {
        event_id: row.id,
        fallback_image_url: row.fallback_image_url,
        fallback_photo_credit: row.fallback_photo_credit,
        last_occurrence_went: row.last_occurrence_went,
        last_occurrence_photos: row.last_occurrence_photos,
      };
    }
    return map;
  },
  ["event-social-batch"],
  { revalidate: 300, tags: ["events"] }
);
```

Match the exact `unstable_cache` options (revalidate/tags) used by `getCachedEventCountsBatch` in the same file — copy its values, not the ones above, if they differ.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types/index.ts lib/cache/server-cache.ts
git commit -m "feat: batch fetch for event social-proof data (counts-batch pattern)"
```

### Task 5: Thread social data through EventGrid + fetch points

**Files:**
- Modify: `components/events/event-grid.tsx`
- Modify: `components/events/event-feed-scrollable.tsx`
- Modify: `app/[locale]/events/upcoming/[[...page]]/page.tsx`

- [ ] **Step 1: EventGrid** — add an optional prop, mirroring how `counts` flows today:

```ts
social?: Record<string, EventSocial>;
```

Pass `social={social?.[event.id]}` to every card variant it renders (`EventCardFramed`, `EventListCard`, `EventImmersiveCard`, `EventCardCompact`), exactly where `counts` is passed (compact currently gets no counts — give it `social` only).

- [ ] **Step 2: Homepage feed** — in `event-feed-scrollable.tsx`, fetch alongside the counts batch (~L45):

```ts
const [countsMap, socialMap] = await Promise.all([
  getCachedEventCountsBatch(allEventIds),
  getCachedEventSocialBatch(allEventIds),
]);
```

(Keep the existing counts variable name; add the social one.) Pass `social={socialMap}` into both `<EventGrid>` renders and to the `EventHeroCard` usage for Happening Now.

- [ ] **Step 3: Upcoming page** — in `app/[locale]/events/upcoming/[[...page]]/page.tsx`, call `getCachedEventSocialBatch(eventIds)` next to the existing `getEventCounts` call and pass the map into its `<EventGrid social={...}>`.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` (cards don't accept the prop yet; if you work strictly task-by-task, expect errors only about unknown prop `social` — Task 6 resolves them; alternatively execute Tasks 5+6 as one commit).

- [ ] **Step 5: Commit** (may be combined with Task 6)

```bash
git add components/events/event-grid.tsx components/events/event-feed-scrollable.tsx "app/[locale]/events/upcoming/[[...page]]/page.tsx"
git commit -m "feat: thread event social-proof data to homepage and upcoming grids"
```

### Task 6: Card changes — cover fallback, credit chip, hide low counts, past-proof line

**Files:**
- Modify: `components/events/event-card-framed.tsx` (homepage default — full treatment)
- Modify: `components/events/event-list-card.tsx` (full treatment)
- Modify: `components/events/event-immersive-card.tsx` (full treatment)
- Modify: `components/events/event-card-compact.tsx` (cover fallback only)
- Modify: `components/events/event-hero-card.tsx` (cover fallback + hide low counts)

Apply the same recipe per card; `EventCardFramed` shown as the model. **Surgical changes only** — do not touch layout/classes beyond what's below.

- [ ] **Step 1: EventCardFramed** — accept prop and swap the cover source (~L23 props, ~L47 cover logic):

```ts
import { getCardCoverUrl, getPastProof, shouldShowGoingCount, type EventSocial } from "@/lib/events/social-proof";

// props:
social?: EventSocial;

// replace: const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
const coverUrl = getCardCoverUrl(event.image_url, social);
const hasCustomImage = !!coverUrl;
```

Where the card renders the image (`src={event.image_url}` or equivalent), use `src={coverUrl!}`. The `EventDefaultImage` else-branch stays as is.

- [ ] **Step 2: Photographer credit chip** — only when the cover came from a fallback moment, overlay on the image container (bottom-left, matching existing badge styling in the card):

```tsx
{!event.image_url && social?.fallback_image_url && social.fallback_photo_credit && (
  <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
    {t("photoBy", { name: social.fallback_photo_credit })}
  </span>
)}
```

- [ ] **Step 3: Hide low counts + past-proof** — where the card renders the capacity badge (framed L73 `{going_spots}/{capacity}`) and/or `spotsText going` (list L140, immersive L174, hero L151):

```tsx
const goingSpots = counts?.going_spots ?? 0;
const pastProof = getPastProof(social);

// count/badge rendering:
{shouldShowGoingCount(goingSpots) ? (
  /* existing spotsText / badge JSX untouched */
) : pastProof ? (
  <span className="text-xs text-muted-foreground">
    {pastProof.kind === "both" && t("pastProofBoth", { went: pastProof.went, photos: pastProof.photos })}
    {pastProof.kind === "photos" && t("pastProofPhotos", { photos: pastProof.photos })}
    {pastProof.kind === "went" && t("pastProofWent", { went: pastProof.went })}
  </span>
) : event.capacity ? (
  <span className="text-xs text-muted-foreground">{t("spotsAvailable", { count: event.capacity - goingSpots })}</span>
) : null}
```

Adapt the wrapper element/classes per card to match what that count line already uses (don't restyle). Past events (`isPast`): apply the same `shouldShowGoingCount` gate to the "went" text; no past-proof fallback needed there.

- [ ] **Step 4: Repeat for the other four cards** per the treatment listed in Files above. `EventCardCompact` has no counts — only Steps 1-2. `EventHeroCard` — Steps 1 and 3 (skip past-proof, keep it clean: just hide the count when low).

- [ ] **Step 5: Typecheck + tests + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 6: Visual check on dev**

Run: `npm run dev`, open `http://localhost:3000/en`.
Expected: the three "Coming Up" weekly events show real moment photos (after Task 1 Step 4 populated fallbacks), a 📸 chip, and past-proof lines instead of "0 going"/"1/10".

- [ ] **Step 7: Commit**

```bash
git add components/events/
git commit -m "feat: cards use past-occurrence covers, hide low counts, show past-proof + photo credit"
```

### Task 7: Nightly cron + photographer notifications

**Files:**
- Create: `app/api/cron/refresh-fallback-covers/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the route** — copy the auth/client shape of `app/api/cron/mark-no-shows/route.ts` verbatim, body:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("refresh_fallback_covers");
    if (error) throw error;

    const credited = (data?.credited ?? []) as Array<{
      event_id: string;
      event_title: string;
      event_slug: string;
      photographer_id: string;
    }>;
    if (credited.length > 0) {
      const { error: notifError } = await supabase.from("notifications").insert(
        credited.map((c) => ({
          user_id: c.photographer_id,
          type: "photo_featured",
          title: "Your photo is the face of an event 📸",
          body: `Your shot is now the cover for "${c.event_title}". Nice one!`,
          primary_action_url: `/events/${c.event_slug}`,
          primary_action_label: "See it live",
          metadata: { event_id: c.event_id },
        }))
      );
      if (notifError) console.error("photo_featured notifications failed:", notifError);
    }
    return NextResponse.json({ ...data, notified: credited.length });
  } catch (err) {
    console.error("refresh-fallback-covers failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

Before writing the title/body strings, check how existing notification senders handle locale (`lib/notifications/` — templates or per-user locale). If there's a localized template system, use it; if existing senders store English strings, match that pattern (notification content is stored data, not UI chrome — follows the existing system's convention either way).

- [ ] **Step 2: Register the cron** in `vercel.json` (nightly, 20:30 UTC = 3:30am Đà Lạt, after the 16:00 UTC no-show cron):

```json
{ "path": "/api/cron/refresh-fallback-covers", "schedule": "30 20 * * *" }
```

- [ ] **Step 3: Test locally**

```bash
npm run dev &
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-fallback-covers | head -c 500
```
Expected: `{"ok":true,"updated":N,...,"notified":M}` (updated may be 0 on second run — idempotent by design).

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/refresh-fallback-covers/route.ts vercel.json
git commit -m "feat: nightly fallback-cover refresh cron + photographer credit notifications"
```

### Task 8: Post-deploy smoke ratchet

**Files:**
- Create: `scripts/check-alive-homepage.mjs`

- [ ] **Step 1: Write the smoke script** (run post-deploy against prod; vitest unit tests from Task 2 are the build-time half of the ratchet):

```js
// Alive-homepage ratchet: fails if the homepage regresses to generic/dead.
// Usage: node scripts/check-alive-homepage.mjs [url]
const url = process.argv[2] ?? "https://dalat.app/en";
const html = await (await fetch(url, { headers: { "User-Agent": "alive-ratchet" } })).text();

const defaultCovers = (html.match(/event-default-desktop/g) ?? []).length;
const MAX_DEFAULT_COVERS = 2; // ratchet: was 3+ before this feature; tighten over time

const zeroGoing = /(^|[^0-9])0\/\d+|(^|[^0-9])0 going/.test(html);

let failed = false;
if (defaultCovers > MAX_DEFAULT_COVERS) {
  console.error(`FAIL: ${defaultCovers} generic default covers (max ${MAX_DEFAULT_COVERS})`);
  failed = true;
}
if (zeroGoing) {
  console.error(`FAIL: a card renders a zero going-count`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`OK: ${defaultCovers} default covers (≤${MAX_DEFAULT_COVERS}), no zero counts`);
```

- [ ] **Step 2: Verify it fails against current prod** (pre-deploy — proves the ratchet detects the problem):

Run: `node scripts/check-alive-homepage.mjs`
Expected: FAIL (current homepage has 3 default covers).

- [ ] **Step 3: Commit**

```bash
git add scripts/check-alive-homepage.mjs
git commit -m "test: alive-homepage post-deploy ratchet"
```

### Task 9: Deploy Phase 1 + verify

- [ ] **Step 1: Full gauntlet** — `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`. Expected: green.
- [ ] **Step 2: Push** (migration already applied in Task 1) — per repo rules, confirm with Yan before `git push` if not already authorized in-session.
- [ ] **Step 3: Confirm the deploy actually ran** — Vercel silently blocked ALL deploys May 26–Jul 9 (vulnerable-dependency gate); never assume push = deployed. Poll: `gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/status --jq .state` until `success` (or check `vercel ls`). Then: `node scripts/check-alive-homepage.mjs` → Expected: OK.
- [ ] **Step 4: Verify migrations table** — `npx supabase migration list | tail -3` → `20260925` synced.
- [ ] **Step 5: Post-Deploy Summary** to Yan (format per global CLAUDE.md).

---

## Phase 2 — Ghost Boost (hardened, kill-switchable)

### Task 10: Migration — ghost_boost_tick()

**Files:**
- Create: `supabase/migrations/20260925_002_ghost_boost.sql`

- [ ] **Step 1: Write the migration:**

```sql
-- Ghost boost: small seeded attendance while the app is young.
-- seed_profiles table created in 20260925_001 (service-role-only).
-- Constraints (red-team): capacity-NULL events ONLY (never touches
-- waitlist/promote_from_waitlist machinery), max 2-3 per event, jittered
-- timestamps, withdrawn 3h before start. Kill: DELETE FROM rsvps r USING
-- seed_profiles s WHERE r.user_id = s.profile_id; then empty seed_profiles.

CREATE OR REPLACE FUNCTION ghost_boost_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawn int := 0;
  v_added int := 0;
  v_event record;
  v_ghost uuid;
  v_ghost_count int;
BEGIN
  -- 1) Withdraw: events starting within 3 hours (or already started/past —
  -- also self-heals any rows a previously failed tick left behind)
  WITH gone AS (
    DELETE FROM rsvps r
    USING seed_profiles s, events e
    WHERE r.user_id = s.profile_id
      AND r.event_id = e.id
      AND e.starts_at < now() + interval '3 hours'
    RETURNING r.id
  )
  SELECT count(*) INTO v_withdrawn FROM gone;

  -- 2) Seed: at most ONE ghost per eligible event per tick; ~50% random skip
  -- per tick for natural jitter across hours.
  FOR v_event IN
    SELECT e.id,
           2 + (abs(hashtext(e.id::text)) % 2) AS target  -- 2 or 3, stable per event
    FROM events e
    WHERE e.status = 'published'
      AND e.capacity IS NULL                              -- hard rule: no capacity events
      AND e.starts_at > now() + interval '6 hours'
      AND e.starts_at < now() + interval '7 days'
      AND (SELECT COALESCE(SUM(1 + r.plus_ones), 0)
             FROM rsvps r
            WHERE r.event_id = e.id AND r.status = 'going'
              AND NOT EXISTS (SELECT 1 FROM seed_profiles s
                               WHERE s.profile_id = r.user_id)) < 3
  LOOP
    CONTINUE WHEN random() < 0.5;

    SELECT count(*) INTO v_ghost_count
    FROM rsvps r JOIN seed_profiles s ON s.profile_id = r.user_id
    WHERE r.event_id = v_event.id AND r.status = 'going';
    CONTINUE WHEN v_ghost_count >= v_event.target;

    SELECT s.profile_id INTO v_ghost
    FROM seed_profiles s
    WHERE NOT EXISTS (SELECT 1 FROM rsvps r
                       WHERE r.event_id = v_event.id
                         AND r.user_id = s.profile_id)
    ORDER BY random()
    LIMIT 1;

    IF v_ghost IS NOT NULL THEN
      -- backdate up to 45min: rsvps.created_at is publicly readable; exact
      -- on-the-hour timestamps would fingerprint the cron
      INSERT INTO rsvps (event_id, user_id, status, plus_ones, created_at)
      VALUES (v_event.id, v_ghost, 'going', 0,
              now() - (random() * interval '45 minutes'))
      ON CONFLICT (event_id, user_id) DO NOTHING;
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'withdrawn', v_withdrawn, 'added', v_added);
END;
$$;
REVOKE ALL ON FUNCTION ghost_boost_tick() FROM anon, authenticated, public;
```

- [ ] **Step 2: Push + verify** — `npx supabase db push && npx supabase migration list | tail -3`. Expected: `20260925_002` synced local+remote.
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260925_002_ghost_boost.sql
git commit -m "feat: ghost boost tick function (capacity-null events only, jittered, self-healing withdrawal)"
```

### Task 11: Ghost roster setup script

**Files:**
- Create: `scripts/ghosts/setup-ghosts.mjs`

- [ ] **Step 1: Write the script.** Design decisions baked in: ghosts get NO avatar photos by default (initials avatars are *more* realistic than 12 perfect AI faces and dodge reverse-image detection entirely; an optional `--avatars-dir` can add photos later via the R2 client — NEVER Supabase Storage). Roster is mixed Vietnamese/expat matching the real community:

```js
// One-time ghost roster setup. Requires SUPABASE_SERVICE_ROLE_KEY.
// Usage: node scripts/ghosts/setup-ghosts.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ROSTER = [
  { username: "minhtrandl", display_name: "Minh Trần", bio: "Cà phê & leo núi ⛰️" },
  { username: "linhnguyen_dl", display_name: "Linh Nguyễn", bio: "Đà Lạt local. Trà hơn cà phê." },
  { username: "tuanpham92", display_name: "Tuấn Phạm", bio: "guitar, lửa trại, kể chuyện" },
  { username: "huongle.dalat", display_name: "Hương Lê", bio: "weekend explorer" },
  { username: "ducvo_", display_name: "Đức Võ", bio: "chụp ảnh dạo" },
  { username: "thaobui.xinchao", display_name: "Thảo Bùi", bio: "mới về Đà Lạt 🌲" },
  { username: "khoaly_dl", display_name: "Khoa Lý", bio: "boardgames & bánh tráng nướng" },
  { username: "anhdang_", display_name: "Anh Đặng", bio: "chill là chính" },
  { username: "sarah.dalat", display_name: "Sarah M.", bio: "Kiwi in Vietnam 🇳🇿 tea > coffee, fight me" },
  { username: "tomh_travels", display_name: "Tom H.", bio: "digital nomad, third month in Dalat" },
  { username: "elenak.travel", display_name: "Elena K.", bio: "photographer, pine forest addict" },
  { username: "jakeonabike", display_name: "Jake R.", bio: "motorbike loops & cheap bánh mì" },
];

for (const ghost of ROSTER) {
  const email = `ghost.${ghost.username.replace(/[^a-z0-9]/g, "")}@dalat.app`;
  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
  });
  if (error) {
    console.error(`skip ${ghost.username}: ${error.message}`);
    continue;
  }
  // profiles row may be auto-created by trigger — upsert to set fields either way
  const { error: profErr } = await supabase.from("profiles").upsert({
    id: user.user.id,
    username: ghost.username,
    display_name: ghost.display_name,
    bio: ghost.bio,
  });
  if (profErr) { console.error(`profile ${ghost.username}: ${profErr.message}`); continue; }
  const { error: seedErr } = await supabase
    .from("seed_profiles")
    .upsert({ profile_id: user.user.id });
  if (seedErr) { console.error(`seed ${ghost.username}: ${seedErr.message}`); continue; }
  console.log(`✓ ${ghost.display_name} (@${ghost.username})`);
}
const { count } = await supabase
  .from("seed_profiles")
  .select("*", { count: "exact", head: true });
console.log(`\nGhost roster: ${count} profiles`);
```

Before running: check the `profiles` schema for exact column names (`display_name` vs `full_name`, `bio` presence, username uniqueness/validation trigger) and adjust the upsert. Check whether a profile-creation trigger on `auth.users` exists (common Supabase pattern) — if it enforces username format, match it.

- [ ] **Step 2: Run it** — `set -a; source .env.local; set +a; node scripts/ghosts/setup-ghosts.mjs`. Expected: 12 ✓ lines, roster count 12.
- [ ] **Step 3: Verify invisibility again** — the anon curl from Task 1 Step 5 still returns no rows; also verify ghosts don't 404: open `https://dalat.app/@minhtrandl` style profile URL locally — renders like a normal quiet profile.
- [ ] **Step 4: Commit**

```bash
git add scripts/ghosts/setup-ghosts.mjs
git commit -m "feat: ghost roster setup script (12 seed profiles, service-role registry)"
```

### Task 12: Ghost cron route + flag

**Files:**
- Create: `app/api/cron/ghost-boost/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the route** (same cron skeleton as Task 7; the flag check is the only difference):

```ts
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.GHOST_BOOST_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "GHOST_BOOST_ENABLED is not true" });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("ghost_boost_tick");
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("ghost-boost failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Register hourly cron** in `vercel.json`:

```json
{ "path": "/api/cron/ghost-boost", "schedule": "7 * * * *" }
```

- [ ] **Step 3: Set the flag OFF in Vercel** (all environments):

```bash
echo "false" | vercel env add GHOST_BOOST_ENABLED production
```

- [ ] **Step 4: Test the tick manually once** (service-role, direct RPC — independent of the flag):

```bash
node -e "
import('\@supabase/supabase-js').then(async ({createClient}) => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(await s.rpc('ghost_boost_tick'));
});"
```
Expected: `{ok: true, withdrawn: 0, added: N}` where N ≤ eligible events. Spot-check one event page: ghost names appear in the going list, count went from 1 → 2-3. Then check the tick is idempotent-ish: run again, `added` small or 0 (targets reached / random skips).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/ghost-boost/route.ts vercel.json
git commit -m "feat: ghost boost hourly cron behind GHOST_BOOST_ENABLED flag (default off)"
```

### Task 13: Deploy Phase 2 + verify

- [ ] **Step 1: Gauntlet** — `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`. Green.
- [ ] **Step 2: Push** (with authorization), then poll commit status until `success` (Vercel deploys were silently blocked May 26–Jul 9 — verify, don't assume), verify `migration list` synced.
- [ ] **Step 3: Ratchet** — `node scripts/check-alive-homepage.mjs`. Expected: OK.
- [ ] **Step 4: Post-Deploy Summary** including: flag is OFF; Yan flips with `echo "true" | vercel env add GHOST_BOOST_ENABLED production` + redeploy; kill = flag off + `DELETE FROM rsvps r USING seed_profiles s WHERE r.user_id = s.profile_id;`.

---

## Out of scope / notes for the implementer

- **Do not** modify `get_homepage_moments_strip`, `get_events_by_lifecycle_deduplicated`, `get_upcoming_events_paginated`, or any `RETURNS TABLE` feed RPC. Everything rides the social-batch side channel.
- **Do not** touch `supabase/migrations/20260803b_001_smart_reminders.sql` — it belongs to another session (and is currently skipped by the CLI due to its invalid `20260803b` timestamp; surfaced to Yan separately). Because it's unapplied, `rsvps` reminder columns don't exist — our SQL never references them. If smart reminders later ships, organizers will get standard reminders for their own events (mild; the red-team concern was the backfill *burst*, avoided via backdating).
- Other untracked files in the working tree belong to other sessions — commit only files this plan creates/modifies.
- Ghost RSVPs never earn loyalty points or fire `new_rsvp` notifications (both app-side only) — verified, no action needed.
- "For You" / recommended sections keep their current rendering; adopting social-proof there is a follow-up.

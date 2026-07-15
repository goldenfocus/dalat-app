# Aggregator v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resurrect the event aggregator (Apify Facebook + dalat-gov) with loud failure reporting, a recurring-events floor so the homepage never looks dead, and safety gates on imports.

**Architecture:** All fixes live in the existing Next.js app (Vercel crons + Apify webhook). New pieces: an `import_runs` heartbeat table, a Telegram alert helper, a daily health-check cron that watches the customer-facing metric, and a series occurrence top-up so the floor never drains. TicketGo/Inngest-discovery zombie code is deleted.

**Tech Stack:** Next.js 16 (App Router), Supabase (service role), Anthropic SDK (`claude-haiku-4-5` alias), Apify webhooks, Cloudflare R2 via `lib/storage`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-aggregator-v2-design.md`

**Sacred Stops in this plan:** Task 7 creates a migration (Tier A — confirm with Yan before applying). Everything else is app code. Per project CLAUDE.md, ask before committing/pushing.

---

### Task 1: Fix banned Supabase Storage path in `downloadAndUploadImage`

**Files:**
- Modify: `lib/import/utils.ts:153-234`
- Modify: callers found via `grep -rn "downloadAndUploadImage" lib/ app/` (currently `lib/import/processors/facebook.ts:48`, `lib/import/processors/dalat-gov.ts` (~line 389), possibly instagram/tiktok/luma — update all)
- Test: `lib/import/utils.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// lib/import/utils.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(() => ({ upload: uploadMock })),
}));

import { downloadAndUploadImage } from "./utils";
import { getStorageProvider } from "@/lib/storage";

describe("downloadAndUploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue("https://cdn.dalat.app/event-media/test-slug/123.jpg");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new ArrayBuffer(5000),
    }) as unknown as typeof fetch;
  });

  it("uploads via the R2 storage provider, not Supabase Storage", async () => {
    const url = await downloadAndUploadImage("https://scontent.fbcdn.net/x.jpg", "test-slug");
    expect(getStorageProvider).toHaveBeenCalledWith("event-media");
    expect(uploadMock).toHaveBeenCalled();
    expect(url).toBe("https://cdn.dalat.app/event-media/test-slug/123.jpg");
  });

  it("returns null when the download fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });
    const url = await downloadAndUploadImage("https://x/y.jpg", "test-slug");
    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- lib/import/utils.test.ts`
Expected: FAIL (signature mismatch — current function takes `(supabase, externalUrl, eventSlug)` and calls `supabase.storage`)

- [ ] **Step 3: Rewrite the upload body**

In `lib/import/utils.ts`: remove the `supabase: SupabaseClient` parameter, import `getStorageProvider` from `@/lib/storage`, and replace the `supabase.storage.from("event-media").upload(...)` + `getPublicUrl` block (lines 210-229) with:

```typescript
export async function downloadAndUploadImage(
  externalUrl: string | null | undefined,
  eventSlug: string
): Promise<string | null> {
  if (!externalUrl) return null;

  try {
    // ... existing fetch + size/type validation unchanged (lines 167-208) ...

    const provider = getStorageProvider("event-media");
    const publicUrl = await provider.upload(fileName, Buffer.from(buffer), contentType);
    return publicUrl;
  } catch (error) {
    console.warn(`Error downloading/uploading image from ${externalUrl}:`, error);
    return null;
  }
}
```

Check `lib/storage/index.ts` for the exact `StorageProvider.upload` signature before writing (grep `upload(` in the interface at line 25); adapt argument order to match.

- [ ] **Step 4: Update all callers**

`grep -rn "downloadAndUploadImage(" lib/ app/` — remove the first `supabase` argument at every call site (facebook.ts, dalat-gov.ts, and any others found).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:run -- lib/import/utils.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit** — `fix(import): route scraped images through R2, not Supabase Storage`

---

### Task 2: Fix `parseEventDate` (DD/MM + timezone)

**Files:**
- Modify: `lib/import/utils.ts:97-122`
- Test: `lib/import/utils.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```typescript
import { parseEventDate } from "./utils";

describe("parseEventDate", () => {
  it("parses Vietnamese DD/MM/YYYY as day-first in ICT", () => {
    // 25/07/2026 must be July 25, NOT parsed as month=25 or Jan 7
    expect(parseEventDate("25/07/2026")).toBe("2026-07-24T17:00:00.000Z"); // midnight ICT = 17:00 prev day UTC
  });
  it("parses DD/MM/YYYY with a time", () => {
    expect(parseEventDate("25/07/2026", "19:30")).toBe("2026-07-25T12:30:00.000Z");
  });
  it("passes through ISO dates unchanged", () => {
    expect(parseEventDate("2026-07-25T19:30:00+07:00")).toBe("2026-07-25T12:30:00.000Z");
  });
  it("returns null for garbage", () => {
    expect(parseEventDate("next Friday maybe")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:run -- lib/import/utils.test.ts` → the DD/MM cases FAIL (current code feeds `new Date()` which is MM/DD + machine-local TZ)

- [ ] **Step 3: Implement**

```typescript
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const DALAT_TZ = "Asia/Ho_Chi_Minh";

export function parseEventDate(dateStr?: string, timeStr?: string): string | null {
  if (!dateStr) return null;

  // 1. ISO / RFC formats carry their own timezone — trust them.
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const iso = new Date(timeStr && !dateStr.includes("T") ? `${dateStr}T${timeStr}` : dateStr);
    return isNaN(iso.getTime()) ? null : iso.toISOString();
  }

  // 2. Vietnamese day-first formats, interpreted in Đà Lạt time.
  const time = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : "00:00";
  for (const fmt of ["dd/MM/yyyy HH:mm", "d/M/yyyy HH:mm", "dd-MM-yyyy HH:mm"]) {
    const parsed = parseDate(`${dateStr} ${time}`, fmt, new Date());
    if (isValid(parsed)) {
      const local = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}T${time}`;
      return fromZonedTime(local, DALAT_TZ).toISOString();
    }
  }

  return null;
}
```

Note: this deliberately DROPS the old `new Date(anything)` fallback — an unparseable date must be a skip (counted), never a wrong-month publish.

- [ ] **Step 4: Run tests** — expected PASS
- [ ] **Step 5: Commit** — `fix(import): parse DD/MM dates day-first in Asia/Ho_Chi_Minh`

---

### Task 3: Extraction model env var + un-swallowed errors

**Files:**
- Modify: `lib/import/processors/dalat-gov.ts` (line 212 model; lines 209-274 error handling; processGovArticles loop)
- Modify: `lib/import/processors/tiktok.ts:103`, `lib/import/processors/instagram.ts:101` (fake model ID `claude-haiku-4-20250514`)
- Create: `lib/import/extraction-model.ts`

- [ ] **Step 1: Create the shared model constant**

```typescript
// lib/import/extraction-model.ts
// Alias, not a dated snapshot — dated IDs hit end-of-life (claude-3-5-haiku-20241022
// died 2026-02-19 and this pipeline silently returned [] for 5 months).
export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || "claude-haiku-4-5";
```

- [ ] **Step 2: Use it in all three processors** — replace `model: "claude-3-5-haiku-20241022"` (dalat-gov.ts:212) and `model: "claude-haiku-4-20250514"` (tiktok.ts:103, instagram.ts:101) with `model: EXTRACTION_MODEL` + import.

- [ ] **Step 3: Un-swallow extraction errors in dalat-gov.ts**

Change `extractEventsFromArticle` to **rethrow API errors** (keep returning `[]` only for parse-shaped emptiness):

```typescript
  } catch (error) {
    // JSON-parse issues = model answered but format was off → treat as empty.
    if (error instanceof SyntaxError) return [];
    // API errors (model retired, auth, rate limit) must be LOUD, never "no events".
    console.error(`[dalat-gov] Extraction API error for ${article.url}:`, error);
    throw error;
  }
```

In `processGovArticles`, wrap the per-article extraction call so one article's API failure increments `result.errors` and captures `result.details.push(...)` — and if **every** article errors, the function's caller must see `errors > 0` with `processed === 0` (already expressed by ProcessResult; no shape change needed).

- [ ] **Step 4: Surface errors in the cron response** — in `app/api/cron/sync-dalat-gov/route.ts`, include `errors` and `details.slice(0, 5)` in the JSON response, and return HTTP 500 when `result.errors > 0 && result.processed === 0` (total failure must look like failure to any monitor).

- [ ] **Step 5: Typecheck + spot-run** — `npx tsc --noEmit`; then locally: `npx tsx -e "import { fetchGovArticles, extractEventsFromArticle } from './lib/import/processors/dalat-gov'; ..."` with `ANTHROPIC_API_KEY` exported, verify one article extracts without a deprecation error.

- [ ] **Step 6: Commit** — `fix(import): unpin extraction model to claude-haiku-4-5 alias, make API errors loud`

---

### Task 4: Draft gate + per-run cap

**Files:**
- Modify: `lib/import/processors/facebook.ts` (insert at line 66, loop at 22), `lib/import/processors/dalat-gov.ts` (insert ~line 413, loop)
- Create: `lib/import/import-config.ts`

- [ ] **Step 1: Create shared config**

```typescript
// lib/import/import-config.ts
// Draft gate: month one runs land as drafts for review via the Telegram digest.
// Flip IMPORT_AUTO_PUBLISH=true in Vercel env once scrape quality is proven.
export const IMPORT_STATUS: "draft" | "published" =
  process.env.IMPORT_AUTO_PUBLISH === "true" ? "published" : "draft";

// Hard cap per source per run — first run after a dead period could otherwise
// dump 50-100 events (≈$25 of 12-language translation + homepage flood).
export const MAX_IMPORTS_PER_RUN = 15;
```

- [ ] **Step 2: Apply in both processors** — replace `status: "published"` with `status: IMPORT_STATUS`; at the top of each processing loop add:

```typescript
      if (result.processed >= MAX_IMPORTS_PER_RUN) {
        result.skipped++;
        result.details.push(`Cap reached (${MAX_IMPORTS_PER_RUN}) — skipped: ${event.url ?? article.url}`);
        continue;
      }
```

- [ ] **Step 3: Skip translation for drafts?** — NO. Keep translating on insert (`triggerTranslationServer` stays) so publishing a draft is instant; the cap bounds the cost. Do not change the translation call.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`
- [ ] **Step 5: Commit** — `feat(import): draft gate + 15-per-run import cap`

---

### Task 5: Canonicalize Facebook event URLs before dedupe

**Files:**
- Modify: `lib/import/utils.ts` (new export), `lib/import/processors/facebook.ts:33,64`
- Test: `lib/import/utils.test.ts` (extend)

- [ ] **Step 1: Failing tests**

```typescript
import { canonicalizeFacebookEventUrl } from "./utils";

describe("canonicalizeFacebookEventUrl", () => {
  it.each([
    ["https://m.facebook.com/events/123456789/", "https://www.facebook.com/events/123456789"],
    ["https://www.facebook.com/events/123456789?ref=newsfeed", "https://www.facebook.com/events/123456789"],
    ["https://www.facebook.com/events/123456789/?event_time_id=987", "https://www.facebook.com/events/123456789"],
    ["https://facebook.com/events/123456789", "https://www.facebook.com/events/123456789"],
  ])("canonicalizes %s", (input, expected) => {
    expect(canonicalizeFacebookEventUrl(input)).toBe(expected);
  });
  it("returns non-FB-event URLs unchanged", () => {
    expect(canonicalizeFacebookEventUrl("https://ticketbox.vn/e/1")).toBe("https://ticketbox.vn/e/1");
  });
});
```

- [ ] **Step 2: Run → FAIL (function doesn't exist)**

- [ ] **Step 3: Implement in `lib/import/utils.ts`**

```typescript
export function canonicalizeFacebookEventUrl(url: string): string {
  const match = url.match(/facebook\.com\/events\/(\d+)/i);
  return match ? `https://www.facebook.com/events/${match[1]}` : url;
}
```

- [ ] **Step 4: Use it in `facebook.ts`** — `const canonicalUrl = canonicalizeFacebookEventUrl(event.url);` then pass `canonicalUrl` to both `checkDuplicateByUrl(supabase, canonicalUrl)` (line 33) and `external_chat_url: canonicalUrl` (line 64).

- [ ] **Step 5: Tests + typecheck pass → Commit** — `fix(import): canonicalize FB event URLs so dedupe survives URL variants`

(Existing Apify-era rows: 23 facebook events, all past — no backfill needed; dedupe only matters for upcoming events, and past events won't re-appear in scrapes.)

---

### Task 6: Delete TicketGo + Inngest event-discovery zombies

**Files:**
- Delete: `lib/import/processors/ticketgo.ts`, `lib/inngest/functions/event-discovery.ts`
- Modify: `lib/inngest/index.ts` (remove `dailyEventDiscovery`/`manualEventDiscovery` export), `app/api/inngest/route.ts` (remove both from imports and `functions: []`)
- Check: `app/api/import/discover/route.ts` — read it; if it only sends the `event/discover` Inngest event (TicketGo-only), delete the route directory too. If it does more, remove only the TicketGo path.

- [ ] **Step 1: Delete files and references as above**
- [ ] **Step 2: Full-repo grep for leftovers** — `grep -rn "ticketgo\|TicketGo\|dailyEventDiscovery\|manualEventDiscovery\|event/discover" lib/ app/ --include="*.ts*"` → must return nothing
- [ ] **Step 3: Build check** — `npx tsc --noEmit`
- [ ] **Step 4: Commit** — `chore(import): delete TicketGo scraper + Inngest discovery (0 lifetime events, 404 URLs)`

---

### Task 7: `import_runs` heartbeat table ⚠️ Tier A — CONFIRM WITH YAN BEFORE APPLYING

**Files:**
- Create: `supabase/migrations/20260709_001_import_runs.sql` (check for same-day collision per memory: version = date prefix)
- Create: `lib/import/run-log.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Import run heartbeat: one row per scraper run per source.
-- Powers the Telegram digest, the zero-twice-in-a-row alarm, and the dead-source watchdog.
CREATE TABLE IF NOT EXISTS import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,               -- 'facebook' | 'dalat-gov' | 'manual'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  raw_seen int NOT NULL DEFAULT 0,    -- items the source surfaced BEFORE filtering (health evidence)
  imported int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  error_detail text
);

CREATE INDEX IF NOT EXISTS idx_import_runs_source_time ON import_runs (source, started_at DESC);

-- Service-role only: RLS on, no policies.
ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: STOP — get Yan's explicit OK on this migration (Tier A)**
- [ ] **Step 3: Apply via the repo's runner** (db push is hook-blocked per memory): `./scripts/supabase-run-sql.sh supabase/migrations/20260709_001_import_runs.sql`, then insert the version row into `supabase_migrations.schema_migrations` manually and verify with the SELECT check from global CLAUDE.md.
- [ ] **Step 4: Write the helper**

```typescript
// lib/import/run-log.ts
import { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessResult } from "./utils";

export async function recordImportRun(
  supabase: SupabaseClient,
  source: string,
  startedAt: Date,
  rawSeen: number,
  result: ProcessResult
): Promise<void> {
  const { error } = await supabase.from("import_runs").insert({
    source,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    raw_seen: rawSeen,
    imported: result.processed,
    skipped: result.skipped,
    errors: result.errors,
    error_detail: result.errors > 0 ? result.details.slice(0, 10).join("\n") : null,
  });
  // A broken heartbeat must never break the import itself — but it must be visible.
  if (error) console.error(`[import-runs] FAILED to record ${source} run:`, error);
}

/** True when this source's previous run also saw zero raw items — the silent-death signature. */
export async function isRepeatZero(
  supabase: SupabaseClient,
  source: string,
  currentRawSeen: number
): Promise<boolean> {
  if (currentRawSeen > 0) return false;
  const { data } = await supabase
    .from("import_runs")
    .select("raw_seen")
    .eq("source", source)
    .order("started_at", { ascending: false })
    .limit(1);
  return data?.[0] != null && data[0].raw_seen === 0;
}
```

(Call `isRepeatZero` BEFORE `recordImportRun` so "previous run" means the actual prior run.)

- [ ] **Step 5: Commit** — `feat(import): import_runs heartbeat table + run logger`

---

### Task 8: Telegram alerts + per-run reporting

**Files:**
- Create: `lib/alerts/telegram.ts`
- Modify: `app/api/import/apify-webhook/route.ts`, `app/api/cron/sync-dalat-gov/route.ts`

- [ ] **Step 1: The sender**

```typescript
// lib/alerts/telegram.ts
// Ops alerts for Yan — NOT user-facing copy, so no i18n.
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — alert dropped:", text);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("[telegram] send failed:", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[telegram] send error:", e);
    return false;
  }
}
```

- [ ] **Step 2: Wire both import entry points** — after processing in the Apify webhook and the gov cron:

```typescript
    const startedAt = new Date(); // set BEFORE processing begins
    // ... existing processing → result, rawSeen = items.length / articles.length ...
    const repeatZero = await isRepeatZero(supabase, SOURCE, rawSeen);
    await recordImportRun(supabase, SOURCE, startedAt, rawSeen, result);
    const line = `${SOURCE}: ${rawSeen} raw · ${result.processed} imported (${IMPORT_STATUS}) · ${result.skipped} skipped · ${result.errors} errors`;
    if (result.errors > 0 || repeatZero) {
      await sendTelegram(`🚨 <b>Import problem</b>\n${line}${repeatZero ? "\n(second consecutive zero-raw run — source may be dead)" : ""}\n${result.details.slice(0, 3).join("\n")}`);
    } else if (result.processed > 0) {
      await sendTelegram(`📥 ${line}\nReview drafts: https://dalat.app/admin/events`);
    }
```

(`SOURCE` = `"facebook"` in the webhook, `"dalat-gov"` in the cron. Verify the admin drafts URL exists — `ls app/[locale]/admin/` — and adjust the link to the real events-admin path.)

- [ ] **Step 3: Typecheck → Commit** — `feat(import): Telegram run reports + zero-twice alarm`

---

### Task 9: Health-check cron — customer-promise watchdog + series top-up

**Files:**
- Create: `app/api/cron/health-check/route.ts`
- Modify: `vercel.json` (add cron entry)

- [ ] **Step 1: The route**

```typescript
// app/api/cron/health-check/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/alerts/telegram";

export const maxDuration = 60;

const MIN_UPCOMING_14D = 8;   // the customer promise: homepage must not look dead
const MAX_HEARTBEAT_AGE_H = 48;
const WATCHED_SOURCES = ["dalat-gov"]; // add "facebook" once the Apify schedule is re-enabled

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const problems: string[] = [];

  // 1. Customer promise: enough visible upcoming events?
  const { count: upcoming } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .lt("starts_at", new Date(Date.now() + 14 * 86400_000).toISOString());
  if ((upcoming ?? 0) < MIN_UPCOMING_14D)
    problems.push(`Only ${upcoming} published events in the next 14 days (floor: ${MIN_UPCOMING_14D})`);

  // 2. Heartbeats: any watched source silent too long?
  for (const source of WATCHED_SOURCES) {
    const { data } = await supabase
      .from("import_runs")
      .select("started_at")
      .eq("source", source)
      .order("started_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.started_at ? new Date(data[0].started_at) : null;
    if (!last || Date.now() - last.getTime() > MAX_HEARTBEAT_AGE_H * 3600_000)
      problems.push(`${source}: no import run in ${MAX_HEARTBEAT_AGE_H}h (last: ${last?.toISOString() ?? "never"})`);
  }

  if (problems.length > 0)
    await sendTelegram(`🚨 <b>dalat.app event health</b>\n${problems.map((p) => `• ${p}`).join("\n")}`);

  return NextResponse.json({ ok: problems.length === 0, upcoming, problems });
}
```

- [ ] **Step 2: Series occurrence top-up (the floor must not drain)**

`app/api/series/route.ts:191-214` materializes occurrences only at creation (`GENERATE_MONTHS_AHEAD`). Extract that block (occurrence generation + event-insert mapping, including slug/`fromZonedTime` handling) into `lib/series/materialize.ts` as `materializeSeriesOccurrences(supabase, series, monthsAhead)`, refactor the route to call it, and add to the health-check route (after the checks above):

```typescript
  // 3. Top up recurring series so materialized occurrences always extend ~2 months out.
  const { data: seriesList } = await supabase
    .from("event_series")
    .select("*")
    .eq("status", "active"); // verify the actual status column/values in the event_series schema first
  let toppedUp = 0;
  for (const series of seriesList ?? []) {
    toppedUp += await materializeSeriesOccurrences(supabase, series, 2);
  }
```

`materializeSeriesOccurrences` must be idempotent: generate dates from `max(existing occurrence date, now)` to `now + monthsAhead`, skip dates whose instance slug (`${seriesSlug}-yyyyMMdd`) already exists, insert the rest, return the insert count. **Copy the event-insert mapping from the route verbatim** (timezone combine, duration, `series_id`) — do not rewrite it from scratch (same failure class as the moments-strip RPC incident).

- [ ] **Step 3: Register the cron** — in `vercel.json` add `{ "path": "/api/cron/health-check", "schedule": "30 2 * * *" }` (09:30 Đà Lạt, after both scrape crons have run).

- [ ] **Step 4: Verify locally** — `npx tsc --noEmit`; hit the route on a dev server with the local CRON_SECRET and confirm JSON shape + a Telegram message arrives (or the dropped-alert console.error fires if env unset).

- [ ] **Step 5: Commit** — `feat(health): daily event-health watchdog + series occurrence top-up`

---

### Task 10: Deploy + ops runbook (sequenced — no code)

- [ ] **Step 1: HOLD for Yan** — this branch spans Tier A (migration) + multiple concerns: per global CLAUDE.md this is a reviewed push, not auto-push. Get explicit go, run the pre-push gauntlet, push.
- [ ] **Step 2: Verify migration applied** — `schema_migrations` SELECT check (non-negotiable per global CLAUDE.md).
- [ ] **Step 3: Vercel env** — add `EXTRACTION_MODEL` (optional), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (from Yan/BotFather — one-time), leave `IMPORT_AUTO_PUBLISH` unset (draft gate on).
- [ ] **Step 4: Smoke the gov leg** — trigger `/api/cron/sync-dalat-gov` with prod CRON_SECRET; expect: extraction runs on `claude-haiku-4-5` without API errors, `import_runs` row written, Telegram line received; events (if any) land as drafts.
- [ ] **Step 5: Apify (blocked on Yan's token)** — token → vault (`~/golden-vault`, new `dalat-prod.env`) → Vercel env `APIFY_API_TOKEN` + local `.env.local` → `POST /api/import/schedule {"enabled": true}` → confirm task/schedule/webhook created in Apify console → run the task once manually → verify webhook fires, drafts land, Telegram reports. Then add `"facebook"` to `WATCHED_SOURCES` in the health cron and expand the task's `startUrls` to ~10 venue FB pages (draft list from `SELECT name, facebook_url FROM venues WHERE facebook_url IS NOT NULL` — Yan vetoes).
- [ ] **Step 6: Seed the floor** — generate a candidate list of ~20-30 recurring Đà Lạt series (night market, weekly live music, quiz nights, weekend markets) from venues/moments data; Yan approves; create via `POST /api/series` (which materializes occurrences). Homepage should show a month-deep calendar.
- [ ] **Step 7: Acceptance tests (falsifiable "alive forever")**
  1. Set `EXTRACTION_MODEL=claude-fake-model` in preview env, trigger gov cron → expect 🚨 Telegram + HTTP 500, NOT "success, 0 events".
  2. Two consecutive zero-raw runs on a source → expect the zero-twice 🚨.
  3. Delete `import_runs` rows for a watched source older than 48h (or just wait) → health cron alerts.
  4. Temporarily set `MIN_UPCOMING_14D` above the real count → health cron alerts on the customer metric.

---

## Plan self-review notes

- **Spec coverage:** Layer 0 → Task 9 step 2 + Task 10 step 6; Layer 1 → Tasks 4, 5, 8, 10 step 5; Layer 2 → Tasks 2, 3; Layer 3 → Tasks 7, 8, 9; safety gates → Tasks 1, 4; cleanup → Task 6. ✅
- **Sequencing constraint (red team kill #6):** Tasks 3 and 6 must ship in the SAME deploy — fixing the model revives the sync-dalat-gov cron, so the zombie deletion and safety gates ride along. The plan's single-branch structure guarantees this.
- **Type consistency:** `ProcessResult` (processed/skipped/errors/details) is reused unchanged across Tasks 3, 7, 8. `IMPORT_STATUS` from Task 4 is referenced in Task 8's digest line. ✅
- **Other sessions' uncommitted changes** are present in the working tree (mobile/, loyalty docs, etc.) — commit surgically, only files this plan touches.

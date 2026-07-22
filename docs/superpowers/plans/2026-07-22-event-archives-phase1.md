# Event Archives Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every past event page renders a moderator-approved, 12-locale AI recap card generated through the keyless Mac-mini pipeline, and the existing AI caption corpus becomes visible to image search.

**Architecture:** Reuse the live `caption_jobs` queue with a new `recap` content_type (one Tier-A migration). `POST /api/blog/generate-recap` becomes an enqueuer; the Mac-mini worker runs the prompt text-only via `claude -p`; `caption-jobs/complete` grows a recap branch that writes a storage-only `blog_posts` draft (excluded from all public blog surfaces because they filter `status='published'`) and triggers 12-locale translation. A `recap_published_at` timestamp — set by a moderator via a new publish route — gates rendering on the event page. Privacy fence is structural: recap input only accepts moments whose `moment_metadata.processing_status = 'completed'` (privacy-gated moments settle `'skipped'` and never get captions), and `detected_text` never enters the prompt.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role via `getImageJobsAdmin()`), next-intl (12 locales), vitest, Mac-mini worker (`scripts/macmini-caption-worker/caption-worker.mjs`, plain Node, launchd).

**Worktree:** `.worktrees/event-archives` (branch `event-archives`, already exists with the spec committed).

**⛔ SACRED STOPS in this plan:**
- **Task 2 (migration) must NOT be applied or pushed without Yan's explicit confirmation.** Everything else is Tier C.
- Migration version: NEVER pick from `ls supabase/migrations/`. Query prod `schema_migrations` max version at apply time (pseudo-date sequence, currently 2026101x) and use max+1. See Task 2 Step 3.

**Deploy-platform note:** origin/main's CLAUDE.md says hosting = Cloudflare Workers (July 2026); older memory says that migration was paused and prod = Vercel. Do NOT assume either. At push time, verify with `gh api "repos/goldenfocus/dalat-app/commits/$(git rev-parse HEAD)/status" --jq .state` and follow whatever CI actually runs. Nothing in this plan adds a cron or touches middleware, so the discrepancy doesn't affect the code.

---

### Task 0: Worktree setup

**Files:** none (environment)

- [ ] **Step 1: Install deps in the worktree**

```bash
cd /Users/vibeyang/dalat-app/.worktrees/event-archives
npm install
```

Expected: completes without error. **Gotcha (memory):** `npm install` in a worktree may rename the top entry in `package-lock.json` (package.json has no `"name"`). Check `git status` after; if `package-lock.json` is dirty with only that rename, leave it unstaged and NEVER commit it.

- [ ] **Step 2: Verify the test runner works**

```bash
npm run test:run -- lib/audiences/resolve.test.ts
```

Expected: existing test passes.

---

### Task 1: Pure recap-input module (eligibility filter + prompt builder + parser) — TDD

This extracts everything testable out of the generator so the privacy fence and prompt policy have permanent guard tests, and deletes the Anthropic SDK from `lib/blog/`.

**Files:**
- Create: `lib/blog/recap-input.ts`
- Create: `lib/blog/recap-input.test.ts`
- Rewrite: `lib/blog/event-recap-generator.ts` (becomes re-export shim OR is emptied — see Step 6)

- [ ] **Step 1: Write the failing tests**

Create `lib/blog/recap-input.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectRecapMoments,
  buildRecapPrompt,
  parseRecapOutput,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "./recap-input";

const completedMoment = (over: Partial<RecapMomentRow> = {}): RecapMomentRow => ({
  content_type: "photo",
  processing_status: "completed",
  ai_description: "A crowd of laptops under warm cafe light",
  ai_title: "Demo time",
  scene_description: "Indoor cafe, projector screen",
  mood: "energetic",
  detected_objects: ["laptop", "projector"],
  ai_tags: ["tech", "meetup"],
  video_summary: null,
  audio_summary: null,
  ...over,
});

describe("selectRecapMoments — the privacy fence", () => {
  it("keeps only completed moments with a non-null ai_description", () => {
    const rows = [
      completedMoment(),
      completedMoment({ processing_status: "skipped", ai_description: null }),
      completedMoment({ processing_status: "pending" }),
      completedMoment({ ai_description: null }),
    ];
    expect(selectRecapMoments(rows)).toHaveLength(1);
  });

  it("excludes privacy-skipped moments even if they somehow carry a caption", () => {
    // Belt-and-suspenders: status is the structural predicate, caption presence is not enough.
    const rows = [completedMoment({ processing_status: "skipped" })];
    expect(selectRecapMoments(rows)).toHaveLength(0);
  });
});

describe("buildRecapPrompt — content policy", () => {
  const prompt = buildRecapPrompt({
    event: {
      title: "Đà Lạt Tech Meetup #4",
      description: "Monthly builders night",
      location_name: "Cafe X",
      starts_at: "2026-07-21T19:00:00Z",
      ends_at: null,
      ai_tags: ["tech"],
    },
    moments: [
      completedMoment(),
      // detected_text must never be typed into RecapMomentRow, but guard the
      // assembled prompt anyway against future regressions:
    ],
    venueName: "Cafe X",
    organizerName: "Golden Focus",
    momentCount: 5,
    photoCount: 4,
    videoCount: 1,
  });

  it("never contains a detected_text section", () => {
    expect(prompt).not.toMatch(/Text found:/);
    expect(prompt).not.toMatch(/detected_text/);
  });

  it("never instructs the model to name people", () => {
    expect(prompt.toLowerCase()).not.toContain("specific people");
    expect(prompt.toLowerCase()).not.toContain("performers if");
  });

  it("never asks for technical_content", () => {
    expect(prompt).not.toContain("technical_content");
  });

  it("includes the moment descriptions and event facts", () => {
    expect(prompt).toContain("A crowd of laptops under warm cafe light");
    expect(prompt).toContain("Đà Lạt Tech Meetup #4");
  });
});

describe("parseRecapOutput", () => {
  const valid = {
    story_content: "What a night in Đà Lạt...",
    meta_description: "A recap of the Đà Lạt tech meetup",
    seo_keywords: ["dalat", "tech meetup"],
    social_share_text: "We built things!",
    suggested_cta_text: "See the photos",
  };

  it("parses clean JSON", () => {
    expect(parseRecapOutput(JSON.stringify(valid)).story_content).toContain("Đà Lạt");
  });

  it("parses JSON wrapped in fences/prose", () => {
    const out = parseRecapOutput("Here you go:\n```json\n" + JSON.stringify(valid) + "\n```");
    expect(out.meta_description).toBe(valid.meta_description);
  });

  it("throws on missing required fields", () => {
    const { story_content: _drop, ...bad } = valid;
    expect(() => parseRecapOutput(JSON.stringify(bad))).toThrow();
  });

  it("throws on empty story", () => {
    expect(() => parseRecapOutput(JSON.stringify({ ...valid, story_content: " " }))).toThrow();
  });
});

describe("RECAP_PROMPT_VERSION", () => {
  it("is stamped so re-runs become a WHERE clause", () => {
    expect(RECAP_PROMPT_VERSION).toMatch(/^recap-v\d+$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- lib/blog/recap-input.test.ts
```

Expected: FAIL — module `./recap-input` not found.

- [ ] **Step 3: Write `lib/blog/recap-input.ts`**

```ts
/**
 * Pure recap building blocks — NO SDK imports, NO network. The prompt runs
 * on the Mac mini via `claude -p` (caption_jobs content_type 'recap'), and
 * the raw output is parsed server-side in caption-jobs/complete.
 *
 * Privacy fence: selectRecapMoments only passes moments whose metadata
 * settled 'completed' — privacy-gated moments settle 'skipped' in
 * process-moments and never reach any AI prompt. detected_text is
 * deliberately absent from RecapMomentRow: it is OCR exhaust (name tags,
 * phone numbers) and must never enter recap prose.
 */

export const RECAP_PROMPT_VERSION = "recap-v2";

export interface RecapMomentRow {
  content_type: string;
  processing_status: string | null;
  ai_description: string | null;
  ai_title: string | null;
  scene_description: string | null;
  mood: string | null;
  detected_objects: string[] | null;
  ai_tags: string[] | null;
  video_summary: string | null;
  audio_summary: string | null;
}

export interface RecapPromptInput {
  event: {
    title: string;
    description: string | null;
    location_name: string | null;
    starts_at: string;
    ends_at: string | null;
    ai_tags: string[] | null;
  };
  moments: RecapMomentRow[];
  venueName: string | null;
  organizerName: string | null;
  momentCount: number;
  photoCount: number;
  videoCount: number;
}

export interface RecapOutput {
  story_content: string;
  meta_description: string;
  seo_keywords: string[];
  social_share_text: string;
  suggested_cta_text: string;
}

export function selectRecapMoments(rows: RecapMomentRow[]): RecapMomentRow[] {
  return rows.filter(
    (m) => m.processing_status === "completed" && !!m.ai_description?.trim()
  );
}

const RECAP_SYSTEM = `You are a storyteller for dalat.app, creating engaging recaps of events in Đà Lạt, Vietnam. Your readers are locals, expats, and travelers interested in what's happening in the city.

## Your Task
Given an event's details and AI-analyzed descriptions of photos/videos from the event, create a compelling recap that:
1. Makes people who weren't there wish they'd come
2. Showcases the authentic Đà Lạt experience
3. Is SEO-optimized for discoverability

## Output Format (JSON)
Return ONLY a valid JSON object, no markdown fences, no prose:

{
  "story_content": "The human-readable recap in markdown (150-300 words)",
  "meta_description": "150 char meta description for SEO — MUST mention Đà Lạt",
  "seo_keywords": ["keyword1", "keyword2"],
  "social_share_text": "Short engaging text for social sharing",
  "suggested_cta_text": "See the photos"
}

## Story Content Guidelines
- Open with atmosphere — the weather, the mood, the energy
- Describe 3-5 highlights from the AI-analyzed moments
- Include sensory details: sounds, colors, textures
- NEVER name, identify, or guess at any individual person. Describe the crowd and the vibe, not people. Only the venue name, organizer name, and event title may appear as proper nouns.
- Only state facts present in the event details and moment descriptions below — never invent attendance numbers, performances, or outcomes.
- Close with anticipation — what's next?
- Warm, personal tone. Never corporate.
- MUST mention Đà Lạt naturally at least twice
- Write in English but sprinkle Vietnamese terms where natural

## SEO Keywords
- Mix: "Đà Lạt" variations + event type + venue name + mood/vibe keywords
- Include Vietnamese: "sự kiện Đà Lạt", venue name in Vietnamese
- Long-tail: "live music in Dalat", "cafe events Da Lat"`;

export function buildRecapPrompt(input: RecapPromptInput): string {
  const momentDescriptions = input.moments
    .map((m, i) => {
      const parts = [`Moment ${i + 1} (${m.content_type}):`];
      if (m.ai_title) parts.push(`  Title: ${m.ai_title}`);
      if (m.ai_description) parts.push(`  Description: ${m.ai_description}`);
      if (m.scene_description) parts.push(`  Scene: ${m.scene_description}`);
      if (m.mood) parts.push(`  Mood: ${m.mood}`);
      if (m.detected_objects?.length) parts.push(`  Objects: ${m.detected_objects.join(", ")}`);
      if (m.video_summary) parts.push(`  Video summary: ${m.video_summary}`);
      if (m.audio_summary) parts.push(`  Audio summary: ${m.audio_summary}`);
      if (m.ai_tags?.length) parts.push(`  Tags: ${m.ai_tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");

  return `${RECAP_SYSTEM}

## Event Details
Title: ${input.event.title}
${input.event.description ? `Description: ${input.event.description}` : ""}
Date: ${input.event.starts_at}${input.event.ends_at ? ` to ${input.event.ends_at}` : ""}
Location: ${input.event.location_name || "Đà Lạt"}
${input.venueName ? `Venue: ${input.venueName}` : ""}
${input.organizerName ? `Organizer: ${input.organizerName}` : ""}
${input.event.ai_tags?.length ? `Tags: ${input.event.ai_tags.join(", ")}` : ""}

## Stats
Total moments: ${input.momentCount}
Photos: ${input.photoCount}
Videos: ${input.videoCount}

## AI-Analyzed Moments
${momentDescriptions}

Generate the event recap JSON now.`;
}

export function parseRecapOutput(output: string): RecapOutput {
  let text = output.trim();
  if (text.startsWith("```json")) text = text.slice(7);
  else if (text.startsWith("```")) text = text.slice(3);
  if (text.endsWith("```")) text = text.slice(0, -3);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`recap output has no JSON object: ${output.slice(0, 200)}`);
  const raw = JSON.parse(match[0]) as Record<string, unknown>;

  const str = (key: string): string => {
    const v = raw[key];
    if (typeof v !== "string" || !v.trim()) throw new Error(`recap output missing ${key}`);
    return v.trim();
  };

  const keywords = Array.isArray(raw.seo_keywords)
    ? (raw.seo_keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : [];

  return {
    story_content: str("story_content"),
    meta_description: str("meta_description"),
    seo_keywords: keywords,
    social_share_text: str("social_share_text"),
    suggested_cta_text: str("suggested_cta_text"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- lib/blog/recap-input.test.ts
```

Expected: PASS (all).

- [ ] **Step 5: Delete the SDK from `lib/blog/event-recap-generator.ts`**

Replace the ENTIRE file content with:

```ts
/**
 * Recap generation moved to the keyless pipeline (caption_jobs
 * content_type 'recap' → Mac-mini claude -p worker). Prompt building and
 * output parsing live in ./recap-input. This file intentionally has no
 * SDK imports — scripts/check-recap-keyless.mjs enforces that.
 */
export {
  selectRecapMoments,
  buildRecapPrompt,
  parseRecapOutput,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
  type RecapPromptInput,
  type RecapOutput,
} from "./recap-input";
```

- [ ] **Step 6: Create the prebuild ratchet**

Create `scripts/check-recap-keyless.mjs`:

```js
// Ratchet: lib/blog/ must stay SDK-free — recaps run on the keyless
// Mac-mini pipeline. A paid-key import sneaking back in is a silent
// money+outage path (Anthropic SDK throws at import when the key is absent).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "lib/blog";
const BANNED = ["@anthropic-ai/sdk", "openai", "@google/generative-ai"];

let bad = [];
for (const file of readdirSync(DIR)) {
  if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
  const src = readFileSync(join(DIR, file), "utf8");
  for (const pkg of BANNED) {
    if (src.includes(`"${pkg}`) || src.includes(`'${pkg}`)) bad.push(`${DIR}/${file}: ${pkg}`);
  }
}
if (bad.length) {
  console.error("⛔ Paid-SDK import in lib/blog/ (recaps must stay keyless):");
  for (const line of bad) console.error("  " + line);
  process.exit(1);
}
console.log("✓ lib/blog/ is keyless");
```

Then in `package.json`, find the existing `"prebuild"` script and append `&& node scripts/check-recap-keyless.mjs` to it (match the existing chaining style exactly — read the current value first, change nothing else in it).

- [ ] **Step 7: Verify ratchet + typecheck + commit**

```bash
node scripts/check-recap-keyless.mjs        # expect: ✓ lib/blog/ is keyless
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

`generate-recap/route.ts` will now have type errors (it imports `generateEventRecap`, which no longer exists) — that's expected; Task 3 rewrites it. If OTHER files import `generateEventRecap`, list them and fix in Task 3.

```bash
git add lib/blog/recap-input.ts lib/blog/recap-input.test.ts lib/blog/event-recap-generator.ts scripts/check-recap-keyless.mjs package.json
git commit -m "feat(recap): pure recap input builder — privacy fence, no-people prompt, keyless ratchet"
```

---

### Task 2: Migration — caption_jobs recap type + blog_posts event link ⛔ TIER A

**⛔ STOP: get Yan's explicit confirmation before applying this migration or pushing it. Show him the SQL.**

**Files:**
- Create: `supabase/migrations/<NEXT_VERSION>_001_recap_jobs.sql` (version computed in Step 1 — never from `ls`)

- [ ] **Step 1: Compute the next migration version from PROD**

```bash
cd /Users/vibeyang/dalat-app/.worktrees/event-archives
node -e '
const url = process.env.URL || "https://aljcmodwjqlznzcydyor.supabase.co";
// Read key from .env.local, strip quotes + literal \n (known gotcha)
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/SUPABASE_SERVICE_ROLE_KEY=\"?([^\"\n]+?)(\\\\n)?\"?\n/);
const key = m[1];
fetch(url + "/rest/v1/rpc/exec_sql", {headers:{apikey:key, Authorization:"Bearer "+key}}).then(()=>{});
' 2>/dev/null || true
```

The reliable path (per memory: use PostgREST read on `schema_migrations` is not exposed; use the Management API with vault token, or simply):

```bash
npx supabase migration list 2>/dev/null | tail -8
```

Whichever method works, take **max(applied remote version) + 1** (prod uses a pseudo-date sequence `2026101x`, NOT real dates — expect something like `20261020`). Name the file `<version>_001_recap_jobs.sql`. If `supabase migration list` fails (keychain), fall back to the vault `SUPABASE_ACCESS_TOKEN` + Management API per memory `dalat-supabase-sql-runner.md`.

- [ ] **Step 2: Write the migration**

```sql
-- Recap jobs ride the existing caption_jobs queue (same worker, same
-- claim/complete/fail contract). A recap job is per-EVENT, not per-moment.
-- Also: blog_posts learns which event a recap belongs to, and when the
-- recap was approved for display on the event page. Recap posts stay
-- status='draft' forever — every public blog surface filters
-- status='published', so draft = storage-only by construction.

-- 1. caption_jobs: allow per-event recap jobs
ALTER TABLE caption_jobs ALTER COLUMN moment_id DROP NOT NULL;

ALTER TABLE caption_jobs
  ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE caption_jobs DROP CONSTRAINT caption_jobs_content_type_check;
ALTER TABLE caption_jobs
  ADD CONSTRAINT caption_jobs_content_type_check
  CHECK (content_type IN ('image', 'video', 'recap'));

-- exactly one owner per job: moments own image/video jobs, events own recaps
ALTER TABLE caption_jobs
  ADD CONSTRAINT caption_jobs_owner_check
  CHECK (
    (content_type IN ('image', 'video') AND moment_id IS NOT NULL AND event_id IS NULL)
    OR
    (content_type = 'recap' AND event_id IS NOT NULL AND moment_id IS NULL)
  );

-- one recap job per event (regenerate = delete the old job row first)
CREATE UNIQUE INDEX caption_jobs_event_recap_uniq
  ON caption_jobs (event_id)
  WHERE content_type = 'recap';

-- 2. blog_posts: link recap posts to their event + approval timestamp
ALTER TABLE blog_posts
  ADD COLUMN event_id uuid UNIQUE REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE blog_posts
  ADD COLUMN recap_published_at timestamptz;

COMMENT ON COLUMN blog_posts.event_id IS
  'Set only for event-recap posts. Recap posts stay status=draft (storage-only); recap_published_at gates rendering on the event page.';
```

Notes for the implementer:
- `caption_jobs.moment_id` keeps its UNIQUE constraint — multiple NULLs are allowed in a Postgres unique column, so recap rows don't conflict.
- The `caption_jobs_content_type_check` constraint name comes from Postgres auto-naming of the inline CHECK in `20261019_001_caption_jobs.sql`. **Verify before assuming:** `SELECT conname FROM pg_constraint WHERE conrelid = 'caption_jobs'::regclass AND contype = 'c';` — if the name differs, use the actual name.
- `blog_posts.event_id` is a full UNIQUE (not partial) so PostgREST `upsert onConflict: "event_id"` works; NULL rows (all normal posts) never conflict with each other.
- `claim_caption_jobs()` needs NO change — it returns whole rows and the claim route already forwards `{id, content_type, prompt, media_urls}`.

- [ ] **Step 3: ⛔ SACRED STOP — present the SQL to Yan and wait for explicit approval**

- [ ] **Step 4 (after approval): Apply + verify**

```bash
npx supabase db push
# then VERIFY it was recorded (memory: version collisions skip silently):
npx supabase migration list | tail -5
```

Expected: the new version appears in the applied list. If it silently didn't apply, follow memory `dalat-tribes-no-migration-ci.md`: re-check `schema_migrations`, rename to a unique version, apply manually.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<version>_001_recap_jobs.sql
git commit -m "feat(recap): caption_jobs recap job type + blog_posts event link (migration)"
```

---

### Task 3: generate-recap route becomes an enqueuer

**Files:**
- Rewrite: `app/api/blog/generate-recap/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the file content with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import {
  selectRecapMoments,
  buildRecapPrompt,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "@/lib/blog/recap-input";

/**
 * POST /api/blog/generate-recap  { eventId }
 *
 * Enqueues a keyless recap job on the caption_jobs queue (content_type
 * 'recap'). The Mac-mini worker runs the prompt via `claude -p`;
 * caption-jobs/complete parses the output and writes the storage-only
 * blog_posts draft. Moderator publishes via /api/blog/publish-recap.
 *
 * Privacy fence: only moments with processing_status='completed' AND a
 * non-null ai_description feed the prompt (privacy-gated moments settle
 * 'skipped' and never carry captions). Secret-address events are excluded
 * entirely. detected_text never enters the input.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !hasRoleLevel(profile.role as UserRole, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { eventId } = body as { eventId: string };
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, location_name, starts_at, ends_at, ai_tags, has_private_details, organizers(name), venues(name)"
    )
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.has_private_details) {
    return NextResponse.json(
      { error: "Secret-address events don't get AI recaps" },
      { status: 400 }
    );
  }

  const { data: moments } = await supabase
    .from("moments")
    .select(
      "content_type, moment_metadata(processing_status, ai_description, ai_title, scene_description, mood, detected_objects, ai_tags, video_summary, audio_summary)"
    )
    .eq("event_id", eventId)
    .eq("status", "published")
    .in("content_type", ["photo", "video", "audio", "image"])
    .limit(50);

  const rows: RecapMomentRow[] = (moments ?? []).map((m) => {
    const meta = m.moment_metadata as unknown as Partial<RecapMomentRow> | null;
    return {
      content_type: m.content_type,
      processing_status: meta?.processing_status ?? null,
      ai_description: meta?.ai_description ?? null,
      ai_title: meta?.ai_title ?? null,
      scene_description: meta?.scene_description ?? null,
      mood: meta?.mood ?? null,
      detected_objects: meta?.detected_objects ?? null,
      ai_tags: meta?.ai_tags ?? null,
      video_summary: meta?.video_summary ?? null,
      audio_summary: meta?.audio_summary ?? null,
    };
  });

  const eligible = selectRecapMoments(rows);
  if (eligible.length < 3) {
    return NextResponse.json(
      { error: `Need at least 3 captioned moments (have ${eligible.length})` },
      { status: 400 }
    );
  }

  const photoCount = eligible.filter((m) => m.content_type === "photo" || m.content_type === "image").length;
  const videoCount = eligible.filter((m) => m.content_type === "video").length;

  const prompt = buildRecapPrompt({
    event: {
      title: event.title,
      description: event.description,
      location_name: event.location_name,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      ai_tags: event.ai_tags,
    },
    moments: eligible,
    venueName: (event.venues as unknown as { name: string } | null)?.name || null,
    organizerName: (event.organizers as unknown as { name: string } | null)?.name || null,
    momentCount: eligible.length,
    photoCount,
    videoCount,
  });

  // caption_jobs is service-role-only (RLS, zero policies)
  const admin = getImageJobsAdmin();

  // Regenerate = replace any previous job for this event
  await admin.from("caption_jobs").delete().eq("event_id", eventId).eq("content_type", "recap");

  const { error: insertError } = await admin.from("caption_jobs").insert({
    content_type: "recap",
    event_id: eventId,
    moment_id: null,
    media_urls: [],
    prompt,
    prompt_version: RECAP_PROMPT_VERSION,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    enqueued: true,
    stats: { eligibleMoments: eligible.length, photoCount, videoCount },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: no errors from this route. (Check `lib/ai/image-jobs.ts` exports `getImageJobsAdmin` — the complete route already imports it, so it exists.)

- [ ] **Step 3: Commit**

```bash
git add app/api/blog/generate-recap/route.ts
git commit -m "feat(recap): generate-recap enqueues keyless recap job with structural privacy fence"
```

---

### Task 4: complete route grows a recap branch

**Files:**
- Modify: `app/api/admin/caption-jobs/complete/route.ts`

- [ ] **Step 1: Add the recap branch**

In `complete/route.ts`:

1. Add imports at the top:

```ts
import { parseRecapOutput } from "@/lib/blog/recap-input";
import { triggerTranslationServer } from "@/lib/translations-server";
```

**Check the actual export first:** `grep -n "triggerTranslationServer" lib/translations*.ts` — memory says it exists and returns `{ok, localesWritten}`. Import from wherever it actually lives; if it's only in `lib/translations-client.ts` as `triggerTranslation`, use the server variant the caption pipeline uses (grep `app/api/cron/process-moments/route.ts` for how IT triggers translation and copy that import).

2. Change the job select (line ~72) to include `event_id`:

```ts
.select("id, moment_id, event_id, content_type, status, claimed_at, transcript, transcript_language, media_urls")
```

3. Immediately after the idempotency check (`if (job.status === "done") ...`, line ~79), insert the recap branch BEFORE the existing parse/normalize block:

```ts
  if (job.content_type === "recap") {
    let recap;
    try {
      recap = parseRecapOutput(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const { data: event } = await admin
      .from("events")
      .select("id, title, slug, image_url, created_by")
      .eq("id", job.event_id)
      .single();
    if (!event) {
      return NextResponse.json({ error: "Recap job's event not found" }, { status: 422 });
    }

    const { data: category } = await admin
      .from("blog_categories")
      .select("id")
      .eq("slug", "stories")
      .single();

    // Storage-only draft: status stays 'draft' forever (public blog surfaces
    // all filter status='published'); recap_published_at gates the event page.
    const { data: post, error: postError } = await admin
      .from("blog_posts")
      .upsert(
        {
          event_id: event.id,
          title: `${event.title} — Event Recap`,
          slug: `recap-${event.slug}`,
          story_content: recap.story_content,
          meta_description: recap.meta_description,
          seo_keywords: recap.seo_keywords,
          social_share_text: recap.social_share_text,
          suggested_cta_url: `/events/${event.slug}/moments`,
          suggested_cta_text: recap.suggested_cta_text,
          cover_image_url: event.image_url,
          source: "manual",
          status: "draft",
          category_id: category?.id || null,
          author_id: event.created_by,
          recap_published_at: null,
        },
        { onConflict: "event_id" }
      )
      .select("id")
      .single();

    if (postError || !post) {
      console.error(`[caption-jobs] recap post upsert failed for event ${event.id}:`, postError);
      return NextResponse.json({ error: postError?.message || "post upsert failed" }, { status: 500 });
    }

    await triggerTranslationServer("blog", post.id, [
      { field_name: "title", text: `${event.title} — Event Recap` },
      { field_name: "story_content", text: recap.story_content },
      { field_name: "meta_description", text: recap.meta_description },
    ]);

    const { error: jobUpdateError } = await admin
      .from("caption_jobs")
      .update({
        status: "done",
        result: recap as unknown as Record<string, unknown>,
        provider: provider ? String(provider).slice(0, 50) : null,
        model: model ? String(model).slice(0, 100) : null,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", jobId);
    if (jobUpdateError) {
      console.error(`[caption-jobs] recap job-row update failed for ${jobId}:`, jobUpdateError);
    }

    return NextResponse.json({ ok: true, blogPostId: post.id });
  }
```

Note: NO `technical_content` — it's deliberately dead (keyword ballast; red-team kill). Do not translate it either.

- [ ] **Step 2: Typecheck + run all tests**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
npm run test:run
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/caption-jobs/complete/route.ts
git commit -m "feat(recap): complete route writes storage-only recap draft + triggers 12-locale translation"
```

---

### Task 5: Worker recap branch (text-only claude -p)

**Files:**
- Modify: `scripts/macmini-caption-worker/caption-worker.mjs`

- [ ] **Step 1: Add recap handling**

In `processBatch()` (line ~307), recap jobs must be split out BEFORE `fetchJobMedia` (which fails jobs with no media_urls). Change the job-sorting loop (lines ~317-327) to:

```js
    const imageJobs = [];
    const videoJobs = [];
    const recapJobs = [];
    const files = new Map(); // jobId -> first media path (images)
    const frames = new Map(); // jobId -> all media paths (videos)

    for (const job of jobs) {
      if (job.content_type === 'recap') {
        recapJobs.push(job);
        continue;
      }
      const paths = await fetchJobMedia(job, batchDir);
      if (!paths) continue;
      if (job.content_type === 'video') {
        frames.set(job.id, paths);
        videoJobs.push(job);
      } else {
        files.set(job.id, paths[0]);
        imageJobs.push(job);
      }
    }
```

Then, after the video-jobs loop (`for (const job of videoJobs) ...`, line ~425-427), add:

```js
    // Recap jobs: text-only, one claude session each. The prompt is fully
    // server-built; the worker just runs it and posts the raw output.
    for (const job of recapJobs) {
      if (!claudeUnavailable) {
        try {
          const output = runClaude(job.prompt);
          if (await completeJob(job, output, 'claude-code', CLAUDE_MODEL)) anyCompleted = true;
          continue;
        } catch (err) {
          log(`[caption-worker] claude recap failed id=${job.id}:`, err.message);
          if (err.unavailable) claudeUnavailable = true;
          else {
            await reportFailure(job.id, `claude recap: ${err.message}`);
            continue;
          }
        }
      }
      // Fallback: local text model via ollama (no images).
      if (OLLAMA_FALLBACK_MODEL) {
        try {
          const output = await ollamaText(job.prompt);
          if (await completeJob(job, output, 'ollama', OLLAMA_FALLBACK_MODEL)) anyCompleted = true;
        } catch (err) {
          log(`[caption-worker] ollama recap failed id=${job.id}:`, err.message);
          await releaseJob(job.id, `claude unavailable; ollama recap: ${err.message}`);
        }
      } else {
        await releaseJob(job.id, 'claude unavailable, no fallback configured');
      }
    }
```

And next to `ollamaCaption` (line ~233), add:

```js
async function ollamaText(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_FALLBACK_MODEL,
      stream: false,
      format: 'json',
      options: { temperature: 0.4, num_predict: 1200 },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error('ollama produced no output');
  return text;
}
```

- [ ] **Step 2: Syntax-check the worker**

```bash
node --check scripts/macmini-caption-worker/caption-worker.mjs
```

Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add scripts/macmini-caption-worker/caption-worker.mjs
git commit -m "feat(recap): worker runs text-only recap jobs via claude -p with ollama fallback"
```

- [ ] **Step 4: Deploy to the Mac mini (AFTER the migration is applied + code is pushed)**

```bash
scp scripts/macmini-caption-worker/caption-worker.mjs vibeyang@100.66.94.41:~/dalat-caption-worker/caption-worker.mjs
ssh vibeyang@100.66.94.41 'launchctl kickstart -k gui/$(id -u)/com.goldenfocus.dalat-caption-worker && sleep 3 && tail -5 ~/Library/Logs/dalat-caption-worker.log'
```

Expected: log shows `[caption-worker] starting — ...`. If the ssh user differs, check memory `mac-mini-brain1-access.md`. Do this step LAST (Task 10) — the worker is forward-compatible either way (unknown content_type just won't be claimed until the migration allows it, and old worker + new job type would fail via `fetchJobMedia` and burn attempts — so deploy the worker BEFORE enqueuing any recap job).

---

### Task 6: Publish route + i18n keys

**Files:**
- Create: `app/api/blog/publish-recap/route.ts`
- Modify: all 12 `messages/*.json`
- Modify: `lib/i18n/client-namespaces.ts`

- [ ] **Step 1: Create the publish route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * POST /api/blog/publish-recap  { blogPostId }
 * Moderator-only: stamps recap_published_at so the recap card renders on
 * the event page. The post's status stays 'draft' — it must never appear
 * on blog surfaces.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !hasRoleLevel(profile.role as UserRole, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { blogPostId } = (await request.json()) as { blogPostId: string };
  if (!blogPostId) {
    return NextResponse.json({ error: "blogPostId required" }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from("blog_posts")
    .update({ recap_published_at: new Date().toISOString() })
    .eq("id", blogPostId)
    .not("event_id", "is", null)
    .select("event_id, events(slug)")
    .single();

  if (error || !post) {
    return NextResponse.json({ error: error?.message || "Not a recap post" }, { status: 400 });
  }

  const slug = (post.events as unknown as { slug: string } | null)?.slug;
  if (slug) revalidatePath(`/events/${slug}`);

  return NextResponse.json({ ok: true });
}
```

Note: this UPDATE runs as the logged-in moderator through RLS. **Verify blog_posts RLS lets moderators update** — `grep -rn "blog_posts" supabase/migrations/*blog*` for the update policy. If only authors can update, switch this route to `getImageJobsAdmin()` for the update (auth check already happened above) — that's the expected outcome; note it in the commit message.

- [ ] **Step 2: Add the "recap" namespace to ALL 12 locale files**

In each `messages/<locale>.json`, add a top-level `"recap"` object (alphabetical placement matching each file's convention). All 12 — miss one and that language breaks:

`messages/en.json`:
```json
"recap": {
  "howItWent": "How it went",
  "aiNote": "Summarized by AI from the moments people shared",
  "wentCount": "{count} went",
  "momentsCount": "{count} moments",
  "positiveFeedback": "{percent}% loved it",
  "generate": "Generate recap",
  "enqueued": "The recap is being written — check back in a few minutes",
  "publish": "Publish recap",
  "draftNotice": "Draft — only moderators can see this"
}
```

`messages/vi.json`:
```json
"recap": {
  "howItWent": "Buổi hôm ấy thế nào",
  "aiNote": "AI tóm tắt từ những khoảnh khắc mọi người chia sẻ",
  "wentCount": "{count} người tham gia",
  "momentsCount": "{count} khoảnh khắc",
  "positiveFeedback": "{percent}% yêu thích",
  "generate": "Tạo recap",
  "enqueued": "AI đang viết recap — quay lại sau vài phút nhé",
  "publish": "Đăng recap",
  "draftNotice": "Bản nháp — chỉ moderator nhìn thấy"
}
```

`messages/ko.json`:
```json
"recap": {
  "howItWent": "그날의 이야기",
  "aiNote": "참석자들이 공유한 순간을 AI가 요약했어요",
  "wentCount": "{count}명 참여",
  "momentsCount": "순간 {count}개",
  "positiveFeedback": "{percent}%가 좋아했어요",
  "generate": "리캡 생성",
  "enqueued": "AI가 리캡을 작성 중이에요 — 잠시 후 다시 확인해 주세요",
  "publish": "리캡 게시",
  "draftNotice": "초안 — 운영자만 볼 수 있어요"
}
```

`messages/zh.json`:
```json
"recap": {
  "howItWent": "活动回顾",
  "aiNote": "由 AI 根据大家分享的瞬间整理",
  "wentCount": "{count} 人参加",
  "momentsCount": "{count} 个瞬间",
  "positiveFeedback": "{percent}% 的人喜欢",
  "generate": "生成回顾",
  "enqueued": "AI 正在撰写回顾 — 请稍后再来看看",
  "publish": "发布回顾",
  "draftNotice": "草稿 — 仅管理员可见"
}
```

`messages/ru.json`:
```json
"recap": {
  "howItWent": "Как это было",
  "aiNote": "Сводка от ИИ по моментам участников",
  "wentCount": "Пришли: {count}",
  "momentsCount": "Моментов: {count}",
  "positiveFeedback": "{percent}% в восторге",
  "generate": "Создать рекап",
  "enqueued": "ИИ пишет рекап — загляните через пару минут",
  "publish": "Опубликовать рекап",
  "draftNotice": "Черновик — виден только модераторам"
}
```

`messages/fr.json`:
```json
"recap": {
  "howItWent": "Comment c'était",
  "aiNote": "Résumé par IA à partir des moments partagés",
  "wentCount": "{count} présents",
  "momentsCount": "{count} moments",
  "positiveFeedback": "{percent}% ont adoré",
  "generate": "Générer le récap",
  "enqueued": "L'IA rédige le récap — revenez dans quelques minutes",
  "publish": "Publier le récap",
  "draftNotice": "Brouillon — visible uniquement par les modérateurs"
}
```

`messages/ja.json`:
```json
"recap": {
  "howItWent": "あの日のようす",
  "aiNote": "参加者のモーメントからAIがまとめました",
  "wentCount": "{count}人が参加",
  "momentsCount": "モーメント{count}件",
  "positiveFeedback": "{percent}%が高評価",
  "generate": "リキャップを生成",
  "enqueued": "AIがリキャップを作成中です — 数分後にご確認ください",
  "publish": "リキャップを公開",
  "draftNotice": "下書き — モデレーターのみ表示"
}
```

`messages/ms.json`:
```json
"recap": {
  "howItWent": "Bagaimana ia berlangsung",
  "aiNote": "Diringkaskan oleh AI daripada detik yang dikongsi",
  "wentCount": "{count} hadir",
  "momentsCount": "{count} detik",
  "positiveFeedback": "{percent}% menyukainya",
  "generate": "Jana imbasan",
  "enqueued": "AI sedang menulis imbasan — semak semula sebentar lagi",
  "publish": "Terbitkan imbasan",
  "draftNotice": "Draf — hanya moderator boleh lihat"
}
```

`messages/th.json`:
```json
"recap": {
  "howItWent": "วันนั้นเป็นอย่างไร",
  "aiNote": "สรุปโดย AI จากโมเมนต์ที่ทุกคนแชร์",
  "wentCount": "{count} คนมาร่วมงาน",
  "momentsCount": "{count} โมเมนต์",
  "positiveFeedback": "{percent}% ประทับใจ",
  "generate": "สร้างสรุปงาน",
  "enqueued": "AI กำลังเขียนสรุป — กลับมาดูอีกครั้งในไม่กี่นาที",
  "publish": "เผยแพร่สรุปงาน",
  "draftNotice": "ฉบับร่าง — เห็นได้เฉพาะผู้ดูแล"
}
```

`messages/de.json`:
```json
"recap": {
  "howItWent": "So war's",
  "aiNote": "Von KI zusammengefasst aus den geteilten Momenten",
  "wentCount": "{count} waren da",
  "momentsCount": "{count} Momente",
  "positiveFeedback": "{percent}% fanden es toll",
  "generate": "Recap erstellen",
  "enqueued": "Die KI schreibt das Recap — schau in ein paar Minuten wieder vorbei",
  "publish": "Recap veröffentlichen",
  "draftNotice": "Entwurf — nur für Moderatoren sichtbar"
}
```

`messages/es.json`:
```json
"recap": {
  "howItWent": "Cómo estuvo",
  "aiNote": "Resumido por IA a partir de los momentos compartidos",
  "wentCount": "{count} asistieron",
  "momentsCount": "{count} momentos",
  "positiveFeedback": "Al {percent}% le encantó",
  "generate": "Generar resumen",
  "enqueued": "La IA está escribiendo el resumen — vuelve en unos minutos",
  "publish": "Publicar resumen",
  "draftNotice": "Borrador — solo visible para moderadores"
}
```

`messages/id.json`:
```json
"recap": {
  "howItWent": "Bagaimana acaranya",
  "aiNote": "Dirangkum AI dari momen yang dibagikan",
  "wentCount": "{count} hadir",
  "momentsCount": "{count} momen",
  "positiveFeedback": "{percent}% menyukainya",
  "generate": "Buat rangkuman",
  "enqueued": "AI sedang menulis rangkuman — cek lagi beberapa menit lagi",
  "publish": "Terbitkan rangkuman",
  "draftNotice": "Draf — hanya terlihat oleh moderator"
}
```

- [ ] **Step 3: Register the namespace for client components**

In `lib/i18n/client-namespaces.ts`, add `"recap"` to the `CLIENT_NAMESPACES` array (the lazy list, NOT `CORE_CLIENT_NAMESPACES` — the card is below the fold on past events). **This is the exact miss that failed 3 consecutive prod deploys on Jul 9 (memory) — do not skip.**

- [ ] **Step 4: Run the namespace guard + commit**

```bash
node scripts/check-client-namespaces.mjs   # (check exact script name in package.json prebuild)
git add app/api/blog/publish-recap/route.ts messages/en.json messages/vi.json messages/ko.json messages/zh.json messages/ru.json messages/fr.json messages/ja.json messages/ms.json messages/th.json messages/de.json messages/es.json messages/id.json lib/i18n/client-namespaces.ts
git commit -m "feat(recap): publish route + recap i18n namespace in all 12 locales"
```

---

### Task 7: Recap card on the past-event page

**Files:**
- Create: `components/events/event-recap-card.tsx`
- Modify: `app/[locale]/events/[slug]/page.tsx`

- [ ] **Step 1: Create the card component**

`components/events/event-recap-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Users, Camera, Heart } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface EventRecapCardProps {
  eventId: string;
  /** Localized recap story (already translated server-side); null = no recap yet */
  story: string | null;
  blogPostId: string | null;
  isPublished: boolean;
  isModerator: boolean;
  wentCount: number;
  momentsCount: number;
  /** null unless feedback total >= 10 */
  positivePercent: number | null;
}

/**
 * "How it went" — the past-event recap card. Public once a moderator
 * publishes; moderators see drafts in place with a publish button, or a
 * generate button when no recap exists yet.
 */
export function EventRecapCard({
  eventId,
  story,
  blogPostId,
  isPublished,
  isModerator,
  wentCount,
  momentsCount,
  positivePercent,
}: EventRecapCardProps) {
  const t = useTranslations("recap");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enqueued, setEnqueued] = useState(false);

  // Nothing to show non-moderators until published
  if (!isModerator && (!story || !isPublished)) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/blog/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) setEnqueued(true);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!blogPostId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/blog/publish-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogPostId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">{t("howItWent")}</h3>
        </div>
        {isModerator && story && !isPublished && (
          <button
            onClick={publish}
            disabled={busy}
            className="text-sm font-medium text-primary px-3 py-2 rounded-lg hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-50"
          >
            {t("publish")}
          </button>
        )}
      </div>

      {/* 3 real numbers */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {wentCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {t("wentCount", { count: wentCount })}
          </span>
        )}
        {momentsCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            {t("momentsCount", { count: momentsCount })}
          </span>
        )}
        {positivePercent !== null && (
          <span className="flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" />
            {t("positiveFeedback", { percent: positivePercent })}
          </span>
        )}
      </div>

      {story ? (
        <>
          {isModerator && !isPublished && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("draftNotice")}</p>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={story} />
          </div>
          <p className="text-xs text-muted-foreground/70">{t("aiNote")}</p>
        </>
      ) : isModerator ? (
        enqueued ? (
          <p className="text-sm text-muted-foreground">{t("enqueued")}</p>
        ) : (
          <button
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {t("generate")}
          </button>
        )
      ) : null}
    </div>
  );
}
```

**Check `MarkdownRenderer`'s actual prop name first** (`grep -n "content\|children" components/blog/markdown-renderer.tsx | head`) — if it takes `children` or a different prop, adapt the call. Match its real API, don't guess.

- [ ] **Step 2: Fetch + render in the event page**

In `app/[locale]/events/[slug]/page.tsx`:

1. Add a fetch function near `getMomentsPreview` (~line 411):

```ts
type EventRecap = {
  blogPostId: string;
  story: string;
  recapPublishedAt: string | null;
};

async function getEventRecap(eventId: string, locale: string): Promise<EventRecap | null> {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("id, story_content, source_locale, recap_published_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!post?.story_content) return null;

  let story = post.story_content;
  const sourceLocale = (post as { source_locale?: string }).source_locale ?? "en";
  if (locale !== sourceLocale) {
    const { getBlogTranslations } = await import("@/lib/translations");
    const translated = await getBlogTranslations(post.id, locale, {
      story_content: post.story_content,
    });
    story = (translated as { story_content?: string })?.story_content ?? post.story_content;
  }
  return {
    blogPostId: post.id,
    story,
    recapPublishedAt: post.recap_published_at,
  };
}
```

**Check `getBlogTranslations`' real signature first** (`sed -n '561,600p' lib/translations.ts`) and adapt the call — the fallback-object shape above is a guess at its API; the invariant is: return the locale's `story_content` with fallback to the source text. Note: recap posts are `status='draft'` — verify blog_posts RLS allows an anon/user SELECT of draft rows for the fields used here. If RLS blocks it, fetch via `createStaticClient()`… which still goes through RLS with anon key — in that case use the service-role admin client (`getImageJobsAdmin()`) for this read-only fetch (it's a public card by design once published; for drafts the card gates on `isModerator` server-side below).

2. In the big `Promise.all` (~line 807), add `getEventRecap(event.id, locale)` at the end of the array and `recap` at the end of the destructure. (`locale` is in scope from `params`.)

3. Determine moderator status: the page already fetches the user's role for other admin UI — `grep -n "getUserRole\|role" app/[locale]/events/[slug]/page.tsx | head` and reuse the existing variable (there's a `getUserRole`-style helper at ~line 403). Compute:

```ts
const isModerator = !!userRole && hasRoleLevel(userRole, "moderator");
```

(import `hasRoleLevel` from `@/lib/types` if not already imported).

4. In the `isPast && momentsPreview.length > 0` branch (~line 946), directly AFTER the `PastEventMomentsShowcase` block (~line 979), render:

```tsx
{(recap || isModerator) && (
  <EventRecapCard
    eventId={event.id}
    story={recap?.story ?? null}
    blogPostId={recap?.blogPostId ?? null}
    isPublished={!!recap?.recapPublishedAt}
    isModerator={isModerator}
    wentCount={counts?.going_spots ?? 0}
    momentsCount={momentCounts?.published_count ?? 0}
    positivePercent={
      feedbackStats && feedbackStats.total >= 10
        ? Math.round(feedbackStats.positive_percentage)
        : null
    }
  />
)}
```

**Check the real field names** on `counts` (`get_event_counts` → `going_spots`) and `feedbackStats` (`get_event_feedback_stats` → `total`, `positive_percentage`) — grep their types in `lib/types/index.ts` and use the actual names. Also add the same card render in the past-event-without-moments branch (~line 1068-1076 area) so moderators can generate recaps for events whose galleries live under a linked past event.

5. Privacy: also gate the render on `!event.has_private_details` (secret-address events never show recap UI, even to moderators — matches the enqueue-route 400).

- [ ] **Step 3: Build + typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
npm run build > /tmp/recap-build.log 2>&1; echo "exit=$?"; tail -20 /tmp/recap-build.log
```

**Memory gotcha:** never pipe build output without capturing the exit code — `exit=0` required.

- [ ] **Step 4: Commit**

```bash
git add components/events/event-recap-card.tsx "app/[locale]/events/[slug]/page.tsx"
git commit -m "feat(recap): 'How it went' card on past event pages — stats, localized story, moderator publish flow"
```

---

### Task 8: Caption corpus surfacing (alt text completion + JSON-LD descriptions)

**Files:**
- Modify: `components/moments/past-event-moments-showcase.tsx:81`
- Modify: `components/moments/moments-preview.tsx:97,122`
- Modify: `lib/structured-data.tsx:643-730` (generateCinemaAlbumSchema)

- [ ] **Step 1: Showcase alt text**

`past-event-moments-showcase.tsx` line 81 — the component already receives `MomentWithProfile` (which includes `ai_description` from the RPC). Change:

```tsx
alt={moment.text_content || "Moment"}
```
to
```tsx
alt={moment.ai_description || moment.text_content || "Moment"}
```

- [ ] **Step 2: Preview alt text**

`moments-preview.tsx` — first check its moment prop type includes `ai_description` (it receives the same RPC rows via `momentsPreview`; if its local type is narrower, add `ai_description?: string | null`). Then line 97:

```tsx
alt={moment.text_content || "Video thumbnail"}
```
→
```tsx
alt={moment.ai_description || moment.text_content || "Video thumbnail"}
```

and line 122:

```tsx
alt={moment.text_content || "Moment thumbnail"}
```
→
```tsx
alt={moment.ai_description || moment.text_content || "Moment thumbnail"}
```

- [ ] **Step 3: Per-image descriptions in CinemaAlbum JSON-LD**

In `lib/structured-data.tsx`, `generateCinemaAlbumSchema` (~L643):

1. Add to the `moments` param type (~L651-658): `ai_description?: string | null;`
2. Add a truncation helper above the function (module scope):

```ts
// Alt/description truncation for JSON-LD: keep it human, no keyword tails.
function truncateDescription(text: string, max = 125): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
```

3. In the image-object mapping (~L707-712), add a `description` when available:

```ts
...(m.ai_description ? { description: truncateDescription(m.ai_description) } : {}),
```

**⛔ Do NOT add `detected_text` anywhere in this file** — it's OCR exhaust (name tags, phone numbers). Only `ai_description`.

- [ ] **Step 4: Verify no detected_text leak + build + commit**

```bash
grep -rn "detected_text" components/moments lib/structured-data.tsx app/\[locale\]/events || echo "✓ no detected_text in render paths"
npm run build > /tmp/recap-build2.log 2>&1; echo "exit=$?"; tail -5 /tmp/recap-build2.log
git add components/moments/past-event-moments-showcase.tsx components/moments/moments-preview.tsx lib/structured-data.tsx
git commit -m "feat(seo): surface AI captions — showcase/preview alt text + CinemaAlbum per-image descriptions"
```

---

### Task 9: Full verification gauntlet

- [ ] **Step 1: All tests**

```bash
npm run test:run
```
Expected: PASS including the new `recap-input.test.ts` (the permanent privacy-fence guard).

- [ ] **Step 2: Full build with prebuild guards**

```bash
npm run build > /tmp/recap-final-build.log 2>&1; echo "exit=$?"
```
Expected: `exit=0`. The prebuild chain now includes `check-recap-keyless.mjs` and the i18n namespace guard.

- [ ] **Step 3: i18n completeness sanity**

```bash
for f in messages/*.json; do node -e "const j=require('./$f'); if(!j.recap||Object.keys(j.recap).length!==9) {console.error('MISSING recap in $f'); process.exit(1)}"; done && echo "✓ recap in all 12"
```

- [ ] **Step 4: Local smoke (optional but recommended)**

```bash
npm run dev -- -p 3001
```
Visit `http://127.0.0.1:3001/events/<a-past-event-slug>` (127.0.0.1, not localhost — dev SW stale-chunk gotcha). As a logged-out user: no recap card. Check a gallery page's `<script type="application/ld+json">` includes image `description`s.

---

### Task 10: Ship + backfill (follows the worktree push protocol)

- [ ] **Step 1: ⛔ Confirm with Yan** that the migration (Task 2) is approved and applied, and he's good to push. (Migration in the diff = HOLD per global rules until confirmed.)

- [ ] **Step 2: Push**

```bash
git fetch origin main
git rebase origin/main
npm run build > /tmp/recap-push-build.log 2>&1; echo "exit=$?"   # must be 0 AFTER rebase
git push origin HEAD:main
```

- [ ] **Step 3: Verify deploy green (mandatory)**

```bash
gh api "repos/goldenfocus/dalat-app/commits/$(git rev-parse HEAD)/status" --jq .state
```
Poll while `pending`; must end `success`. A ~6s failure = prebuild guard firing.

- [ ] **Step 4: Verify migration recorded in prod** (`npx supabase migration list | tail -5` — the recap_jobs version must appear).

- [ ] **Step 5: Deploy the worker to the mini** (Task 5 Step 4 commands). Verify the log heartbeat.

- [ ] **Step 6: Backfill the ~10 eligible events**

As Yan/moderator on prod: open each eligible past event → "Generate recap" → wait for the worker (~1 min each) → review the draft card in place → "Publish recap". Find eligible events with:

```sql
-- via the SQL runner (vault token + Management API per memory):
SELECT e.slug, count(*) AS captioned
FROM events e
JOIN moments m ON m.event_id = e.id AND m.status = 'published'
JOIN moment_metadata mm ON mm.moment_id = m.id
  AND mm.processing_status = 'completed' AND mm.ai_description IS NOT NULL
WHERE e.starts_at < now() AND COALESCE(e.has_private_details, false) = false
GROUP BY e.slug HAVING count(*) >= 3 ORDER BY count(*) DESC;
```

- [ ] **Step 7: Human review checklist per recap (all 10):** no person named; no invented numbers/performances; warm Đà Lạt voice; Vietnamese translation spot-check on 2-3 of them.

- [ ] **Step 8: Post-Deploy Summary** (Telegram/inline, per global format), then clean up:

```bash
cd ~/dalat-app
git worktree remove .worktrees/event-archives
git branch -D event-archives
```

---

## Spec coverage self-check

- D1 recap card → Tasks 6, 7 ✓ (storage-only draft: Task 4; no new URLs ✓)
- D2 keyless via caption_jobs → Tasks 2, 3, 4, 5 + ratchet Task 1 Step 6 ✓
- D3 privacy fence → Task 1 (structural filter + permanent tests), Task 3 (has_private_details 400), Task 7 Step 2.5 (render gate). NOTE: spec's "DB column/view" satisfied by the EXISTING materialized predicate `moment_metadata.processing_status` — no new column needed (simpler; status is written only by the gate/pipeline).
- D4 lintRecap / D5 auto-enqueue / D7 share loop / D8 evolution archive → **Phase 2, deliberately not in this plan.**
- D6 caption surfacing → Task 8 (card/lightbox alt already shipped in SEO Phase 1; this completes showcase/preview + JSON-LD; detected_text ban verified by grep) ✓
- Backfill + human review → Task 10 ✓

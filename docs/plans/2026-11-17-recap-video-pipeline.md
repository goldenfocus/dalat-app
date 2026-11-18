# Recap video pipeline: audit and design

Date: 2026-11-17. Branch: `swarm/audit-recaps` (from main `cdacb5d0`). Scope: audit and design only. No application code changed. Nothing was pushed, deployed, or applied to any database. Line numbers refer to `main` unless marked as branch.

## 1. What exists today

**"Recap" today means a written narrative, not a video.** The pipeline turns an event's published moments into an English markdown story (150 to 400 words) stored as a `blog_posts` row with `status='draft'` and a `recap_published_at` stamp. The event page shows it in a card. No photo sequence, clip timeline, or MP4 is produced anywhere on main.

| Stage | Where | What it does |
|---|---|---|
| Schedule | `vercel.json:55-56` | Cron `*/15 * * * *` calls `/api/cron/enqueue-recaps`. |
| Candidate scan | `app/api/cron/enqueue-recaps/route.ts` (GET), `lib/blog/enqueue-recap.ts:50-56` | Finds published, public, ended events with published moments. Budget of 5 enqueues per run (route.ts:58). |
| Eligibility | `lib/blog/enqueue-recap.ts:26-48` | Public = published, no `has_private_details`, not `members_only`. Ended = `ends_at`, or `starts_at + 4h` when `ends_at` is null. |
| Evidence gate | `lib/blog/enqueue-recap.ts:92-187` (`prepareRecapInput`) | Waits for uploads to be quiet 15 min (`UPLOAD_QUIET_MS`, :12) and for every moment to finish analysis. Skips with `awaiting_media` or `too_few_captioned`. |
| Evidence selection | `lib/blog/recap-input.ts:56-58` | Keeps only moments with `processing_status='completed'` and a non-empty description. OCR text is deliberately excluded (header comment). |
| Prompt | `lib/blog/recap-input.ts:13` (`RECAP_PROMPT_VERSION='recap-v3'`), `:90` (`buildRecapPrompt`) | Text prompt. Event details are described as planned, not proof. |
| Enqueue | `lib/blog/enqueue-recap.ts:189` (`enqueueRecapJob`) | One `caption_jobs` row per event with `content_type='recap'`. A prompt or version change re-queues it. |
| Worker | `scripts/macmini-caption-worker/caption-worker.mjs:480-482`, `CLAUDE_MODEL` at :55 | Mac mini runs `claude -p` (Haiku, subscription). Recap is text-only, one session per job. Ollama text fallback (`OLLAMA_TEXT_MODEL`) per its README. |
| Claim | `app/api/admin/caption-jobs/claim/route.ts:27` (POST) | Calls RPC `claim_caption_jobs` (`supabase/migrations/20261019_001_caption_jobs.sql`, function at :43). `FOR UPDATE SKIP LOCKED`, 15-min lease, 3 attempts. Renewal via `renewJobId` + `claimedAt`. Each poll touches the worker heartbeat. |
| Complete | `app/api/admin/caption-jobs/complete/route.ts:110-118` | Parses model output with `parseRecapOutput`; malformed output returns 422. Then writes the storage-only post. |
| Storage | `supabase/migrations/20261021_001_recap_jobs.sql:8-56` | `caption_jobs.event_id`, owner check, unique index `caption_jobs_event_recap_uniq` (:42-44). `blog_posts.event_id` (unique), `recap_published_at`. |
| Display | `app/[locale]/events/[slug]/page.tsx:198-203`, `:599-636` (`getEventRecap`), `:1590-1595` and `:1755-1760` (card), `:1455-1466` (Article JSON-LD) | Shows the card only when `recap_published_at` is set and the event is public and past. |
| Card | `components/events/event-recap-card.tsx:22` | Client component, `useTranslations("recap")`, `OriginalText` on main. |
| Manual regenerate | `app/api/blog/generate-recap/route.ts:19` (POST), `app/api/blog/publish-recap/route.ts:16` (POST) | Moderator-only. Regenerate replaces the job. Publish stamps `recap_published_at`. |
| Keyless ratchet | `scripts/check-recap-keyless.mjs` | Fails if `lib/blog/` imports `@anthropic-ai/sdk`, `openai`, or `@google/generative-ai`. `content-generator.ts` is a frozen legacy exception. The ratchet covers only `lib/blog/`. It does not cover `scripts/`, `app/api/`, or any future render code. |
| Cloudflare Stream helpers | `lib/cloudflare-stream.ts:380` (`createDirectUpload`), `:418` (TUS), `:487` (`getVideoDetails`), `:506` (`enableVideoDownloads`), `:538` (DASH URL) | Ready for uploading MP4 output. Nothing calls them for rendered recaps. |
| ffmpeg | `scripts/macmini-caption-worker/local-audio.mjs:24` | Audio extraction only. No video encode, no HyperFrames, no Remotion anywhere on main (`git grep` for hyperframes, remotion, gsap returns nothing). |

Drift to note: the comment on `app/api/blog/generate-recap/route.ts` says recaps need "≥3 captioned moments". The code only requires at least one eligible moment (`too_few_captioned` when `eligible.length` is 0, `lib/blog/enqueue-recap.ts:164`). The target design's threshold of 8 moments is not implemented.

Timing drift: the target says a short goes out 24h after the event ends. Today the text recap fires as soon as the event has ended, plus 15 min of upload quiet. `AUTO_RECAP_WINDOW_DAYS = 14` (`enqueue-recap.ts:10`) is exported but unused, and the comment at :49 says there is no age cutoff.

## 2. Unmerged branch `origin/fix/automatic-event-recaps`

**Commits:** 9, all dated 2026-09-03, merge-base `8aaf9ae3`, which is about 3 months behind main. Diffstat: 11 files, +285 / -33.

**What it adds**
- Publication review gate. `parseRecapOutput` (branch `lib/blog/recap-input.ts`) now rejects output unless `publication_review` is `{version:"recap-review-v1", approved:true}`. The worker runs a second model pass that fact-checks the draft against the evidence (`scripts/macmini-caption-worker/recap-context.mjs`, `writeReviewedRecap`).
- Long-evidence handling: `splitEvidence` chunks at 12,000 characters, with a 24,000-character prompt cap.
- Prompt `recap-v4`: drops `mood`, `ai_tags`, event `description`, and `ai_tags` from the event block.
- Worker: bounded vision inputs for phone photos, fallback kept active during auth outages, expired-session recovery.
- Event page: `event-recap-refresh.tsx` calls `router.refresh()` every 60 s while the tab is visible. Two mobile layout fixes (`grid-cols-1`, `min-w-0`).

**Conflicts (verified with `git merge --no-commit --no-ff`, then `git merge --abort`; the worktree is clean):**
1. `app/[locale]/events/[slug]/page.tsx`: one hunk. Main has two later lines (`StaffDeskEntry`, `EventPractice`) that the branch does not have. Trivial: keep main's lines. The branch's grid fix in the same region merges.
2. `components/events/event-recap-card.tsx`: one hunk and substantive. The branch turns the card into a server component (`getTranslations` from `next-intl/server`). Main has `"use client"`, `useTranslations`, and `OriginalText`. AGENTS.md requires the `Languages` original-text control on every text-bearing feature. Resolution must keep main's client and original-text structure and port only the branch's logic.

**Side effects that are not conflicts**
- Bumping `RECAP_PROMPT_VERSION` to `recap-v4` makes `enqueueRecapJob` treat every existing recap as changed (`lib/blog/enqueue-recap.ts:203`, `changed` check). The 15-min cron would then re-queue all past recaps, 5 per run, on the Mac worker. This needs a deliberate decision, not a side effect.
- `parseRecapOutput` now requires `publication_review`. Deploying the app before the worker, or the reverse, would make every completion return 422 (or make the worker's output rejected). Deploy order matters.
- No tests were run on the branch in this audit. I did not install dependencies in the worktree.

**Recommendation: do not merge the branch as a unit.**
- Take the publication-review and fact-check gate as a concept. The video recap's QC gate (section 6) needs the same principle: a second pass checks claims against evidence, and nothing publishes without an explicit pass record.
- Take the two mobile layout commits separately. They are small and independent.
- Drop the 60 s refresh polling, or replace it with the translation-style "refresh when ready" pattern already used by the event page.
- Rebase onto main, resolve the card to client plus `OriginalText`, and keep `RECAP_PROMPT_VERSION` unchanged unless a backfill is intended. Put any version bump behind an explicit replace flag.
- Its evidence chunking and the `recap-context.mjs` approach are reusable for the video recap's per-clip analysis.

## 3. Cinema player as the single source for both renderers

**Already data-driven**
- `KEN_BURNS_EFFECTS` (`lib/cinema/ken-burns-effects.ts:16`) is a static array of 8 presets with `name`, `startTransform`, `endTransform`, `transformOrigin`. Each preset maps directly to a keyframe pair.
- `TransitionConfig` (`lib/cinema/transitions.ts:19-23`) carries `type`, `duration`, `easing`.
- `generateEffectSequence` (`ken-burns-effects.ts:179`) already produces a deterministic list for a given count and vertical-index set, provided the random pick is removed.

**Not data-driven or not seekable**
- Effect choice is `Math.random()` (`ken-burns-effects.ts:163`). Transition choice is `Math.random() > 0.9` for slide-push (`transitions.ts:52`). Two renders of the same moments would differ.
- Photo duration is wall-clock: `getRandomDuration()` returns 3 to 9 s with a bell curve (`lib/stores/cinema-mode-store.ts:74-77`), read by `useCinemaTimerDuration` (:486) and passed down from `cinema-slideshow.tsx:73`. Advancement uses `setTimeout` and progress intervals, not a timeline.
- Ken Burns runs as a CSS keyframe animation (`app/globals.css:1057-1072`, `kenBurnsAnimation` with `--kb-start`, `--kb-end`, `--kb-duration`, `linear forwards`). It is applied in `cinema-photo-slide.tsx:133-140`. There is no way to set its progress from a timeline position except through the Web Animations API.
- Transitions are defined twice: as classes in `app/globals.css` (`animate-cinema-*`) and as inline `TRANSITION_STYLES` (`transitions.ts:108`). Both must be kept in sync by hand. The `fade-black` `duration` in `selectTransition` is 600 ms, but the CSS is 300 ms out plus a 300 ms delay on the in-animation, so `duration` is not authoritative.
- CSS easing names (`ease-in-out`, `ease-out`) must be mapped to GSAP eases (for example `power2.inOut`). No mapping exists.
- Reduced motion switches the effect to `getStaticEffect()` (`ken-burns-effects.ts:199-207`) at render time. A render must use an explicit spec value instead of reading `window`.
- Video slides use a real `<video>` element (`cinema-video-slide.tsx`). Seeking it deterministically in a headless renderer is not guaranteed. Frame extraction at fixed fps with ffmpeg is the safer route, but that is a decision, not a verified fact.

**Proposed split**
1. Move the presets into a pure module (`lib/recap-spec/presets.ts`), with numbers instead of strings: `scale0`, `scale1`, `x0`, `x1`, `y0`, `y1` (percent), `origin`. Generate the CSS strings from the numbers, so the existing player output stays identical.
2. Replace `Math.random` with a seeded PRNG (for example mulberry32) keyed by `eventId` plus item index, or store the chosen preset name in the spec. The spec is the source of truth. Playback reads it and does not choose.
3. Add a pure function `kenBurnsAt(preset, t, duration)` and `transitionAt(...)` that return transform, opacity, and clip-path for a given time. The live player drives them from `requestAnimationFrame` with `performance.now()`. HyperFrames drives the same functions from a GSAP timeline by calling them on each tick, or by writing equivalent keyframes generated from the same numbers.
4. Store durations, overlaps, and eases in the spec in milliseconds and named eases. Delete the duplicate CSS definitions once both paths read the same table.
5. Keep reduced motion as a player-only preference that switches to the spec's static variant. Renders always use the spec.

Not determined in this audit: the exact HyperFrames API, its version, and its handling of `<video>` seeking. These must be verified on zang before the design is locked.

## 4. Proposed `recap.json` schema

```ts
// lib/recap-spec/types.ts (proposed, not created)
export type RecapEase = "linear" | "ease-in-out" | "ease-out" | "ease-in";
export type MotionPresetName =
  | "zoom-in-center" | "zoom-out-center" | "zoom-pan-left" | "zoom-pan-right"
  | "zoom-pan-up" | "zoom-pan-down" | "drift-top-left" | "drift-bottom-right"
  | "static";

export interface RecapSpec {
  specVersion: 1;
  kind: "event_recap" | "weekly_compilation";
  eventId: string | null;            // null for weekly compilation
  locale: string;                    // BCP-47; captions are translated per locale
  canvas: { width: 1080; height: 1920; fps: 30 };
  targetDurationMs: { min: 20000; max: 40000 };
  seed: number;                      // makes motion and ordering reproducible
  title: { text: string; durationMs: number };
  endCard: { text: string; ctaUrl: string; durationMs: number };
  items: RecapItem[];                // ordered; sum of effective durations in range
  soundtrack: {
    assetRef: string | null;         // library track id, never a user upload by default
    beatGridMs: number[];            // onsets; transitions snap to these
    gainDb: number;
  } | null;
  captions: CaptionCue[];
  disclosure: {
    aiGeneratedItemIds: string[];    // must include every AI-animated scenery item
    text: string;                    // visible AI disclosure, translated
  };
  provenance: {
    sourceMomentIds: string[];
    rendererVersion: string;         // e.g. "hyperframes@<pinned>"
    promptVersion?: string;          // only for generated text
  };
}

export type RecapItem = PhotoItem | VideoItem | AiSceneryItem;

interface BaseItem {
  id: string;                        // stable; used by captions and QC
  momentId: string | null;
  holdMs: number;
  transitionOut: { type: "crossfade" | "fade-black" | "zoom-blur" | "slide-push"; durationMs: number; ease: RecapEase; snapToBeat: boolean } | null;
}
export interface PhotoItem extends BaseItem { kind: "photo"; mediaUrl: string; motion: MotionPresetName; focal?: { x: number; y: number } }
export interface VideoItem extends BaseItem { kind: "video"; mediaUrl: string; inMs: number; outMs: number; muteAudio: true }
export interface AiSceneryItem extends BaseItem { kind: "ai_scenery"; mediaUrl: string; motion: MotionPresetName; aiLabel: string; noFaces: true }

export interface CaptionCue {
  itemId: string;
  startMs: number;
  endMs: number;
  text: string;                      // translated per locale; original kept for OriginalText
  originalText: string;
  sourceLocale: string;
}
```

Zod sketch (proposed, not created):

```ts
import { z } from "zod";
const ms = z.number().int().nonnegative();
const motion = z.enum(["zoom-in-center","zoom-out-center","zoom-pan-left","zoom-pan-right",
  "zoom-pan-up","zoom-pan-down","drift-top-left","drift-bottom-right","static"]);
const transition = z.object({
  type: z.enum(["crossfade","fade-black","zoom-blur","slide-push"]),
  durationMs: z.number().int().min(150).max(1000),
  ease: z.enum(["linear","ease-in-out","ease-out","ease-in"]),
  snapToBeat: z.boolean(),
}).nullable();
const base = { id: z.string().min(1).max(64), momentId: z.string().uuid().nullable(), holdMs: ms.min(500), transitionOut: transition };
const item = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("photo"), mediaUrl: z.string().url(), motion }),
  z.object({ ...base, kind: z.literal("video"), mediaUrl: z.string().url(), inMs: ms, outMs: ms, muteAudio: z.literal(true) })
    .refine(v => v.outMs > v.inMs, "outMs must follow inMs"),
  z.object({ ...base, kind: z.literal("ai_scenery"), mediaUrl: z.string().url(), motion, aiLabel: z.string().min(1), noFaces: z.literal(true) }),
]);
export const RecapSpecSchema = z.object({
  specVersion: z.literal(1),
  kind: z.enum(["event_recap","weekly_compilation"]),
  eventId: z.string().uuid().nullable(),
  locale: z.string().min(2),
  canvas: z.object({ width: z.literal(1080), height: z.literal(1920), fps: z.literal(30) }),
  seed: z.number().int(),
  items: z.array(item).min(1).max(60),
  captions: z.array(z.object({ itemId: z.string(), startMs: ms, endMs: ms, text: z.string().max(90), originalText: z.string(), sourceLocale: z.string() })),
  disclosure: z.object({ aiGeneratedItemIds: z.array(z.string()), text: z.string().min(1) }),
  provenance: z.object({ sourceMomentIds: z.array(z.string().uuid()), rendererVersion: z.string() }),
}).superRefine((spec, ctx) => {
  // Cross-field rules: AI items must be disclosed; total duration within 20-40 s; ids unique.
});
```

Rules the schema must enforce beyond shape: every `ai_scenery` id appears in `disclosure.aiGeneratedItemIds`; `kind` `weekly_compilation` has `eventId: null`; total duration (sum of `holdMs` minus transition overlaps) is 20,000 to 40,000 ms; item ids are unique; caption `itemId` exists; `text` is short enough for the safe area (length budget to be set after a visual test).

Privacy in the spec: `mediaUrl` values are signed or internal references resolved server-side just before render. The spec never contains OCR text, names read from images, phone numbers, or raw transcripts.

## 5. Proposed `render_jobs` (NOT APPLIED)

Nothing below has been applied to any database. No Supabase tool was called. Names follow the caption-jobs and image-jobs patterns.

```sql
-- NOT APPLIED. Proposed migration: supabase/migrations/<date>_001_render_jobs.sql
CREATE TABLE render_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('event_recap','weekly_compilation')),
  event_id        uuid REFERENCES events(id) ON DELETE CASCADE,
  spec            jsonb NOT NULL,
  spec_hash       text NOT NULL CHECK (spec_hash ~ '^[0-9a-f]{64}$'),
  renderer        text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','qc_pending','done','failed','dead')),
  attempts        int  NOT NULL DEFAULT 0,
  max_attempts    int  NOT NULL DEFAULT 3,
  claim_token     uuid,                      -- fences stale workers
  claimed_by      text,
  claimed_at      timestamptz,
  heartbeat_at    timestamptz,
  lease_expires_at timestamptz,
  output          jsonb,                     -- { streamUid, durationMs, sha256, bytes }
  qc_report       jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT render_jobs_event_required CHECK (kind <> 'event_recap' OR event_id IS NOT NULL),
  CONSTRAINT render_jobs_idempotent UNIQUE (kind, event_id, spec_hash)
);
CREATE INDEX render_jobs_queue ON render_jobs (status, created_at);
CREATE UNIQUE INDEX render_jobs_one_active ON render_jobs (kind, event_id)
  WHERE status IN ('pending','processing','qc_pending');
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;   -- zero policies: service_role only
REVOKE ALL ON render_jobs FROM anon, authenticated;
```

RLS notes: enable RLS with no policies, as `caption_jobs` does. Revoke table and function privileges from `anon` and `authenticated`. Public event pages read only the approved output through an API or a view that exposes `streamUid` once `status='done'` and the event is public (same gate as `isRecapEventPublic`). Spec and QC reports are never public. The spec contains evidence references, so it stays server-side.

RPCs (all `SECURITY INVOKER`, `SET search_path = public`, execute granted to `service_role` only):

- `claim_render_jobs(p_worker text, p_limit int) RETURNS SETOF render_jobs`: in one statement, marks expired leases as `dead` when `attempts >= max_attempts`, then selects `pending` rows, or `processing` rows with an expired `lease_expires_at`, `ORDER BY created_at FOR UPDATE SKIP LOCKED`. It sets `status='processing'`, `attempts = attempts + 1`, a new `claim_token`, `claimed_by`, and `lease_expires_at = now() + 5 min`.
- `heartbeat_render_job(p_job uuid, p_token uuid) RETURNS timestamptz`: extends `lease_expires_at` by 5 min only when `status='processing'` and the token matches. Returns NULL otherwise, which tells the worker to abort. Heartbeat every 60 s.
- `complete_render_job(p_job uuid, p_token uuid, p_output jsonb, p_qc jsonb) RETURNS boolean`: requires a matching token and `processing`. Sets `qc_pending` when QC is still to run, or `done` when the QC report passed. Stores `output` and `qc_report`.
- `fail_render_job(p_job uuid, p_token uuid, p_error text, p_retryable boolean, p_release boolean) RETURNS boolean`: retryable errors return to `pending` without consuming the attempt when `p_release` is true, matching the caption worker's release semantics. Terminal errors set `failed`. Exhausted retries set `dead`.

Dead-letter: `status='dead'` is reached only through the claim reaper or after `max_attempts`. Dead rows are visible to moderators through an admin route. They are never retried automatically.

## 6. Worker contract (modelled on the translation and caption workers)

**Transport.** The Mac pulls. It makes outbound HTTPS calls only, to a claim route under `app/api/admin/render-jobs/` with bearer auth, following `caption-jobs/claim`. This keeps database credentials off the Mac. The alternative is a direct service-role connection from the translation-worker pattern. That choice is open; the HTTP route matches the caption worker that already runs on this Mac.

**Inputs.** A claimed job returns `{id, claim_token, kind, spec, renderer, mediaUrls}`. `mediaUrls` are short-lived (30 min) signed URLs created server-side, one per `mediaUrl` in the spec. The worker never discovers media on its own. Per the privacy gate, the claim route re-runs `isRecapEventPublic` and rejects with `privacy_gate`, as the caption claim does today (`caption-jobs/claim/route.ts`).

**Steps.** Download to a fresh per-job directory. Validate each file's size and content type. Render the spec headless with the pinned renderer version. Encode H.264 MP4, 1080x1920, 30 fps, yuv420p, AAC. Run the QC gate. Upload to Cloudflare Stream with `createDirectUpload` and a job-specific name. Then call `complete_render_job` with `{streamUid, durationMs, sha256, bytes}` and the QC report. Delete the work directory.

**Outputs.** One Stream video UID per job, a QC report, and the `output` JSON. Nothing is written to `blog_posts` or to the event page by the worker. Publication is a separate, gated step.

**Failure handling**
- Lost connection or 5xx from the app: retry with backoff, keep the claim, let the lease expire.
- Claude-style outage (here: renderer not available, ffmpeg missing): `fail_render_job` with `p_release=true`. The attempt is refunded, as the caption worker does for quota errors.
- Media download failure: retryable, counts an attempt.
- Renderer crash, timeout (default 10 min per job), or invalid spec: retryable once, then `failed`.
- QC failure: terminal `failed` with the failed check named. No automatic re-render with the same spec. The spec must change first.
- Lease expiry while working: the next claim reclaims it. The old worker's heartbeat and complete calls fail on token mismatch and it discards its output.

**Idempotency**
- `spec_hash` is SHA-256 of the canonical JSON of the spec plus `renderer`. The unique key `(kind, event_id, spec_hash)` means the same spec is never queued twice.
- The output is keyed by `spec_hash`. A retry that finds an existing Stream UID with the same `sha256` reuses it instead of uploading again.
- `complete_render_job` is a no-op when the job is already `done` with the same `spec_hash`.
- Regeneration creates a new spec hash. The previous output is kept until the new one passes QC and is approved.

**Worker logging.** A heartbeat file and a `--audit` mode that makes no database changes, following `scripts/translation-worker`. Work receipts contain media and must stay local and out of git.

## 7. QC gate checklist

Each check writes a named result into `qc_report`. Any failure blocks publication.

- [ ] Duration between 20.0 and 40.0 s (ffprobe on the encoded file, not the spec).
- [ ] Resolution exactly 1080x1920, 30 fps constant, H.264 High, yuv420p, AAC stereo.
- [ ] Loudness: integrated -14 LUFS within +/-1 LU and true peak at or below -1 dBTP (`loudnorm` measure pass).
- [ ] No black frames longer than the title or end-card allowance (`blackdetect`). Title and end card are the only permitted black-ish holds.
- [ ] No frozen frames longer than 1.0 s on photo items, and no frozen video clip longer than 1.5 s (`freezedetect`). Threshold values are proposals to be tuned on real output.
- [ ] Every caption lies inside the 9:16 safe area (top and bottom bands kept clear of text, plus side margins). Exact band sizes are to be set and checked visually on a test render.
- [ ] Captions equal the spec's translated text for the locale. Each caption has an original-text source and no empty translation.
- [ ] Every `ai_scenery` item is listed in `disclosure.aiGeneratedItemIds`. The visible disclosure text is present in the video or the end card, and in the caption or description.
- [ ] `ai_scenery` items contain no faces. Method not determined: an automatic face detector must be chosen and its false-negative rate stated, or a human must review every AI item before publication.
- [ ] No OCR-like text, name tags, phone numbers, or street-level address in any frame or caption. Human sampling of frames at 1 fps until the detector is trusted.
- [ ] Output sha256 and byte size recorded and match the uploaded file.
- [ ] Spec validates against the Zod schema and its `spec_hash` matches the job row.
- [ ] Source moments are all still `published` and the event is still public at QC time (re-run the same gate used at claim).

## 8. Constraints from AGENTS.md (and related repo rules) that apply

- **AI imagery disclosure.** Any AI-generated scenery must be labelled AI-generated illustrative imagery, never documentary event photography. The disclosure appears in the video, its alt or caption text, and the promo caption. Weekly compilations with AI scenery must say so. AI scenery never stands in for event photos.
- **Hero and promo rules.** A generated short is not an event hero. Any use of a recap frame as an event hero or promo gallery item follows the Activity Graph visual truth standard: owner-authorized or disclosed AI imagery, no generic or other-event imagery, and inspection on the live route before handoff.
- **Translation is a release requirement.** Recap captions, title and end-card text, the disclosure, and the social share text are all text-bearing. Each needs a `lib/translations/registry.ts` entry and visibility rule, invalidation on source change, localized metadata, and original-text access using `OriginalText` or `TranslatedContent`. Any new client card follows main's client pattern, not the branch's server version. Human review is never presented as AI review, and vice versa.
- **Privacy.** Only public, non-private, non-members-only events. The gates are `isRecapEventPublic` and the claim-time re-check. OCR text stays out of prompts and captions (`recap-input.ts` header). No names of people or contact details in captions.
- **Keyless recaps.** `scripts/check-recap-keyless.mjs` forbids paid-SDK imports in `lib/blog/`. The render path must not add a paid API key dependency. Any model call in the weekly compilation (AI-animated scenery) must go through the same keyless or subscription route, and the ratchet should be extended to cover new recap directories before that code exists.
- **No unreviewed publication.** Auto-publication must be gated on QC pass plus the publication review record. A model's own "approved" flag is not sufficient.

## 9. Phased build order

1. **Phase 0, this document.** Decide the branch disposition (section 2), the render-job transport (section 6), and the QC thresholds to tune.
2. **Phase 1, extract the motion and transition math.** Move presets to numeric form and add pure `kenBurnsAt` and `transitionAt`. Replace `Math.random` with a seeded PRNG. Live player output must be unchanged, checked by unit tests and a visual diff. Ships alone.
3. **Phase 2, spec types and builder.** `lib/recap-spec/` with the TypeScript types, Zod schema, and a pure builder from moments. A migration only if a `recap_specs` table is needed. Unit tests on ordering, durations, and disclosure rules.
4. **Phase 3, cinema player reads the spec** behind a flag. Same visuals; the spec now drives timing.
5. **Phase 4, local render spike on zang.** One hand-written spec, one HyperFrames composition, one encoded MP4. Measure determinism (two renders, identical hash), duration, and loudness. Verify HyperFrames API and video seeking here. No database.
6. **Phase 5, QC script** (ffprobe, loudnorm, blackdetect, freezedetect, sha256). Run it on the spike output.
7. **Phase 6, `render_jobs` migration and RPCs**, reviewed and applied only after the owner's approval. Then the claim, heartbeat, and complete routes with tests following `caption-jobs` route tests.
8. **Phase 7, worker skeleton** on zang with `--audit`, a 60 s heartbeat, and a manual enqueue of one test event. Output stays private (no event-page display).
9. **Phase 8, display behind approval.** Stream UID shown on the event page only after a moderator approves the QC report. Translation registry and captions wired in.
10. **Phase 9, automatic enqueue** at 24 h after end with at least 8 moments, after the ≥8 threshold and timing are implemented in `enqueue-recap.ts` and covered by tests.
11. **Phase 10, weekly compilation** with AI scenery, face-check decision made, disclosure tests added, and the keyless ratchet extended.
12. **Phase 11, social auto-publish.** A separate design. Not covered here.

Each phase ships on its own, and phases 1 to 3 do not change any production behaviour.

## 10. Gaps against the target design

- **Output type.** Today: text narrative in `blog_posts`. Target: 20 to 40 s 9:16 MP4 driven by `recap.json`. No spec, no timeline, no video encode, no QC, no output store.
- **Render control plane.** Today: `caption_jobs` with a text-only Haiku prompt. Target: `render_jobs` with heartbeat, fenced leases, retries, and dead-letter. No table, RPC, or heartbeat exists for rendering.
- **Determinism.** Today: `Math.random` in effect and transition choice, wall-clock timers, CSS keyframes. Target: seeded, timeline-seekable, reproducible renders.
- **Trigger.** Today: about 15 minutes after the event ends, at least one eligible moment. Target: 24 h after end, at least 8 moments. The code's comment (≥3) disagrees with the code (≥1).
- **Weekly compilation and AI scenery.** Not started. No disclosure fields, no face checks, no weekly scheduler.
- **Social publishing.** Not started. Text recaps are published only to the event page.
- **Branch.** Carries a useful fact-check gate and worker fixes, but conflicts with main's translation structure and would re-queue all past recaps if merged as-is.

Items I could not determine from the repo: the HyperFrames version, API, and its handling of video seeking; whether zang and the Mac mini have ffmpeg and a headless browser installed; the Cloudflare Stream plan limits for the render volume; whether the owner wants the render transport to be HTTP claim or direct database; the face-detection method for AI scenery; the exact safe-area bands for 9:16 short-form platforms.

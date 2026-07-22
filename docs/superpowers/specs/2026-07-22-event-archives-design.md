# Event Archives 100x — Design Spec

**Date:** 2026-07-22 · **Status:** Approved by Yan (direction), spec pending review
**Origin:** 12-agent panel (5 lenses + 3 wildcards + 3 red-team angles + synthesis), 40 ideas red-teamed.

## Goal

Every ended event's page becomes a permanent, grounded, 12-locale "how it went" chapter —
generated for free (keyless chain), published behind quality/privacy gates, compounding
forever into a living archive of Đà Lạt's evolution. Plus: the 1,850 already-generated AI
captions become the site's image-search surface.

## What exists (verified)

- `lib/blog/event-recap-generator.ts` — AI recap → draft blog post + 12-locale translation.
  Admin-only button (`/api/blog/generate-recap`), requires ≥3 published moments, reads
  `moment_metadata`. Uses the **paid Anthropic SDK directly** (violates keyless rule).
- `moment_metadata` — ai_description/ai_title/ai_tags/mood/quality_score/video_transcript/
  detected_text/dominant_colors per moment. Keyless caption pipeline (caption_jobs queue →
  Mac mini `claude -p` Haiku worker, qwen2.5vl fallback) live; backfill 1,850/2,393.
- Past-event pages already reorder to make moments the hero; cinema-mode gallery at
  `/events/[slug]/moments` with CinemaAlbum JSON-LD.
- `content_translations` 12-locale fan-out; **claude-first via mini worker since Jul 22**
  (Google key dependency resolved for new translations).
- Month archives at `/events/archive/[year]/[month]`; sitemap + hreflang + IndexNow live.
- Per-event social data: RSVPs+profiles, event_feedback (private form), comments, likes.
- Reality: only ~10 of 156 past events currently have ≥3 captioned moments. Value is
  forward-compounding, not a backfill bonanza.

## Design

### D1. Recap card on the past-event page (the spine)

- Render the recap ON `app/[locale]/events/[slug]/page.tsx` when the event is past and a
  published recap exists. **No new URLs.** The blog post detour is dead: recap content
  stays in `blog_posts` as storage only (the generator already writes there and translation
  wiring exists) but is excluded from the blog index, blog sitemap, and any public blog
  surface — rendered solely as a card section on the event page. No new table.
- Card shape, not essay: 3 real numbers (went-count, moments count, feedback verdict only
  when n≥10) + ≤3 sentences of AI prose + link into the moments gallery. All UI copy via
  `t()` in all 12 locale files.
- Prose translated via existing `content_translations` fan-out (claude-first worker).

### D2. Keyless generation via caption_jobs

- Port `event-recap-generator.ts` off `@anthropic-ai/sdk` → the Mac mini worker, as a new
  `job_type` on the **existing** caption_jobs queue (a dedicated recap queue at ~1 job/week
  would rot silently). May need a CHECK-constraint migration on the queue table — Tier A.
- Prompt fixes: delete the "mention specific people/performers" instruction; drop
  `technical_content` entirely (keyword ballast); `detected_text` never enters recap input.
- Prebuild ratchet: grep `lib/blog/` for `@anthropic-ai/sdk` → fail build.

### D3. Privacy fence (precondition for everything)

- Today the fence is transitive: privacy-gated moments merely happen to have null captions,
  and `generate-recap` selects `moment_metadata(*)` unfiltered. Materialize the privacy
  predicate as a DB column/view that BOTH the caption pipeline and the recap query filter
  on. Failing-test-first guard that stays in the suite. **Tier A migration — Sacred Stop.**
- Events with `has_private_details` (secret address) are excluded from recaps entirely.
- Name policy in lint: block any capitalized name not present in event/organizer/venue
  fields. Proper nouns pass through translations verbatim.
- Feedback comments are NEVER quoted (collected via private form — customer promise).
  Only aggregate verdict at n≥10.

### D4. Publish gate — `lintRecap()`

- Deterministic lint before a recap goes live: grounding check (numbers/nouns must appear
  in source data), name policy, sameness/n-gram check vs. other recaps, schema parse.
- Clean → auto-publish + IndexNow ping. Flagged → hold, surface in Telegram briefing.
- First 20 recaps human-reviewed before the cron earns auto-publish.
- Eligibility: ≥3 moments **with non-null ai_description** (not just ≥3 moments).

### D5. Auto-enqueue flywheel

- Cron enqueues a recap job when an event ends and passes eligibility. Backfill (~10
  events) driven through the existing admin button, human-reviewed, dripped (no bulk
  IndexNow blast).

### D6. Caption corpus surfacing (build first — biggest win/effort)

- Join `moment_metadata.ai_description` into gallery grid, event pages, and lightbox as:
  `alt` text (truncated ~125 chars), visible quiet captions, ImageObject/CinemaAlbum
  JSON-LD descriptions (mirroring visible DOM text, capped top-N per page).
- Hard bans: `detected_text` never reaches alt/captions/JSON-LD (OCR exhaust — name tags,
  phone numbers); privacy filter is the structural predicate from D3, not caption-null-ness.
- Zero AI calls, fully retroactive, ~1,850 captions live today.

### D7. Share loop — "you might be in the photos"

- On recap publish: one notification per going-RSVP via `scheduled_notifications` (existing
  5-min delivery cron), deep-linking to the past-event page. Copy is probabilistic ("you
  might be in them") — never name/face matching. Skip `has_private_details` events.
- Locale-aware OG share cards for past-event pages (pattern: existing `opengraph-image.tsx`
  implementations) so a `/ko/` link pastes beautifully into KakaoTalk/Zalo.
- Needs a new `notification_type` enum value — **ALTER TYPE ADD VALUE, Tier A** (known
  trap: TS union drifts from DB enum and inserts fail silently).

### D8. Computed evolution archive (deterministic, AI-optional)

- Enrich `/events/archive/[year]/[month]` (recap first-sentence + best photo + aggregates)
  and add `/archive/[year]` rollups: event density, top ai_tags, dominant_colors "palette
  of the year", top venues. One SECURITY DEFINER RPC, ISR via `createStaticClient`.
- Renders complete even if every AI pipeline is dead. Framed as "on dalat.app", not
  city-truth. Small-n suppression (no per-venue stats <3 events). LLM month-prose only
  when a month has ≥5 recap-eligible events (currently none — that threshold IS the flag).

## Killed by red team — do not build

Auto-published recap blog posts (doorway dupes) · guestbook v1 · voice notes · personal
Wrapped · publishing feedback quotes or AggregateRating markup · FAQPage/speakable JSON-LD
(deprecated for non-gov sites) · dedicated recap job queue · translation budget governor.

**Wildcards parked for later:** venue timelines/biographies (SQL half anytime; AI prose
behind owner approval) · organizer bragging kit · DTO-based MCP server · Wrapped
(revisit Nov 2027).

## Ship sequence

- **Phase 1 (days):** D3 privacy fence → D6 caption surfacing → D2 keyless port →
  D1 recap card + 10-event human-reviewed backfill.
- **Phase 2 (a week):** D4 lint gate → D5 auto-enqueue → D7 share loop + OG cards →
  D8 month-archive enrichment.
- **Phase 3 (later):** `/archive/[year]` pages, venue timelines, recap-fed `llms-full.txt`,
  monthly chronicle prose, organizer kit.

## Verification

- Privacy: failing test first — a gated moment must be invisible to recap query + caption
  join + JSON-LD; 20-image person-heavy red-team spot check before bulk publish.
- Quality: 10 backfill recaps human-reviewed; lint gate blocks ungrounded numbers/names.
- SEO safety: no new URLs; drip publishing; per-page facts differ; `technical_content`
  deleted.
- Standard gauntlet per push: safe-build, check-i18n, i18n keys in all 12 `messages/*`.

## Open Tier-A items (Sacred Stops — explicit confirm before executing)

1. Privacy-fence migration (D3): column/view + backfill of the predicate.
2. caption_jobs `job_type` CHECK-constraint migration (D2), if constraint exists.
3. `ALTER TYPE notification_type ADD VALUE` (D7, Phase 2).

# dalat.app modernization plan

Status: v3, 2026-11-18. Wave 1 is live on production (PR #132, merge `c00df3d`). Wave 2 is open as PR #133 and PR #134, not merged.
Board: https://claude.ai/artifact/WrXjQHthyaGDzptVBat6kn

## Goal
Uploading is fun, the cinematic view is back and better, no event is ever silent, and every event's photos and clips automatically become a promotional short that gets published.

## Core idea
One recap spec per event (a JSON timeline) drives two renderers: the live in-browser cinema player, and an MP4 export. Quality lives in the repo (templates, schemas, QC gates), not in any one model, so any AI can run the flow when another runs out of tokens.

## Decisions locked (Yang, 2026-11-17)
- Recaps auto-publish. No organizer approval step.
- Machines: zang has 48 GB (primary render worker, local LTX and ACE-Step). The GoldenFocus Mac mini has 24 GB (second worker, HyperFrames renders).
- Suno stays manual for hero tracks: it has no official public API. The default score is a house library (ChicoMan catalogue plus ACE-Step batches generated locally).
- No AI animation of people's faces. AI-animated scenery must be disclosed as AI (AGENTS.md rule).
- Product path uses no subscription CLI: Macs pull jobs from a Supabase queue.

## What exists (verified 2026-11-17)
- Canonical repo: `~/dalat-app/goldenfocus-dalat-app` (GitHub goldenfocus/dalat-app), 74 worktrees in `~/dalat-app/.worktrees`. The local `main` checkout is stale; real work happens in worktrees.
- Cinema player: `components/moments/cinema-mode/*`, `lib/cinema/*`, `lib/stores/cinema-mode-store.ts`.
- "Recap" today is a text narrative (150 to 400 words) written by Haiku through `claude -p` on the Mac mini, stored as a draft `blog_posts` row. There is no video path yet.
- Gallery uploads run through `event-uploader.tsx`, `lib/uploads/engine.ts` and `/api/moments/uploads`. `components/events/event-media-upload.tsx` is only the flyer/cover uploader.
- `~/chicoman/studio` is a working short-video CLI: idea, Seedance 2.5 via Higgsfield, HyperFrames finish, YouTube publish (private by default), `studio status`, credit guardrails.
- `~/videos` holds Remotion projects and the Café Bajo builds.
- Local tools on zang: HyperFrames, Phosphene (LTX), ACE-Step 1.5, Real-ESRGAN, insightface, rembg, Ollama.
- A `/v3` "Fog Hour" redesign is in opt-in preview (PR 115).

## Wave 1: shipped 2026-11-18 (PR #132)
| Area | What is live |
|---|---|
| Cinema motion | Photos fill the screen (cover, or whole photo over a blurred copy when cropping would be heavy). Ken Burns runs with or without music, freezes on pause, crossfade-only under reduced motion. |
| Cinema controls | One transport for slides and music, music-note chip separate from the speaker, one tap reveals all controls, story-style progress, Gallery button, first-visit hint. 19 strings in 12 locales. |
| House soundtrack | Deterministic fallback when an event has no playlist. Dark until `house_tracks` exists and has rows. |
| Moments performance | Event gallery grid is in the server HTML. Responsive image ladders for feed and thumbnails, eager first image, real alt text. |
| Docs | Upload flow audit, recap pipeline design, auto-score plan (`docs/plans/2026-11-17-*`). |

Checks before merge: 1999 tests, tsc, eslint 0 errors, prebuild checks, Vercel build. A review bot found one race (music baseline vs page autoplay); fixed in `1e12d74` with a test.

Checked on production at phone size (375x812), Language Exchange album: cinema opens, the photo sits whole over its blurred copy, the transform changes over time, the hint shows, a tap reveals the controls, Pause freezes the photo mid-move and flips the music chip, and the server HTML carries 20 gallery images at 240 to 640 px widths.

Not checked: audio actually playing and stopping (the test browser had no user gesture), a real phone, low-end performance of the blur.

Findings that shaped the plan:
- The "photos don't move" bug had no single regression commit. Photos were never full screen, and motion duration came from a store timer that is 0 at start. The slide was rewritten.
- `feat/effortless-event-uploads` already landed on main as squash #108. Drop the branch (tag the tip first).
- `fix/automatic-event-recaps`: do not merge as a unit. Keep the fact-check gate idea and the two mobile layout commits.
- `fix/automatic-event-music` is worth merging; house music should be the last fallback inside its `resolveEventMusic`.
- "Recap" today is a text narrative fired about 15 minutes after an event ends. The target is a video, 24 hours after, with 8+ moments.

## Wave 2: open PRs (not merged)
| PR | What it adds | Before merging |
|---|---|---|
| #133 Recap foundations | Seeded numeric cinema motion presets, `RecapSpec` v1 + pure builder, `render_jobs` migration + RPCs, worker shell with dry-run renderer, `enqueueRecapRender`. 2065 tests pass. | Look at cinema once in a browser. The migration is unexecuted: apply it on a branch database first. |
| #134 Uploads | HEIC converts to JPEG on the device (native on Safari, WASM elsewhere, server fallback kept). One toast when unfinished uploads resume. 2009 tests pass. | Test on a real iPhone: 20 HEICs, orientation, no GPS, force-quit and reopen. |

## Owner actions
1. Apply `supabase/migrations/20261204_001_house_tracks.sql` and load tracks, or the soundtrack fallback stays dark. Until then each no-playlist album makes one failing lookup.
2. iPhone test for PR #134, then merge.
3. Decide for PR #133: service role key on the Macs or an HTTP claim route; silent recaps allowed or not; chronological or engagement shot order.
4. Decide: one house track per event or a queue of three (current); hide the playlist link on house tracks.
5. Start the TikTok, Meta and YouTube app reviews.

## Track B: the studio (wave 2)
1. Promote `~/chicoman/studio` to the single production repo. `AGENTS.md` is the canonical playbook; other CLIs' config points to it.
2. Stages on disk: brief, storyboard, assets, compose, render, qc, publish. `studio status` is the handoff note between AIs.
3. `models.yaml` routes by role (director, builder, bulk) with ordered fallbacks.
4. Templates per format: `recap-short` (dalat.app), `kindness-short` (existing ChicoMan), `music-video`, `lesson` (EzViet).
5. QC gate: ffprobe checks plus a contact-sheet review by a different model than the author.
6. Renderer: HyperFrames for new work. Existing Remotion projects stay as they are.

## Recap tiers
| Tier | What | When |
|---|---|---|
| 0 | Live cinema player | Every event |
| 1 | 20 to 40 second 9:16 short, real photos and clips beat-cut to a house track | Every event with 8+ moments, 24h after it ends |
| 2 | LTX motion on a few scenery shots | Weekly "This week in Đà Lạt" |
| 3 | Seedance / Grok, hand-directed | ChicoMan productions |

Queue: Supabase `render_jobs`, claimed with SKIP LOCKED, heartbeat, retries, dead-letter. Output to Cloudflare Stream, then event page, then auto-publish.

## Sequence
- Wave 1: live.
- Wave 2: PRs #133 and #134 open. Still to build: the HyperFrames `recap-short` template and real renderer on zang, the enqueue trigger, studio consolidation (Track B).
- Wave 3: ACE-Step house library batch, Mac mini as second worker, QC gate, auto-publish to dalat.app's own channels.
- Wave 4: LTX tier, weekly compilation, user-connected social accounts once platform app reviews clear.

## Open risks
- Auto-publishing photos of people with no approval step: keep a fast takedown path and an uploader opt-out.
- The blurred backdrop (`blur-2xl`) may stutter on low-end phones.
- The mini-player still overlaps cinema on mobile.
- Wave 1 touches files the `/v3` redesign may also touch.

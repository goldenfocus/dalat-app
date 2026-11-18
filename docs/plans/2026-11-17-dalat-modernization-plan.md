# dalat.app modernization plan

Status: v2, 2026-11-17. Wave 1 done and verified on `swarm/integration` (not merged, not deployed).
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

## Wave 1 results (branches `swarm/*`, base `cdacb5d0`)
| Branch | What it does | State |
|---|---|---|
| `swarm/cinema-motion` | Photos fill the screen (cover, or whole photo over a blurred copy when cropping would be heavy). Ken Burns runs with or without music, freezes on pause, crossfade-only under reduced motion. | Code + 11 tests |
| `swarm/cinema-controls` | One transport for slides and music, music-note chip separate from the speaker, one tap reveals all controls, story-style progress, Gallery button, first-visit hint. 19 strings in 12 locales. | Code + 14 tests |
| `swarm/cinema-auto-score` | Deterministic house-soundtrack fallback when an event has no playlist. No-op until `house_tracks` exists and has rows. | Code + tests + migration file (not applied) |
| `swarm/moments-perf` | Event gallery grid is in the server HTML instead of a skeleton. Responsive image ladders for feed and thumbnails, eager first image, real alt text. | Code + 5 tests |
| `swarm/audit-uploads` | `docs/plans/2026-11-17-upload-flow-audit.md` | Doc |
| `swarm/audit-recaps` | `docs/plans/2026-11-17-recap-video-pipeline.md` (recap.json schema, `render_jobs` DDL, worker contract, QC list) | Doc |
| `swarm/integration` | All of the above merged, no conflicts. | tsc clean, 102 related tests pass, translation and grants checks pass, eslint 0 errors |

Not verified: anything visual. Nobody has seen these changes in a browser. Check on a phone before merging.

Findings that change the plan:
- The "photos don't move" bug has no single regression commit. Photos were never full screen (always `object-contain`), and the motion was fragile: its duration came from a store timer that is 0 at start, and pausing reset the photo to its first frame. The slide was rewritten rather than patched.
- `feat/effortless-event-uploads` already landed on main as squash #108. Drop the branch (tag the tip first). Its one unique file brings back the footer removed on Nov 16.
- `fix/automatic-event-recaps`: do not merge as a unit. Keep the fact-check gate idea and the two mobile layout commits.
- `fix/automatic-event-music` (reuse the series' earlier playlist) is worth merging; house music should be the last fallback inside its `resolveEventMusic`.
- Cinema motion and transitions use `Math.random`, wall-clock timers and CSS keyframes. They must become seeded, numeric presets before the same spec can drive an MP4 render.
- Recap trigger today is about 15 minutes after an event ends with one eligible moment. The target is 24 hours and 8 moments.

## Owner actions before merge
1. Import: from the canonical repo, `git fetch ~/dalat-app/output/_claude-swarm/dalat-swarm-wave1.bundle 'refs/heads/swarm/*:refs/heads/swarm/*'`.
2. Run `swarm/integration` locally and check cinema mode on a phone (list in each agent's notes: fill, pause/resume, reduced motion, tap reveal, music chip, Gallery scroll position, mini-player overlap).
3. Apply `supabase/migrations/20261204_001_house_tracks.sql` and load tracks, or the soundtrack fallback does nothing.
4. Decide: one house track per event or a queue of three (current); hide the playlist link on house tracks.

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
- Wave 1: done (above).
- Wave 2: make cinema motion deterministic, `recap.json` + `render_jobs`, zang worker, `recap-short` HyperFrames template, first automatic recap. Upload: move HEIC conversion off the request path, resume-on-open with a done notification.
- Wave 3: ACE-Step house library batch, Mac mini as second worker, QC gate, auto-publish to dalat.app's own channels.
- Wave 4: LTX tier, weekly compilation, user-connected social accounts once TikTok, Meta and YouTube app reviews clear (apply now; they take weeks).

## Open risks
- Auto-publishing photos of people with no approval step: keep a fast takedown path and an uploader opt-out.
- The blurred backdrop (`blur-2xl`) may stutter on low-end phones.
- The mini-player still overlaps cinema on mobile.
- Wave 1 touches files the `/v3` redesign may also touch.

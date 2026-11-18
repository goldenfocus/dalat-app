# Upload flow audit: event photos and videos (2026-11-17)

Scope: audit only. No application code changed. Base: `main` at `cdacb5d0` (2026-11-16). Branch audited: `origin/feat/effortless-event-uploads`.

Note on scope: the brief named `components/events/event-media-upload.tsx` as the starting point. That file is the single-image uploader for event flyers, venue covers and the homepage image (used by `components/events/event-form.tsx:1291`, `components/admin/venue-form.tsx:385`, `app/[locale]/admin/homepage/page.tsx:188`). It is not the moment (photo/video gallery) uploader. The journey below follows the moment path that the owner means: `components/moments/event-uploader.tsx` plus `lib/uploads/*`. The flyer uploader is noted only where it differs (section 1, last step).

---

## 1. Current journey (main)

Assumes a signed-in user on a phone, already at the event. Line numbers are on `main`.

1. **Entry.** The global FAB is mounted in the locale layout (`app/[locale]/layout.tsx:156-157`, via `components/deferred-chrome.tsx`). It renders only for authenticated users (`components/moments/upload-fab.tsx`, `isAuthenticated` check). On an event page, tapping it pushes straight to `/events/{slug}/moments/new` (`upload-fab.tsx:138-142`). Anywhere else it opens a sheet of recent events (`components/moments/quick-upload-sheet.tsx`), and only events with `can_post_moments` are selectable (`quick-upload-sheet.tsx:66`).
2. **Route gate.** `app/[locale]/events/[slug]/moments/new/page.tsx` is server-rendered. It redirects signed-out users to login with a return path (`page.tsx:160`). It runs `canUserPost`, which applies the `moments_who_can_post` rule (`anyone`, `rsvp`, `confirmed`) and `moments_enabled` (`page.tsx`, `canUserPost`). A user who fails the gate is redirected back to the gallery.
3. **Picker.** `EventUploader` shows a large "Choose" button (`components/moments/event-uploader.tsx:111`, disabled while `saving`). It opens a hidden `<input type="file" multiple accept={ALL_ALLOWED_TYPES}>` (`event-uploader.tsx:139`). Drag-and-drop onto the card is also wired (`event-uploader.tsx`, card `onDrop`). A folder picker appears on non-mobile browsers only (`event-uploader.tsx:64`, `:115`).
4. **Validation.** `add()` (`event-uploader.tsx:98`) calls `enqueueFiles` (`lib/uploads/engine.ts:100`). Each file is checked by `mediaError` (`lib/uploads/types.ts:57-63`): accepted MIME types from `types.ts:47-55`, images up to 50 MB, videos up to 500 MB. Invalid files become `error` rows instead of failing the batch (`engine.ts:113-115`).
5. **Staging to IndexedDB.** Each accepted file is written to IndexedDB in 1 MB chunks before its job is acknowledged (`lib/uploads/store.ts:6`, `:36-58`; `engine.ts:118`). The Choose button stays disabled while this runs (`staging` count, `engine.ts:106`). This is the durability step: the file survives a reload.
6. **Queue worker.** `pump()` takes a `navigator.locks` lock so only one tab drains the queue (`engine.ts:313-320`). `drain()` runs up to 3 jobs at once and gives one video its own lane (`engine.ts:295-312`).
7. **Client preparation (`processJob`, `engine.ts:214-242`).** Hash the file (SHA-256; byte ranges for video, `engine.ts:228-230`, `lib/uploads/hash.ts`). Read capture time from EXIF (`engine.ts:231`). Images over 3 MB are compressed on a canvas to about 2 MB, max 4096 px (`lib/image-compression.ts:13-19`, `engine.ts:233-237`). HEIC is not compressed and is sent as-is (`engine.ts:233`).
8. **Prepare call.** `POST /api/moments/uploads` with `action: 'prepare'` (`engine.ts:135-156`, `:244`). The route (`app/api/moments/uploads/route.ts:16-49`):
   - returns 401 if signed out (`route.ts:19`);
   - validates the body with zod, and requires a 64-hex SHA-256 hash (`route.ts:8-14`);
   - re-checks size and MIME (`route.ts:27-30`);
   - confirms the event is visible under the caller's RLS (`route.ts:33-35`);
   - calls the `reserve_moment_upload` RPC with the service role (`route.ts:37`), then `prepareDestination` (`route.ts:43`).
9. **Destination.** Photos get a presigned R2 PUT, valid 1 hour, under `moments/` (`lib/uploads/server.ts:175-184`). Videos get a Cloudflare Stream TUS direct-upload URL, max 3600 s, with a 10% thumbnail (`server.ts:152-172`).
10. **Transfer.** Photos: one XHR `PUT` of the whole blob (`engine.ts:173-187`, `:266`). Videos: TUS with 8 MB chunks and retry delays (`engine.ts:189-212`, chunk size at `:194`). An expired TUS session is renewed through a second prepare call (`engine.ts:256-264`).
11. **Complete call.** `POST` with `action: 'complete'` (`engine.ts:271`). The server `reconcileUpload` (`server.ts:100-134`):
    - for photos, checks the object exists and its length equals `file_size` (`server.ts:73`);
    - for HEIC, downloads the original and converts it to JPEG in the request with `heic-convert` (`server.ts:74-82`), inside a route with `maxDuration = 60` (`route.ts:7`);
    - publishes via the `complete_verified_moment_upload` RPC (`server.ts:122-127`). The moment is `pending` when the event requires approval (migration `supabase/migrations/20261109_001_durable_moment_uploads.sql`, `CASE WHEN m.status='pending'`).
12. **Settle and retry.** `settle()` releases the local file for photos and keeps it for videos until encoding succeeds (`engine.ts:157-171`). It then dispatches `dalat:moment-added` (`engine.ts:170`). On error, a job retries up to 4 times with backoff of `attempts * 2500` ms, capped at 7500 ms (`engine.ts:282-288`). 400, 401, 403, 404 and 410 are not retried (`engine.ts:282`). A 401 surfaces as a sign-in error (`engine.ts:285`).
13. **Processing and recovery.** Video stays in `processing` until Stream finishes (`server.ts:121-131`). `pollProcessing` runs every 15 s while the tab is visible (`engine.ts:94`, `:346-357`). The 10-minute cron calls `recoverUnfinishedUploads` (`vercel.json`, `/api/cron/process-moments`, `process-moments/route.ts:101`), which reconciles rows that never got a moment.
14. **Captions.** Each row shows `MomentCaptionEditor` once a moment exists (`event-uploader.tsx`, `UploadRow`). The UI says captions come later (`moments.uploader.captionsLater`). AI caption generation runs in the caption worker (`app/api/moments/[id]/caption/route.ts`); the enqueue path was not fully traced.
15. **Gallery.** When every job is finished and the page is visible, the app confetti-celebrates and then `router.replace`s to `/events/{slug}/moments` (`lib/uploads/use-upload-completion.ts:8-38`). The notice toasts are in `components/moments/upload-notifications.tsx` (mounted globally). They replaced a persistent footer on 2026-11-16 (commit `5292d357`).

**Flyer uploader, for contrast.** `components/events/event-media-upload.tsx` (`uploadMedia`, line 231) validates, converts HEIC client-side through `convertIfNeeded` (`lib/media-conversion.ts:363-380`), uploads one file through `lib/storage/client` and saves `image_url` on the event row. It handles one file at a time and is not on the moment path.

**Other upload code on main, not on the moment path.** `components/moments/moment-form.tsx` contains a media queue (`useUploadQueue`, `lib/hooks/use-upload-queue.ts`) that calls `/api/moments/upload-video`. On the new-moment page the form is rendered with `nonMediaOnly` (`new/page.tsx`, "Other ways" `<details>`), which starts it in text mode (`moment-form.tsx:179`) and hides the media tab (`moment-form.tsx:1387`). `components/moments/pro-upload/*` uses `useBulkUpload` (`lib/hooks/use-bulk-upload.ts`) and is not linked from `app/`, `components/` or `lib/`. I did not verify whether these routes are reachable by direct URL in production.

---

## 2. Friction count: 30 photos, from "at the event" to "all uploaded"

**Taps and inputs (happy path, on the event page, signed in):**

| Step | Taps / inputs |
|---|---|
| Open FAB | 1 (2 if starting off the event page: FAB, then pick event in sheet) |
| Tap Choose | 1 |
| OS picker: select 30 photos (iOS/Android pickers have no "select all" on the web) | about 30 |
| Confirm / Add | 1 |
| Required fields | 0 (captions are optional and deferred) |
| **Total** | **about 33 taps, 0 typed fields** |

Staging: if the picker is still staging, Choose is disabled (`event-uploader.tsx:111`). Staging writes each selected file's full bytes to IndexedDB once, in 1 MB chunks, before the button re-enables (`store.ts:36-58`).

**Requests:** 30 photos means about 90 HTTP requests (30 prepare, 30 PUT to R2, 30 complete). The HEIC conversion inside `complete` adds server time per file (`server.ts:77-82`).

**What blocks:**
- Sign-in is mandatory (`new/page.tsx:160`, `route.ts:19`).
- RSVP is required if the organiser set `rsvp` or `confirmed`. The check is in the `reserve_moment_upload` RPC (`supabase/migrations/20261111_001_upload_roundtrips.sql:16`, `20261109_001_durable_moment_uploads.sql:54`), not in the route.
- Approval mode puts photos in a `pending` state (migration above). The UI shows this as a status, not a block.
- The page does not block on one file at a time. Three jobs run in parallel (`engine.ts:303`).

**Flaky mobile data:** a failed PUT is retried up to 4 times for each photo, starting from byte zero, because photos use one PUT (`engine.ts:173-187`). Videos resume in chunks (`engine.ts:194`). Going offline aborts active transfers and waits for the `online` event (`engine.ts:83-86`). I have not tested this on a device.

**Tab closed or phone locked:**
- Queued items are durable (IndexedDB), so nothing is lost (`store.ts:36`).
- Nothing uploads while the page is closed. `public/sw.js` has no `sync` or background-fetch listener (its only "sync" matches are the `async` keyword). The only resume trigger is the next app load, when `startUploads()` calls `pump()` (`engine.ts:59-67`, `components/moments/upload-notifications.tsx` is mounted globally).
- The `beforeunload` warning fires only while staging or while non-durable jobs exist (`engine.ts:89-93`). Closing the tab with a durable queue gives no warning.
- Screen wake lock keeps the phone awake while uploading, when the browser supports it (`upload-notifications.tsx:23-36`). This is a convenience, not durability.

**Ranked friction points:**

1. **Uploads stop when the page stops.** No background sync, so a locked phone or a closed tab leaves the queue idle until the next visit. Users will read this as "stuck". (H impact, see backlog for what is feasible on iOS.)
2. **Heavy server work on the request path.** HEIC originals are converted inside `/api/moments/uploads` with a 60 s limit (`route.ts:7`, `server.ts:74-82`). A batch of 30 iPhone HEICs is 30 conversions, and a slow one can hit the limit, which then becomes a retry cycle.
3. **Per-file round trips and one-PUT photos.** 90 requests for 30 photos, and any drop on a photo restarts it from zero (`engine.ts:173-187`). Multipart helpers already exist for storage (`lib/storage/multipart-upload.ts`, `app/api/storage/multipart/presign-part/route.ts`) but are not used here.
4. **Staging blocks the picker.** Writing every file to IndexedDB before the button re-enables (`store.ts:36-58`, `event-uploader.tsx:111`). Large videos make this noticeably slow with no progress shown for staging.
5. **Sign-in comes before anything else.** A guest who arrives from a link or QR is redirected to login before they can see the upload screen (`new/page.tsx:160`), and is sent back afterwards. There is no preview of the event's upload options first.
6. **Mobile video limit is not enforced.** `MEDIA_SIZE_LIMITS.videoMobile` is 50 MB (`lib/media-utils.ts:33-39`), but the moment path checks 500 MB only (`lib/uploads/types.ts:61`). A 400 MB phone video will start and then take a long TUS transfer on mobile data.
7. **Status UI is busy.** The status box and per-row text both show progress (`event-uploader.tsx`, status block below the Choose button). This is cosmetic but adds visual noise during a 30-file batch.
8. **Dead or unlinked code.** The media path in `moment-form.tsx` (`use-upload-queue.ts`, `/api/moments/upload-video`) and `pro-upload/*` (`use-bulk-upload.ts`) are maintained but not on the main path. This is a maintenance and bug-surface cost, not a user-facing one.

---

## 3. What is already solved

**On main:**
- Multi-select of many files in one picker, with drag-and-drop (`event-uploader.tsx:139`).
- Zero required fields. Captions are optional and deferred (`captionsLater`).
- Durable local queue in IndexedDB that survives reloads (`lib/uploads/store.ts`).
- Direct-to-R2 presigned PUT for photos (`server.ts:175-184`). Images never pass through the app server.
- Resumable direct-to-Cloudflare-Stream TUS for video, with session renewal (`server.ts:152-172`, `engine.ts:256-264`).
- Idempotent prepare/complete with a server-side receipt, so a lost reply does not reupload bytes (`engine.ts:270`, `server.ts:100-134`); the prepare response flags duplicates (`route.ts:44`).
- Client compression for images over 3 MB (`lib/image-compression.ts`).
- Automatic recovery of unfinished rows via cron (`process-moments/route.ts:101`).
- Global FAB and toast notices that reach any page (`upload-fab.tsx`, `upload-notifications.tsx`).
- Auto-navigation to the gallery when a batch finishes (`use-upload-completion.ts`).

**On the unmerged branch:** nothing that main lacks in the upload core (see section 4).

---

## 4. Unmerged branch: `origin/feat/effortless-event-uploads`

**Log (`main..branch`, 8 commits, all dated 2026-10-24 or later per the log):**

```
c3d62e4d 2026-10-24 fix(pwa): defer updates while legacy upload screens are open
e9c59ae3 2026-10-24 fix(moments): preserve normalized media types in saved sources
ab3a9a5f 2026-10-24 fix(moments): persist upload bytes across Safari and browser restarts
2d74c68e 2026-10-24 fix(moments): protect captions while the saved text loads
2b4107b6 2026-10-24 fix(moments): keep upload progress reachable above cinema view
520a01f2 2026-10-24 fix(moments): renew expired resumable video sessions safely
36571ce5 2026-10-24 fix(deps): retain upload hashing in production installs
28a18cff 2026-10-24 feat(moments): add durable one-step photo and video uploads
```

**The eight commits are not ancestors of `main`.** The same work landed on `main` as the squash commit `24190d6f` "Make event photo and video uploads durable and one-step (#108)" (2026-10-24). The branch's merge-base with main is `90c5970a`, so `main` has moved about 680 files ahead of it. "8 commits ahead" is therefore misleading: most of the branch's content is already on `main`.

**Stat (`main...branch`, from merge-base):** 47 files, +2194 / -14. The core files are identical to `main` at tip:
- `lib/uploads/engine.ts`, `server.ts`, `store.ts`, `types.ts`
- `app/api/moments/uploads/route.ts`
- `supabase/migrations/20261109_001_durable_moment_uploads.sql`

Files that differ from `main` at tip (the branch is older, so these would revert later `main` fixes):
- `components/moments/event-uploader.tsx`: `main` has `f4c3c7bc` (2026-10-31, "celebrate finished uploads") that the branch lacks.
- `public/sw.js`: differs by 92 lines.
- `components/moments/moment-caption-editor.tsx`: differs by 2 lines.

Branch-only file not on main: `components/moments/upload-tray.tsx`. This is a persistent bottom tray. It looks like the footer that `main` replaced with dismissible toasts (`5292d357`, 2026-11-16). Merging it back would undo a deliberate change.

**Merge test.** `git merge --no-commit --no-ff origin/feat/effortless-event-uploads` on `cdacb5d0` produced 19 conflicting files. The merge was aborted with `git merge --abort` and the worktree is clean (`git status` empty).

- Code (7): `app/[locale]/layout.tsx`, `components/app-freshness-handler.tsx`, `components/deferred-chrome.tsx`, `components/moments/event-uploader.tsx` (add/add), `components/moments/moment-caption-editor.tsx` (add/add), `components/sw-update-handler.tsx`, `public/sw.js`.
- Translations (12): `messages/{de,en,es,fr,id,ja,ko,ms,ru,th,vi,zh}.json`.

## 5. Recommendation on the unmerged branch

**Drop it. Do not merge, rebase or cherry-pick.**

Reasons:
- Its core upload code is already on `main` byte-for-byte (`engine.ts`, `server.ts`, `store.ts`, `types.ts`, `route.ts`, the migration).
- The files that differ are older than `main`'s; taking them would revert fixes that landed on 10-31 and 11-16.
- The one unique file (`upload-tray.tsx`) reintroduces the footer that `main` removed on purpose.
- The merge conflicts in 19 files, including 12 translation catalogues, would take far more effort than the value left.

Before deleting the branch, record its tip SHA in the project notes or create a tag (`git tag archive/effortless-event-uploads origin/feat/effortless-event-uploads`), so the history is recoverable. Only if a specific test from the branch is missing on `main` should that one file be copied across. I did not check every test; `lib/uploads/hash.test.ts`, `lib/uploads/server.test.ts` and `tests/upload-update-safety.test.ts` already exist on `main`.

---

## 6. Ranked backlog toward the target experience

Target: select 30+ files at once; uploads continue in the background and resume after a dropped connection; zero required fields before upload; AI captions or alt text after upload; QR at the venue that opens into upload; PWA share target from the phone gallery.

Impact (H/M/L), effort (S/M/L), files.

1. **Move HEIC conversion off the request path.** Impact H (reliability for iPhone batches), effort M. Files: `lib/uploads/server.ts` (`receivedPhoto`), `app/api/moments/uploads/route.ts`, `app/api/cron/process-moments/route.ts`, possibly `lib/media-conversion.ts` for client conversion. Option: store the HEIC, return `complete` immediately, and let the cron convert.
2. **Resume-on-open plus a done notification.** Impact H, effort S. Files: `lib/uploads/engine.ts` (`startUploads`, `pump`), `components/moments/upload-notifications.tsx`, existing PWA push if enabled. Honest limit: iOS Safari does not run a web page's queue while it is closed, and Background Sync is not available there. True background upload on iOS needs a native wrapper (effort L). I did not verify the current iOS state; treat this as a constraint to check before committing to a design.
3. **Multipart resume for large photos and phones on bad data.** Impact M, effort M. Files: `lib/storage/multipart-upload.ts`, `app/api/storage/multipart/presign-part/route.ts`, `lib/uploads/engine.ts` (`put`), `lib/uploads/server.ts` (`prepareDestination`).
4. **Batch prepare for 30+ files.** Impact M, effort M. One `prepare` call with an array of files, one reserve RPC. Cuts about 30 requests per batch. Files: `app/api/moments/uploads/route.ts` (zod schema), `lib/uploads/engine.ts` (`processJob`), a new RPC migration for `reserve_moment_upload`.
5. **QR at the venue opening into upload.** Impact H (event-day capture), effort M. Route on `/events/{slug}/moments/new`. The page needs sign-in (`new/page.tsx:160`), so the QR path must include a guest sign-in step, or the QR should land on the gallery with the upload button. The arrival QR (`app/api/events/[slug]/arrival/qr/route.ts`) is an existing pattern to reuse. Files: new route under `app/[locale]/events/[slug]/`, `components/moments/event-uploader.tsx`, translation registry (`lib/translations/registry.ts`, per AGENTS.md).
6. **PWA share target.** Impact M, effort M. Add `share_target` to `public/manifest.json`, handle the POST in `public/sw.js` or a route, stage the files into IndexedDB with `enqueueFiles` (`lib/uploads/engine.ts:100`), then route to event choice. Check Web Share Target support on iOS Safari before scoping; I did not verify it.
7. **AI captions or alt text after upload.** Impact M, effort S (much exists). Caption worker and `MomentCaptionEditor` are already in place (`app/api/moments/[id]/caption/route.ts`, `process-moments` cron). Remaining: surface the generated text in the upload row, and keep it optional. Check AGENTS.md translation rules for any new text.
8. **Enforce the mobile video limit on the moment path.** Impact M (prevents failed long transfers), effort S. Files: `lib/uploads/types.ts:57-63` (`mediaError`), `lib/media-utils.ts:33-39` (`videoMobile`).
9. **Remove unused upload paths.** Impact L (maintenance), effort M. Candidates: `components/moments/moment-form.tsx` media queue, `lib/hooks/use-upload-queue.ts`, `lib/hooks/use-bulk-upload.ts`, `components/moments/pro-upload/*`, `app/api/moments/upload-video/route.ts`. Confirm with production logs before removing.
10. **Staging progress and faster start.** Impact M, effort S. Show per-file staging progress (`engine.ts:106`, `store.ts:36`) and let the picker re-enable as soon as each file is saved.

**Not yet done for the target, and not in the list above:** a true "select all" in the OS picker is not possible on the web; the nearest is folder picking on desktop, which exists already (`event-uploader.tsx:64`).

---

## Limits of this audit

- Not run on a device or against production. Mobile network and iOS background behaviour are reasoned from code only.
- The AI caption enqueue path and the `reserve_moment_upload` SQL body were not traced in full.
- Whether `moment-form` media and `pro-upload` are reachable by direct URL in production was not checked.
- Branch merge test was run on local refs fetched from `origin`. No remote was changed.

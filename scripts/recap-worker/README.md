# Recap render worker

A Mac pulls render jobs from Supabase, renders them, and reports back. Nothing calls into the Mac. Same shape as `scripts/translation-worker`: outbound HTTPS only, secrets from `.env.local`, launchd keeps it alive.

Target machines: `zang` (48 GB, primary) and a Mac mini (24 GB, secondary). Both can run it: `claim_render_job` uses `FOR UPDATE SKIP LOCKED`, so a job is never claimed twice. Give each Mac its own `RECAP_WORKER_ID` (defaults to the hostname).

## Pieces

| File | Role |
|---|---|
| `supabase/migrations/20261205_001_render_jobs.sql` | `render_jobs` table and RPCs (service role only). Not applied by this change. |
| `worker.ts` | Entry point and loop: sweep stale jobs, claim, run, repeat. One job at a time. |
| `run-job.ts` | One job: heartbeat timer, render, then complete / fail / release. |
| `renderer.ts` | `RecapRenderer` interface, `dryRunRenderer`, output schema, `resolveRenderer`. |
| `queue.ts` | Thin RPC wrapper; every result is Zod-validated. |
| `config.ts` | Zod-validated env and CLI flags. Errors name variables, never values. |
| `backoff.ts` | Pure mirrors of the SQL backoff and state rules (tests pin them). |
| `lib/recap/jobs.ts` | Server helper `enqueueRecapRender({ eventId, spec, sourceHash })`. |

## Job state machine

```
queued -> claimed -> rendering -> uploading -> done
claimed | rendering | uploading -> queued   fail with attempts left (backoff), release, or stale heartbeat
claimed | rendering | uploading -> dead     attempts exhausted (fail or stale sweep)
claimed | rendering | uploading -> failed   fail with p_retryable = false (e.g. invalid spec)
```

Retry delay after attempt n: `60 s * 2^(n-1)`, capped at 1 h (`render_job_backoff` in SQL, `retryDelayMs` in `backoff.ts`). `max_attempts` defaults to 3. `dead` and `failed` are never retried automatically; a moderator re-queues by hand (set `status='queued'`, `attempts=0`) after fixing the cause. The translation worker's `RetrySchedule` is not reused: it keeps local per-key state with a fixed delay, while here retry state lives in the row.

Every RPC except the sweep checks `claimed_by = worker_id` and an active status, so a worker whose job was reclaimed gets `false`/`NULL` back and stops without touching the row.

## Run

Prerequisites: Node and a checkout with dependencies and `.env.local` holding `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the same values the translation worker uses).

```sh
npx tsx scripts/recap-worker/worker.ts --once --dry-run   # rehearse one claim; job is released, not completed
npm run recap:worker                                      # --loop
RECAP_WORKER_ID=zang scripts/recap-worker/install.sh      # launchd agent com.goldenfocus.dalat-recap-worker
```

Flags: `--once` (default), `--loop`, `--dry-run`, `--kinds=a,b` (default `recap_short`).

`--dry-run` runs the dry-run renderer and then **releases** the job (attempt refunded), so rehearsing never marks real work done. Without `--dry-run` the worker refuses to start until a production renderer is registered.

Environment: `RECAP_WORKER_ID`, `RECAP_POLL_INTERVAL_MS` (15000), `RECAP_HEARTBEAT_INTERVAL_MS` (30000), `RECAP_STALE_AFTER_SECONDS` (600; must be at least 3x the heartbeat interval). Logs go to `~/.local/state/dalat-recap/worker.log` under launchd and contain job ids and statuses only: no spec, no media URLs, no keys.

SIGTERM / SIGINT: the running render is aborted via `ctx.signal`, the job is released back to `queued` with its attempt refunded, and the loop exits.

## Plugging in the real renderer (HyperFrames)

Implement `RecapRenderer` and return it from `resolveRenderer(false)`:

```ts
render(job, ctx): Promise<RenderOutput>
```

- Parse `job.spec` yourself (`job.spec` is `unknown` here); throw `NonRetryableRenderError` for a spec that can never render.
- Watch `ctx.signal`; on abort, kill child processes and delete the work directory, then throw.
- Call `await ctx.setPhase("uploading")` before the upload so the row shows it.
- Return `{ streamUid | url, durationMs, bytes }`; it is validated, then stored as `render_jobs.output`.
- Any other thrown error is a retryable failure (message truncated to 500 chars into `render_jobs.error`).
- The worker heartbeats on a timer independent of the renderer, so a long synchronous-looking render keeps its lease as long as the event loop is free. Run ffmpeg/HyperFrames as child processes, not blocking loops.

Joining the spec modules: `lib/recap/spec.ts`, `build-spec.ts` and `source-hash.ts` are owned elsewhere. The trigger calls `buildRecapSpec(...)`, hashes the inputs with `source-hash.ts`, then `enqueueRecapRender({ eventId, spec, sourceHash })`. `enqueueRecapRender` treats the spec as opaque jsonb; the renderer validates it with the spec schema.

## Intended trigger (not implemented here)

No cron or database trigger enqueues jobs. The planned rule: an event becomes eligible 24 h after it ends, with at least 8 eligible moments, passing the same public/privacy gate as `lib/blog/enqueue-recap.ts`. A later cron computes the source hash and calls `enqueueRecapRender`; a changed hash (new moments or a new spec version) queues a new job, an identical one is a no-op.

## Failure modes

| Situation | Result |
|---|---|
| Mac asleep or process killed mid-render | Heartbeat stops; any worker's sweep re-queues it after `RECAP_STALE_AFTER_SECONDS` (or `dead` if out of attempts). |
| Supabase unreachable | `--loop` logs and retries next poll; `--once` exits non-zero. Heartbeat errors are tolerated; the lease outlives a few misses. |
| Claim lost (job reclaimed) | Heartbeat returns false; render is aborted; no complete/fail is written. |
| Renderer throws | Retryable: re-queued with backoff, `dead` after `max_attempts`. |
| Invalid spec / `NonRetryableRenderError` | `failed` immediately. |
| Malformed renderer output | Treated as a retryable failure; nothing is stored as output. |
| Two workers, same job | Impossible by `SKIP LOCKED`; a stale worker with the same id as its replacement is the one gap (use distinct ids). |

## Checks

```sh
npx vitest run scripts/recap-worker lib/recap
npm run check:recap-worker      # tsc on this worker and lib/recap only
node scripts/check-data-api-grants.mjs
```

#!/usr/bin/env node
/**
 * dalat.app image worker — runs 24/7 on a Mac mini (Apple Silicon).
 *
 * Two queues, one GPU:
 *   A. Interactive image jobs (avatars, event/venue covers) — polled every
 *      IMAGE_POLL_SECONDS via POST /api/admin/image-jobs/claim (which also
 *      doubles as the worker heartbeat), generated at the job's dimensions,
 *      PUT to a presigned R2 URL, then /complete. Failures -> /fail.
 *   B. Blog cover backfill — the original flow, polled every POLL_MINUTES:
 *      GET /api/admin/cover-jobs -> generate -> /presign -> PUT -> /complete.
 *
 * Interactive jobs always drain before the backfill touches the GPU.
 *
 * Plain Node >= 20, zero npm deps. Config from ./worker.env or process.env.
 * The worker must never die: every error is logged and the loop continues.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_DIR = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = { ...process.env };
  const envFile = join(WORKER_DIR, 'worker.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) env[key] = value;
    }
  }
  return env;
}

const env = loadEnv();

const BASE_URL = (env.DALAT_BASE_URL || 'https://dalat.app').replace(/\/$/, '');
const ADMIN_API_KEY = env.ADMIN_API_KEY;
const POLL_MINUTES = Number(env.POLL_MINUTES) || 10;
// Interactive jobs poll fast — a user is watching a dialog.
const IMAGE_POLL_SECONDS = Number(env.IMAGE_POLL_SECONDS) || 30;
const MFLUX_BIN = env.MFLUX_BIN || 'mflux-generate';
const MODEL = env.MODEL || 'schnell';
const STEPS = Number(env.STEPS) || 3;
// Extra CLI flags for mflux (e.g. --low-ram), space-separated.
const MFLUX_EXTRA_ARGS = (env.MFLUX_EXTRA_ARGS || '').split(/\s+/).filter(Boolean);
// Shell command run before each generation — e.g. unload ollama models so
// mflux gets the full Metal memory budget (klein-4b peaks ~15GB on a 24GB mini).
const PRE_GENERATE_CMD = env.PRE_GENERATE_CMD || '';

if (!ADMIN_API_KEY) {
  console.error('[worker] ADMIN_API_KEY is required (worker.env or env). Exiting.');
  process.exit(1);
}

const AUTH_HEADERS = {
  Authorization: `Bearer ${ADMIN_API_KEY}`,
  'Content-Type': 'application/json',
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Per-job failure counter — after 3 failed attempts a job is skipped so a
// permanently broken prompt can't burn every poll cycle forever.
const failures = new Map();

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...AUTH_HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function generateImage(job, outputPath) {
  if (PRE_GENERATE_CMD) {
    spawnSync('/bin/sh', ['-c', PRE_GENERATE_CMD], { timeout: 60 * 1000, encoding: 'utf8' });
  }
  const args = [
    '--model', MODEL,
    '--quantize', '4',
    '--steps', String(STEPS),
    '--width', String(job.width || 1216),
    '--height', String(job.height || 640),
    ...MFLUX_EXTRA_ARGS,
    '--prompt', job.prompt,
    '--output', outputPath,
  ];
  const result = spawnSync(MFLUX_BIN, args, {
    timeout: 5 * 60 * 1000, // 5 min
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`mflux spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `mflux exited ${result.status}${result.signal ? ` (signal ${result.signal})` : ''}: ${(result.stderr || '').slice(-500)}`
    );
  }
  if (!existsSync(outputPath)) {
    throw new Error(`mflux produced no output at ${outputPath}`);
  }
}

async function processJob(job) {
  const started = Date.now();
  const outputPath = `/tmp/cover-${job.id}.png`;

  try {
    generateImage(job, outputPath);

    const { uploadUrl, key } = await api('/api/admin/cover-jobs/presign', {
      method: 'POST',
      body: JSON.stringify({ postId: job.id, contentType: 'image/png' }),
    });

    const bytes = readFileSync(outputPath);
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: bytes,
    });
    if (!putRes.ok) {
      throw new Error(`R2 PUT failed: ${putRes.status} ${await putRes.text().catch(() => '')}`);
    }

    await api('/api/admin/cover-jobs/complete', {
      method: 'POST',
      body: JSON.stringify({ postId: job.id, key }),
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(`[worker] done slug=${job.slug} tier=macmini duration=${seconds}s`);
  } catch (err) {
    // GPU OOM = transient contention (ollama re-warms models during news
    // crons), not a broken job — don't burn the failure budget, just back
    // off and let the next poll retry.
    if (/Insufficient Memory|OutOfMemory/i.test(String(err))) {
      log(`[worker] OOM slug=${job.slug} — GPU busy, backing off this cycle`);
      return 'oom';
    }
    failures.set(job.id, (failures.get(job.id) || 0) + 1);
    log(`[worker] FAILED slug=${job.slug}:`, err.stack || err, err.cause ?? '');
  } finally {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch {
      // best effort cleanup
    }
  }
}

// ── Interactive image jobs (avatars, event/venue covers) ──────────────

// A user is watching a dialog, so an OOM (ollama re-warmed mid-generation)
// must not park the job for the whole 5-min lease. Re-evict and retry in
// place — PRE_GENERATE_CMD runs again inside generateImage on every try.
const OOM_INPLACE_RETRIES = 2;
const OOM_RETRY_DELAY_MS = 20 * 1000;

function generateImageWithOomRetry(job, outputPath) {
  return (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        generateImage(job, outputPath);
        return;
      } catch (err) {
        const isOom = /Insufficient Memory|OutOfMemory/i.test(String(err));
        if (!isOom || attempt >= OOM_INPLACE_RETRIES) throw err;
        log(`[worker] OOM image job id=${job.id} — re-evicting ollama, in-place retry ${attempt + 1}/${OOM_INPLACE_RETRIES}`);
        await sleep(OOM_RETRY_DELAY_MS);
      }
    }
  })();
}

async function processImageJob(job) {
  const started = Date.now();
  const outputPath = `/tmp/imagejob-${job.id}.png`;

  try {
    await generateImageWithOomRetry(job, outputPath);

    const { uploadUrl } = await api('/api/admin/image-jobs/presign', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id }),
    });

    const bytes = readFileSync(outputPath);
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: bytes,
    });
    if (!putRes.ok) {
      throw new Error(`R2 PUT failed: ${putRes.status} ${await putRes.text().catch(() => '')}`);
    }

    await api('/api/admin/image-jobs/complete', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id }),
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(`[worker] image job done id=${job.id} context=${job.context} duration=${seconds}s`);
  } catch (err) {
    // Still OOM after in-place retries = sustained contention; leave the
    // job leased so the 5-min lease expiry retries it after the window.
    if (/Insufficient Memory|OutOfMemory/i.test(String(err))) {
      log(`[worker] OOM image job id=${job.id} — GPU busy after ${OOM_INPLACE_RETRIES} in-place retries, backing off`);
      return 'oom';
    }
    log(`[worker] image job FAILED id=${job.id}:`, err.stack || err, err.cause ?? '');
    await api('/api/admin/image-jobs/fail', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id, error: String(err).slice(0, 500) }),
    }).catch((failErr) => log('[worker] could not report failure:', failErr));
  } finally {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch {
      // best effort cleanup
    }
  }
}

// The claim call is also the worker heartbeat — the app refuses to enqueue
// when it hasn't seen one recently, so this must run every iteration.
async function imageCycle() {
  const { jobs } = await api('/api/admin/image-jobs/claim', {
    method: 'POST',
    body: JSON.stringify({ limit: 2 }),
  });
  if (!jobs || jobs.length === 0) return;

  log(`[worker] ${jobs.length} image job(s)`);
  for (const job of jobs) {
    const outcome = await processImageJob(job);
    if (outcome === 'oom') break; // GPU is busy — the rest would OOM too
  }
}

// ── Blog cover backfill (original flow) ────────────────────────────────

async function cycle() {
  const { jobs } = await api('/api/admin/cover-jobs');
  if (!jobs || jobs.length === 0) {
    log('[worker] no jobs');
    return;
  }
  log(`[worker] ${jobs.length} job(s)`);
  for (const job of jobs) {
    // A user may be watching a dialog — interactive jobs jump the line
    // between covers so a backfill batch can't block them for minutes.
    try {
      await imageCycle();
    } catch (err) {
      log('[worker] image cycle error (between covers):', err.stack || err);
    }
    const failCount = failures.get(job.id) || 0;
    if (failCount >= 3) {
      if (failCount === 3) {
        log(`[worker] giving up on slug=${job.slug} after 3 failed attempts`);
        failures.set(job.id, failCount + 1); // log the give-up only once
      }
      continue;
    }
    const outcome = await processJob(job);
    if (outcome === 'oom') break; // GPU is busy — the rest of the batch would OOM too
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  log(`[worker] starting — base=${BASE_URL} model=${MODEL} steps=${STEPS} imagePoll=${IMAGE_POLL_SECONDS}s coverPoll=${POLL_MINUTES}m`);
  let lastCoverCycle = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await imageCycle();
    } catch (err) {
      log('[worker] image cycle error:', err.stack || err, err.cause ?? '');
    }
    if (Date.now() - lastCoverCycle >= POLL_MINUTES * 60 * 1000) {
      lastCoverCycle = Date.now();
      try {
        await cycle();
      } catch (err) {
        log('[worker] cycle error:', err.stack || err, err.cause ?? '');
      }
    }
    await sleep(IMAGE_POLL_SECONDS * 1000);
  }
}

main();

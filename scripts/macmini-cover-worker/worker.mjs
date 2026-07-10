#!/usr/bin/env node
/**
 * dalat.app cover-image worker — runs 24/7 on a Mac mini (Apple Silicon).
 *
 * Loop:
 *   1. GET  /api/admin/cover-jobs          -> posts needing covers (+ prompts)
 *   2. mflux-generate (FLUX schnell, local) -> /tmp/cover-<id>.png
 *   3. POST /api/admin/cover-jobs/presign  -> presigned R2 PUT URL
 *   4. PUT  image bytes directly to R2      (never through dalat.app — WAF)
 *   5. POST /api/admin/cover-jobs/complete -> sets cover_image_url
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
    '--width', '1216',
    '--height', '640',
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

async function cycle() {
  const { jobs } = await api('/api/admin/cover-jobs');
  if (!jobs || jobs.length === 0) {
    log('[worker] no jobs');
    return;
  }
  log(`[worker] ${jobs.length} job(s)`);
  for (const job of jobs) {
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
  log(`[worker] starting — base=${BASE_URL} model=${MODEL} steps=${STEPS} poll=${POLL_MINUTES}m`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await cycle();
    } catch (err) {
      log('[worker] cycle error:', err.stack || err, err.cause ?? '');
    }
    await sleep(POLL_MINUTES * 60 * 1000);
  }
}

main();

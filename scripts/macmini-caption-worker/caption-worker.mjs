#!/usr/bin/env node
/**
 * dalat.app caption worker — runs 24/7 on the Mac mini (Apple Silicon).
 *
 * Claims caption_jobs from the app (POST /api/admin/caption-jobs/claim —
 * the poll doubles as the caption-worker heartbeat), downloads the job's
 * media, runs vision inference with ZERO pay-per-token API keys:
 *
 *   1. `claude -p` under the Claude subscription (default: Haiku) — image
 *      jobs are BATCHED into one session (one system prompt for ~10 images,
 *      not one per image) to stay quota-sane; video jobs run one session
 *      each (multi-frame + transcript prompt).
 *   2. Optional local VLM fallback via ollama (OLLAMA_FALLBACK_MODEL, e.g.
 *      qwen2.5vl:7b) when claude is unavailable (quota window, offline).
 *
 * The worker never parses/validates captions itself — it POSTs the model's
 * raw text to /complete, and the server normalizes or 422s (then we /fail).
 * Jobs only ever contain media that already passed the app's privacy gate.
 *
 * Plain Node >= 20, zero npm deps. Config from ./worker.env or process.env.
 * The worker must never die: every error is logged and the loop continues.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
const POLL_SECONDS = Number(env.POLL_SECONDS) || 60;
const BATCH_SIZE = Number(env.BATCH_SIZE) || 10;
const CLAUDE_BIN = env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`;
const CLAUDE_MODEL = env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CLAUDE_TIMEOUT_MS = (Number(env.CLAUDE_TIMEOUT_MINUTES) || 10) * 60 * 1000;
// When claude looks quota-limited, sleep this long before polling again
// instead of burning job attempts.
const QUOTA_BACKOFF_MINUTES = Number(env.QUOTA_BACKOFF_MINUTES) || 30;
// Optional local VLM fallback (e.g. qwen2.5vl:7b after `ollama pull`).
const OLLAMA_FALLBACK_MODEL = env.OLLAMA_FALLBACK_MODEL || '';
const OLLAMA_URL = (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const WORK_DIR = env.WORK_DIR || '/tmp/dalat-captions';
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

if (!ADMIN_API_KEY) {
  console.error('[caption-worker] ADMIN_API_KEY is required (worker.env or env). Exiting.');
  process.exit(1);
}

const AUTH_HEADERS = {
  Authorization: `Bearer ${ADMIN_API_KEY}`,
  'Content-Type': 'application/json',
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...AUTH_HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function reportFailure(jobId, message) {
  await api('/api/admin/caption-jobs/fail', {
    method: 'POST',
    body: JSON.stringify({ jobId, error: String(message).slice(0, 500) }),
  }).catch((err) => log(`[caption-worker] could not report failure for ${jobId}:`, err.message || err));
}

/**
 * Give a claimed-but-never-attempted job back (quota window, providers
 * offline) — refunds the claim-time attempt so an outage can't march jobs
 * to 'failed' without one real inference attempt.
 */
async function releaseJob(jobId, reason) {
  await api('/api/admin/caption-jobs/fail', {
    method: 'POST',
    body: JSON.stringify({ jobId, error: String(reason).slice(0, 500), release: true }),
  }).catch((err) => log(`[caption-worker] could not release ${jobId}:`, err.message || err));
}

function extForContentType(contentType) {
  if (/png/.test(contentType)) return 'png';
  if (/webp/.test(contentType)) return 'webp';
  if (/gif/.test(contentType)) return 'gif';
  return 'jpg';
}

async function downloadMedia(url, destBase) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`media fetch ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`unexpected content-type ${contentType} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`empty media for ${url}`);
  if (buf.length > MAX_MEDIA_BYTES) throw new Error(`media too large (${buf.length} bytes) for ${url}`);
  const path = `${destBase}.${extForContentType(contentType)}`;
  writeFileSync(path, buf);
  return path;
}

// ── claude -p (subscription, primary) ──────────────────────────────────

// "claude is temporarily unusable" — quota window, expired login, network.
// These must never burn job attempts: the jobs get released, not failed.
function looksUnavailable(text) {
  return /rate.?limit|quota|usage limit|limit reached|overloaded|too many requests|429|not logged in|\/login|unauthorized|authentication|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(
    text || ''
  );
}

/** Run one headless claude session; returns the final text output. */
function runClaude(prompt) {
  const result = spawnSync(
    CLAUDE_BIN,
    ['-p', '--model', CLAUDE_MODEL, '--allowedTools', 'Read'],
    {
      input: prompt,
      timeout: CLAUDE_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      cwd: WORK_DIR,
    }
  );
  if (result.error) {
    throw new Error(`claude spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').slice(-500);
    const err = new Error(`claude exited ${result.status}${result.signal ? ` (signal ${result.signal})` : ''}: ${stderr}`);
    err.unavailable = looksUnavailable(stderr) || looksUnavailable(result.stdout);
    throw err;
  }
  const out = (result.stdout || '').trim();
  if (!out) throw new Error('claude produced no output');
  return out;
}

/**
 * One claude session captions a whole batch of image jobs (they share the
 * same prompt text by construction — the server builds it per prompt_version).
 * Returns Map<jobId, rawJsonText>.
 */
function claudeCaptionImageBatch(jobs, files) {
  const fileList = jobs
    .map((job, i) => `${i + 1}. job ${job.id}: ${files.get(job.id)}`)
    .join('\n');

  const prompt = `You are captioning ${jobs.length} event photo(s). Use the Read tool to view each image file listed below, then analyze EACH one according to the instructions.

IMAGE FILES:
${fileList}

INSTRUCTIONS (apply to each image independently):
${jobs[0].prompt}

FINAL OUTPUT: after reading all images, output a single JSON object mapping each job id to its analysis object. Inside each analysis object, ALSO include a "_file" field containing that image's exact file path from the list above:
{"<job id>": { "_file": "<file path>", ...analysis fields... }, ...}
Output ONLY that JSON object — no markdown fences, no prose.`;

  const out = runClaude(prompt);
  let text = out.trim();
  if (text.startsWith('```json')) text = text.slice(7);
  else if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON object in claude output: ${out.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);

  const results = new Map();
  for (const job of jobs) {
    const entry = parsed[job.id];
    if (!entry || typeof entry !== 'object') continue;
    // The echoed _file is the mis-mapping guard: a swapped id would attach
    // one moment's caption to another and fan out to 12 locales.
    if (entry._file !== files.get(job.id)) {
      log(`[caption-worker] id/file mismatch for ${job.id} (got ${entry._file}) — dropping`);
      continue;
    }
    delete entry._file;
    results.set(job.id, JSON.stringify(entry));
  }
  return results;
}

/** One claude session for one video job (multiple key frames). */
function claudeCaptionVideo(job, framePaths) {
  const frameList = framePaths.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const prompt = `Use the Read tool to view each key-frame image file listed below (chronological order), then follow the instructions.

KEY FRAME FILES:
${frameList}

${job.prompt}`;
  return runClaude(prompt);
}

// ── ollama local VLM (fallback) ────────────────────────────────────────

async function ollamaCaption(prompt, imagePaths) {
  const images = imagePaths.map((p) => readFileSync(p).toString('base64'));
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_FALLBACK_MODEL,
      stream: false,
      format: 'json',
      options: { temperature: 0.3, num_predict: 800 },
      messages: [{ role: 'user', content: prompt, images }],
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error('ollama produced no output');
  return text;
}

// ── job processing ─────────────────────────────────────────────────────

async function completeJob(job, output, provider, model) {
  try {
    await api('/api/admin/caption-jobs/complete', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id, output, provider, model }),
    });
    log(`[caption-worker] done id=${job.id} type=${job.content_type} provider=${provider}`);
    return true;
  } catch (err) {
    // 422 = the server rejected the model's output — a failed attempt.
    if (err.status === 422) {
      log(`[caption-worker] output rejected id=${job.id}: ${err.message}`);
      await reportFailure(job.id, `output rejected: ${err.message}`.slice(0, 500));
      return false;
    }
    throw err;
  }
}

/** Download all media for a job; returns file paths or null (job failed). */
async function fetchJobMedia(job, batchDir) {
  const urls = Array.isArray(job.media_urls) ? job.media_urls : [];
  if (urls.length === 0) {
    await reportFailure(job.id, 'job has no media_urls');
    return null;
  }
  const paths = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      paths.push(await downloadMedia(urls[i], join(batchDir, `${job.id}-${i}`)));
    } catch (err) {
      await reportFailure(job.id, `media download failed: ${err.message}`);
      return null;
    }
  }
  return paths;
}

/**
 * Process one claimed batch. Image jobs sharing identical prompt text run
 * as ONE claude session; video jobs run individually.
 *
 * Failure semantics (every claimed job ends in exactly one of these):
 *  - completed        -> /complete
 *  - real attempt failed -> /fail (burns one of 3 attempts)
 *  - no provider could even be tried (quota window, ollama down) ->
 *    /fail {release} — refunds the claim so outages don't exhaust attempts.
 *
 * Returns 'backoff' when claude is unavailable and the fallback completed
 * nothing — the main loop then sleeps QUOTA_BACKOFF_MINUTES.
 */
async function processBatch(jobs) {
  const batchDir = join(WORK_DIR, `batch-${Date.now().toString(36)}`);
  mkdirSync(batchDir, { recursive: true });

  try {
    const imageJobs = [];
    const videoJobs = [];
    const files = new Map(); // jobId -> first media path (images)
    const frames = new Map(); // jobId -> all media paths (videos)

    for (const job of jobs) {
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

    let claudeUnavailable = false;
    let anyCompleted = false;

    const captionOne = async (job, mediaPaths) => {
      // 1. claude -p (subscription) — skipped for the rest of the batch
      //    once it reports unavailable.
      if (!claudeUnavailable) {
        try {
          const output =
            job.content_type === 'video'
              ? claudeCaptionVideo(job, mediaPaths)
              : null; // images run batched, not here
          if (output !== null) {
            if (await completeJob(job, output, 'claude-code', CLAUDE_MODEL)) anyCompleted = true;
            return;
          }
        } catch (err) {
          log(`[caption-worker] claude failed id=${job.id}:`, err.message);
          if (err.unavailable) claudeUnavailable = true;
          else {
            await reportFailure(job.id, `claude: ${err.message}`);
            return;
          }
        }
      }
      // 2. local VLM fallback.
      if (OLLAMA_FALLBACK_MODEL) {
        try {
          const output = await ollamaCaption(job.prompt, mediaPaths);
          if (await completeJob(job, output, 'ollama', OLLAMA_FALLBACK_MODEL)) anyCompleted = true;
          return;
        } catch (err) {
          log(`[caption-worker] ollama failed id=${job.id}:`, err.message);
          if (claudeUnavailable) {
            // Neither provider could genuinely run — refund the claim.
            await releaseJob(job.id, `claude unavailable; ollama: ${err.message}`);
          } else {
            await reportFailure(job.id, `ollama: ${err.message}`);
          }
          return;
        }
      }
      // 3. no fallback configured.
      if (claudeUnavailable) {
        await releaseJob(job.id, 'claude unavailable, no fallback configured');
      } else {
        await reportFailure(job.id, 'all caption providers failed');
      }
    };

    // Image jobs, grouped by identical prompt (prompt_version bumps split
    // groups naturally — each group is one claude session).
    const groups = new Map();
    for (const job of imageJobs) {
      const group = groups.get(job.prompt) ?? [];
      group.push(job);
      groups.set(job.prompt, group);
    }

    for (const group of groups.values()) {
      let results = null;

      if (!claudeUnavailable) {
        try {
          results = claudeCaptionImageBatch(group, files);
        } catch (err) {
          log(`[caption-worker] claude image batch failed (${group.length} jobs):`, err.message);
          if (err.unavailable) claudeUnavailable = true;
          else {
            // A real (non-availability) batch failure burns one attempt for
            // the whole group — same budget a solo failure would burn.
            for (const job of group) await reportFailure(job.id, `claude batch: ${err.message}`);
            continue;
          }
        }
      }

      if (results) {
        for (const job of group) {
          const output = results.get(job.id);
          if (output) {
            if (await completeJob(job, output, 'claude-code', CLAUDE_MODEL)) anyCompleted = true;
          } else {
            await reportFailure(job.id, 'model omitted or mis-mapped this job in batch output');
          }
        }
        continue;
      }

      // claude unavailable — try each image on the fallback path.
      for (const job of group) {
        await captionOne(job, [files.get(job.id)]);
      }
    }

    // Video jobs, one session each.
    for (const job of videoJobs) {
      await captionOne(job, frames.get(job.id));
    }

    return claudeUnavailable && !anyCompleted ? 'backoff' : 'ok';
  } finally {
    try {
      rmSync(batchDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
}

// ── main loop ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  mkdirSync(WORK_DIR, { recursive: true });
  log(
    `[caption-worker] starting — base=${BASE_URL} model=${CLAUDE_MODEL} batch=${BATCH_SIZE} poll=${POLL_SECONDS}s fallback=${OLLAMA_FALLBACK_MODEL || 'none'}`
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let backoff = false;
    try {
      const { jobs } = await api('/api/admin/caption-jobs/claim', {
        method: 'POST',
        body: JSON.stringify({ limit: BATCH_SIZE }),
      });
      if (jobs && jobs.length > 0) {
        log(`[caption-worker] claimed ${jobs.length} job(s)`);
        const outcome = await processBatch(jobs);
        if (outcome === 'backoff') {
          log(`[caption-worker] no provider available — backing off ${QUOTA_BACKOFF_MINUTES}m`);
          backoff = true;
        }
      }
    } catch (err) {
      log('[caption-worker] cycle error:', err.stack || err, err.cause ?? '');
    }
    await sleep((backoff ? QUOTA_BACKOFF_MINUTES * 60 : POLL_SECONDS) * 1000);
  }
}

main();

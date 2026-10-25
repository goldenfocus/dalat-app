'use client';

import { createClient } from '@/lib/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { extractCaptureTime, primeBatchCaptureTimes } from '@/lib/exif-capture-time';
import { isFinished, isWorking, mediaError, mediaMime, type UploadJob, type UploadReceipt } from './types';
import * as store from './store';
import { setMomentUploadActive } from './activity';

export interface UploadSnapshot {
  jobs: UploadJob[];
  userId: string | null;
  staging: number;
  online: boolean;
  ready: boolean;
}
const EMPTY: UploadSnapshot = { jobs: [], userId: null, staging: 0, online: true, ready: false };
let state = EMPTY;
const listeners = new Set<() => void>();
const volatileFiles = new Map<string, Blob>();
const captureTimes = new Map<string, Promise<string | null>>();
const active = new Map<string, AbortController>();
let boot: Promise<void> | undefined;
let pumping = false;
let reconciling = false;
let generation = 0;

export const getUploadSnapshot = () => state;
export const getEmptyUploadSnapshot = () => EMPTY;
export function subscribeUploads(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function emit(patch: Partial<UploadSnapshot>) {
  state = { ...state, ...patch };
  setMomentUploadActive(state.staging > 0 || state.jobs.some(job => isWorking(job.phase)));
  listeners.forEach(listener => listener());
}
function updateMemory(id: string, patch: Partial<UploadJob>) {
  emit({ jobs: state.jobs.map(job => job.id === id ? { ...job, ...patch } : job) });
}
async function update(id: string, patch: Partial<UploadJob>) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) return;
  const next = { ...job, ...patch };
  if (next.durable) await store.saveJob(next);
  updateMemory(id, patch);
}
function isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }

async function refresh() {
  const turn = generation;
  const jobs = await store.listJobs().catch(() => [] as UploadJob[]);
  if (turn !== generation) return;
  const own = jobs.filter(job => job.userId === state.userId);
  // Other tabs may have made progress. Never overwrite an in-flight local job.
  const live = new Map(state.jobs.filter(job => active.has(job.id) || !job.durable).map(job => [job.id, job]));
  emit({ jobs: [...own.map(job => live.get(job.id) || job), ...[...live.values()].filter(job => !own.some(x => x.id === job.id))]
    .sort((a, b) => a.createdAt - b.createdAt) });
}

export function startUploads(): Promise<void> {
  if (boot) return boot;
  boot = (async () => {
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    emit({ userId: user?.id ?? null, online: navigator.onLine });
    await refresh();
    emit({ ready: true });
    void pump();
    client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const id = session?.user.id ?? null;
      if (id === state.userId) return;
      generation++;
      active.forEach(controller => controller.abort());
      volatileFiles.clear();
      captureTimes.clear();
      emit({ userId: id, jobs: [], staging: 0 });
      setTimeout(() => { void refresh().then(pump); }, 0);
    });
    const resume = () => {
      emit({ online: navigator.onLine });
      if (navigator.onLine && document.visibilityState === 'visible') void refresh().then(pump).then(pollProcessing);
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', () => {
      emit({ online: false });
      active.forEach(controller => controller.abort());
    });
    document.addEventListener('visibilitychange', resume);
    // Wake locks are only an optional foreground convenience, never a durability mechanism.
    window.addEventListener('beforeunload', event => {
      if (state.staging > 0 || state.jobs.some(job => !job.durable && !isFinished(job.phase))) {
        event.preventDefault(); event.returnValue = '';
      }
    });
    setInterval(() => { if (state.userId && state.jobs.length && document.visibilityState === 'visible') resume(); }, 15000);
  })().catch(error => { boot = undefined; throw error; });
  return boot;
}

export interface UploadDestination { eventId: string; eventSlug: string; eventTitle: string; userId: string; locale: string }
export async function enqueueFiles(files: File[], destination: UploadDestination): Promise<void> {
  await startUploads();
  if (state.userId !== destination.userId) throw new Error('Please sign in again');
  const batchId = crypto.randomUUID();
  const turn = generation;
  primeBatchCaptureTimes(files);
  emit({ staging: state.staging + files.length });
  void navigator.storage?.persist?.().catch(() => false);
  for (const [index, file] of files.entries()) {
    if (turn !== generation) return;
    const invalid = mediaError(file.name, file.size, file.type);
    const job: UploadJob = { id: crypto.randomUUID(), batchId, ...destination,
      name: file.name, size: file.size, mime: mediaMime(file.name, file.type) || file.type,
      isVideo: (mediaMime(file.name, file.type) || '').startsWith('video/'),
      createdAt: Date.now() + index, lastModified: file.lastModified, phase: invalid ? 'error' : 'queued',
      progress: 0, durable: true, error: invalid ? `file:${invalid}` : undefined };
    if (!invalid) captureTimes.set(job.id, extractCaptureTime(file));
    try {
      await store.saveJob(job, invalid ? undefined : file);
    } catch {
      job.durable = false;
      job.phase = 'error';
      job.error = 'storage';
      if (!invalid) volatileFiles.set(job.id, file);
    }
    if (turn !== generation) return;
    emit({ jobs: [...state.jobs, job], staging: Math.max(0, state.staging - 1) });
    void pump();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function api(body: object, signal?: AbortSignal): Promise<UploadReceipt> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 65000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch('/api/moments/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new RequestError(result.error || 'Upload failed', response.status);
    return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new RequestError('Connection timed out. Your queue is saved.', 408);
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function prepareBody(job: UploadJob, restart = false) {
  return { action: 'prepare', id: job.remoteId || job.id, batchId: job.batchId,
    eventId: job.eventId, name: job.name, size: job.size, mime: job.mime,
    hash: job.hash, capturedAt: job.capturedAt, locale: job.locale, restart };
}
async function settle(job: UploadJob, result: UploadReceipt) {
  if (result.status === 'waiting') throw new Error('Still receiving this file. Please retry.');
  if (result.status === 'error') throw new Error(result.error || 'Video processing failed');
  await update(job.id, { phase: result.duplicate ? 'duplicate' : result.status,
    progress: 100, remoteId: result.id, momentId: result.momentId, previewUrl: result.previewUrl,
    error: undefined, uploadUrl: undefined });
  // Retain the source until video encoding succeeds so a provider failure can
  // be retried, while ordinary photos release disk space immediately.
  if (result.status !== 'processing') {
    await store.releaseFile(job.id).catch(() => {});
    volatileFiles.delete(job.id);
    captureTimes.delete(job.id);
  }
  window.dispatchEvent(new CustomEvent('dalat:moment-added', { detail: { eventId: job.eventId } }));
}

function put(url: string, file: Blob, signal: AbortSignal, progress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(event.loaded / event.total * 100); };
    xhr.onload = () => { cleanup(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new RequestError('Transfer interrupted', xhr.status)); };
    xhr.onerror = () => { cleanup(); reject(new Error('Network interrupted')); };
    xhr.onabort = cleanup;
    if (signal.aborted) { abort(); return; }
    xhr.send(file);
  });
}
async function tusPut(url: string, file: Blob, signal: AbortSignal, progress: (value: number) => void): Promise<void> {
  const tus = await import('tus-js-client');
  return new Promise((resolve, reject) => {
    const abort = () => { void upload.abort(); cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    const upload = new tus.Upload(file, { uploadUrl: url, chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000], storeFingerprintForResuming: false,
      onProgress: (done, total) => progress(done / total * 100),
      onError: error => {
        cleanup();
        const status = 'originalResponse' in error ? error.originalResponse?.getStatus() || 0 : 0;
        reject(new RequestError('Video transfer interrupted', status));
      },
      onSuccess: () => { cleanup(); resolve(); },
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    upload.start();
  });
}

async function processJob(original: UploadJob) {
  const controller = new AbortController();
  const { signal } = controller;
  active.set(original.id, controller);
  const turn = generation;
  let job = original;
  try {
    await update(job.id, { phase: 'preparing', error: undefined });
    let blob = volatileFiles.get(job.id) || await store.loadFile(job.id);
    if (!blob) throw new Error('missing-file');
    if (!job.prepared) {
      const file = new File([blob], job.name, { type: job.mime, lastModified: job.lastModified || 0 });
      const { hashUpload } = await import('./hash');
      const hash = job.hash || await hashUpload(file, signal);
      const capturedAt = job.capturedAt ?? await (captureTimes.get(job.id) || extractCaptureTime(file));
      signal.throwIfAborted();
      if (!job.isVideo && !['image/heic', 'image/heif'].includes(job.mime)) {
        const { compressImage } = await import('@/lib/image-compression');
        blob = (await compressImage(file)).file;
      }
      signal.throwIfAborted();
      job = { ...job, hash, capturedAt, prepared: true, size: blob.size, mime: blob.type || job.mime };
      await store.saveJob(job, blob);
      updateMemory(job.id, job);
    }
    signal.throwIfAborted();
    let result = await api(prepareBody(job), signal);
    await update(job.id, { remoteId: result.id, uploadUrl: result.uploadUrl });
    job = { ...job, remoteId: result.id, uploadUrl: result.uploadUrl };
    if (result.status !== 'waiting') { await settle(job, result); return; }
    if (!result.uploadUrl) throw new Error('Upload destination unavailable');
    await update(job.id, { phase: 'uploading' });
    let lastPaint = 0;
    const progress = (value: number) => {
      if (turn !== generation || Date.now() - lastPaint < 150) return;
      lastPaint = Date.now(); updateMemory(job.id, { progress: Math.min(99, Math.round(value)) });
    };
    if (job.isVideo) {
      try { await tusPut(result.uploadUrl, blob, signal, progress); }
      catch (error) {
        if (!(error instanceof RequestError && [400, 404, 410].includes(error.status))) throw error;
        // An expired session cannot resume. Reconcile first, then renew only if incomplete.
        result = await api(prepareBody(job, true), signal);
        if (result.status !== 'waiting') { await settle(job, result); return; }
        await update(job.id, { uploadUrl: result.uploadUrl });
        await tusPut(result.uploadUrl!, blob, signal, progress);
      }
    } else {
      await put(result.uploadUrl, blob, signal, progress);
    }
    await update(job.id, { phase: 'finishing', progress: 100 });
    // The server verifies storage and publishes atomically. Its reply may be
    // lost: the next prepare reconciles the same receipt without re-uploading.
    result = await api({ action: 'complete', id: job.remoteId }, signal);
    await settle(job, result);
  } catch (error) {
    if (turn !== generation) return;
    const current = state.jobs.find(item => item.id === job.id);
    if (!current) return;
    if (isAbort(error)) {
      await update(job.id, { phase: current.phase === 'paused' ? 'paused' : 'queued' }).catch(() => {});
    } else {
      const attempts = (current.attempts || 0) + 1;
      const message = error instanceof Error ? error.message : 'Upload interrupted';
      const noRetry = error instanceof RequestError && [400, 401, 403, 404, 410].includes(error.status);
      const retry = !noRetry && message !== 'missing-file' && attempts < 4;
      await update(job.id, { phase: retry ? 'queued' : 'error', attempts,
        error: error instanceof RequestError && error.status === 401 ? 'auth' : message }).catch(() => {
        updateMemory(job.id, { phase: 'error', error: 'storage' });
      });
      if (retry) await new Promise(resolve => setTimeout(resolve, Math.min(attempts * 2500, 7500)));
    }
  } finally {
    active.delete(job.id);
  }
}

async function drain() {
  await refresh();
  const running = new Set<Promise<void>>();
  while (state.online && state.userId) {
    const candidates = state.jobs.filter(job => job.durable && isWorking(job.phase) && !active.has(job.id));
    const videoBusy = state.jobs.some(job => job.isVideo && active.has(job.id));
    // Give one long video an early lane while photos fill the other slots.
    const next = (!videoBusy && candidates.find(job => job.isVideo)) || candidates.find(job => !job.isVideo);
    if (next && running.size < 3) {
      const task = processJob(next).finally(() => running.delete(task));
      running.add(task);
      continue;
    }
    if (!running.size) break;
    await Promise.race(running);
  }
  await Promise.all(running);
}
export async function pump() {
  if (pumping || !state.online || !state.userId) return;
  pumping = true;
  try {
    if (navigator.locks) await navigator.locks.request('dalat-event-upload-worker', { ifAvailable: true }, async lock => { if (lock) await drain(); });
    else await drain();
  } finally { pumping = false; }
}

export async function pauseUploads(eventId: string) {
  for (const job of state.jobs.filter(job => job.eventId === eventId && isWorking(job.phase))) {
    await update(job.id, { phase: 'paused' });
    active.get(job.id)?.abort();
  }
}
export async function retryUploads(eventId: string) {
  for (const job of state.jobs.filter(job => job.eventId === eventId && ['paused', 'error'].includes(job.phase))) {
    if (job.error?.startsWith('file:')) continue;
    if (!job.durable) {
      const file = volatileFiles.get(job.id);
      if (!file) { updateMemory(job.id, { error: 'missing-file' }); continue; }
      try { await store.saveJob({ ...job, durable: true }, file); }
      catch { updateMemory(job.id, { error: 'storage' }); continue; }
    }
    await update(job.id, { phase: 'queued', attempts: 0, error: undefined, durable: true });
  }
  void pump();
}
export async function clearFinished(eventId: string) {
  const ids = state.jobs.filter(job => job.eventId === eventId && isFinished(job.phase) && job.phase !== 'processing').map(job => job.id);
  for (const id of ids) await store.removeJob(id);
  emit({ jobs: state.jobs.filter(job => !ids.includes(job.id)) });
}
async function pollProcessing() {
  if (reconciling) return;
  reconciling = true;
  try {
    for (const job of state.jobs.filter(job => job.phase === 'processing' && job.remoteId).slice(0, 10)) {
      try {
        const result = await api({ action: 'complete', id: job.remoteId });
        if (result.status === 'error') await update(job.id, { phase: 'error', error: 'processing' });
        else if (result.status !== 'waiting') await settle(job, result);
      } catch { /* Next foreground poll retries; saved uploads remain visible. */ }
    }
  } finally { reconciling = false; }
}

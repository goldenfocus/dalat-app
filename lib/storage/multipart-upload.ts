/**
 * Client-side S3 Multipart Upload for large files.
 *
 * Splits files into chunks, uploads them in parallel via presigned URLs,
 * and assembles them on R2. Each chunk retries independently.
 *
 * Used automatically by uploadFile() when file size exceeds MULTIPART_THRESHOLD.
 */

import type { UploadResult } from "./client";

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB (R2/S3 minimum)
const DEFAULT_CONCURRENCY = 3;
const CHUNK_MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;

export interface MultipartUploadOptions {
  bucket: string;
  file: File;
  path: string;
  contentType: string;
  chunkSize?: number;
  maxConcurrency?: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt: number): number {
  const baseDelay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempt),
    MAX_RETRY_DELAY
  );
  const jitter = baseDelay * Math.random() * 0.25;
  return Math.round(baseDelay + jitter);
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Upload cancelled", "AbortError");
  }
}

async function apiCall<T>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `API call failed: ${response.status}`);
  }
  return response.json();
}

function uploadChunkXHR(
  url: string,
  blob: Blob,
  onBytesUploaded: (bytes: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      xhr.abort();
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onBytesUploaded(e.loaded);
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("etag");
        if (!etag) {
          reject(new Error(
            "No ETag in chunk upload response. " +
            "This usually means the R2 CORS policy does not expose the ETag header. " +
            "Check ExposeHeaders in the R2 bucket CORS configuration."
          ));
          return;
        }
        resolve(etag.replace(/"/g, ""));
      } else {
        reject(new Error(`Chunk upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during chunk upload"));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Chunk upload timed out"));
    };

    xhr.open("PUT", url);
    xhr.send(blob);
  });
}

async function uploadSingleChunk(
  url: string,
  blob: Blob,
  partNumber: number,
  chunkIndex: number,
  bytesPerChunk: number[],
  reportProgress: () => void,
  signal?: AbortSignal
): Promise<CompletedPart> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt++) {
    checkAborted(signal);
    bytesPerChunk[chunkIndex] = 0;
    reportProgress();

    try {
      const etag = await uploadChunkXHR(
        url,
        blob,
        (bytes) => {
          bytesPerChunk[chunkIndex] = bytes;
          reportProgress();
        },
        signal
      );

      bytesPerChunk[chunkIndex] = blob.size;
      reportProgress();
      return { partNumber, etag };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (signal?.aborted) throw lastError;

      // Don't retry 4xx errors
      if (
        lastError.message.includes("403") ||
        lastError.message.includes("404")
      ) {
        throw lastError;
      }

      if (attempt < CHUNK_MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        console.warn(
          `[Multipart] Chunk ${partNumber} failed (attempt ${attempt + 1}/${CHUNK_MAX_RETRIES}), retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Chunk ${partNumber} failed after retries`);
}

async function uploadChunksParallel(
  file: File,
  chunks: Array<{ partNumber: number; start: number; end: number }>,
  urlMap: Map<number, string>,
  maxConcurrency: number,
  bytesPerChunk: number[],
  reportProgress: () => void,
  signal?: AbortSignal
): Promise<CompletedPart[]> {
  const results: CompletedPart[] = [];
  let nextIndex = 0;

  // Internal controller: when one worker fails, cancel all others
  const internalController = new AbortController();
  const onExternalAbort = () => internalController.abort();
  signal?.addEventListener("abort", onExternalAbort);

  async function worker(): Promise<void> {
    try {
      while (nextIndex < chunks.length) {
        checkAborted(internalController.signal);
        const idx = nextIndex++;
        if (idx >= chunks.length) break;
        const chunk = chunks[idx];
        const url = urlMap.get(chunk.partNumber);
        if (!url) throw new Error(`No presigned URL for part ${chunk.partNumber}`);

        const blob = file.slice(chunk.start, chunk.end);
        const result = await uploadSingleChunk(
          url, blob, chunk.partNumber, idx,
          bytesPerChunk, reportProgress, internalController.signal
        );
        results.push(result);
      }
    } catch (error) {
      internalController.abort();
      throw error;
    }
  }

  try {
    const workerCount = Math.min(maxConcurrency, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  } finally {
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function multipartUpload(
  options: MultipartUploadOptions
): Promise<UploadResult> {
  const {
    bucket,
    file,
    path,
    contentType,
    chunkSize: requestedChunkSize,
    maxConcurrency = DEFAULT_CONCURRENCY,
    onProgress,
    signal,
  } = options;

  const chunkSize = Math.max(requestedChunkSize ?? DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE);
  const totalBytes = file.size;

  if (totalBytes === 0) {
    throw new Error("Cannot multipart upload an empty file");
  }

  const chunkCount = Math.ceil(totalBytes / chunkSize);

  // Step 1: Create multipart upload
  checkAborted(signal);
  const { uploadId, key } = await apiCall<{ uploadId: string; key: string; publicUrl: string }>(
    "/api/storage/multipart/create",
    { bucket, path, contentType },
    signal
  );

  const bytesPerChunk = new Array<number>(chunkCount).fill(0);
  const reportProgress = () => {
    if (!onProgress) return;
    const uploaded = bytesPerChunk.reduce((a, b) => a + b, 0);
    onProgress(Math.min(Math.round((uploaded / totalBytes) * 100), 99));
  };

  try {
    // Step 2: Build chunk list
    const chunks: Array<{ partNumber: number; start: number; end: number }> = [];
    for (let i = 0; i < chunkCount; i++) {
      chunks.push({
        partNumber: i + 1,
        start: i * chunkSize,
        end: Math.min((i + 1) * chunkSize, totalBytes),
      });
    }

    // Step 3: Batch presign all part URLs
    checkAborted(signal);
    const partNumbers = chunks.map((c) => c.partNumber);
    const { urls } = await apiCall<{
      urls: Array<{ partNumber: number; url: string }>;
    }>(
      "/api/storage/multipart/presign-part",
      { bucket, path, uploadId, partNumbers },
      signal
    );

    const urlMap = new Map<number, string>();
    for (const { partNumber, url } of urls) {
      urlMap.set(partNumber, url);
    }

    // Step 4: Upload chunks in parallel
    const completedParts = await uploadChunksParallel(
      file, chunks, urlMap, maxConcurrency,
      bytesPerChunk, reportProgress, signal
    );

    // Step 5: Complete multipart upload
    checkAborted(signal);
    const sorted = completedParts.sort((a, b) => a.partNumber - b.partNumber);
    const { publicUrl } = await apiCall<{ publicUrl: string }>(
      "/api/storage/multipart/complete",
      { bucket, path, uploadId, parts: sorted },
      signal
    );

    onProgress?.(100);
    return { publicUrl, path, provider: "r2" };
  } catch (error) {
    // Cleanup: abort the multipart upload on any failure
    try {
      await apiCall("/api/storage/multipart/complete", {
        bucket, path, uploadId, abort: true,
      });
    } catch (abortError) {
      console.error(
        `[Multipart] Failed to abort upload during cleanup. bucket=${bucket} path=${path} uploadId=${uploadId}`,
        abortError
      );
    }
    throw error;
  }
}

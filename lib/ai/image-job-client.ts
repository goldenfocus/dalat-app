/**
 * Client helper for queue-based image generation.
 *
 * The API enqueues a job on the Mac mini worker and returns 202 + jobId;
 * this helper polls the status endpoint until the image is ready
 * (typically 1-3 minutes) and resolves with the CDN URL.
 */

const POLL_INTERVAL_MS = 4000;
// Must survive one full retry cycle: 5-min worker lease + generation time.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class ImageJobError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function parseError(res: Response, fallback: string): Promise<ImageJobError> {
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return new ImageJobError(data.error || fallback, data.code);
  }
  const text = await res.text().catch(() => "");
  if (res.status === 413 || text.toLowerCase().includes("too large")) {
    return new ImageJobError("Request too large. Try a shorter prompt.", "too_large");
  }
  return new ImageJobError(`Server error (${res.status}): ${text.slice(0, 100)}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kick off a generation and wait for the result.
 * Resolves with the image's CDN URL; throws ImageJobError (with a `code`
 * the caller can map to a translated message) on failure.
 */
export async function generateImageViaQueue(
  payload: Record<string, unknown>,
  options?: { endpoint?: string; timeoutMs?: number }
): Promise<string> {
  const endpoint = options?.endpoint ?? "/api/ai/generate-image";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await parseError(res, "Generation failed");
  }

  const data = await res.json();
  if (data.imageUrl) return data.imageUrl; // synchronous path (legacy)
  if (!data.jobId) throw new ImageJobError(data.error || "Generation failed");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch(`/api/ai/generate-image/status?jobId=${data.jobId}`);
    if (!statusRes.ok) {
      // 4xx is permanent (expired session, bad job id) — bail with the real
      // error instead of quietly spinning to the deadline. 5xx/network: retry.
      if (statusRes.status >= 400 && statusRes.status < 500) {
        throw await parseError(statusRes, "Generation failed");
      }
      continue;
    }

    const job = await statusRes.json();
    if (job.status === "done" && job.imageUrl) return job.imageUrl;
    if (job.status === "failed") {
      throw new ImageJobError(job.error || "Generation failed", "generation_failed");
    }
  }

  throw new ImageJobError(
    "This is taking longer than usual. Your image may still appear shortly.",
    "timeout"
  );
}

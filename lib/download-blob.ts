export interface DownloadProgress { loaded: number; total: number | null }

/** Buffer only when an OS file-share sheet requires a complete File. */
export async function downloadBlob(
  url: string,
  options: { signal: AbortSignal; fallbackUrl?: string; onProgress: (progress: DownloadProgress) => void },
): Promise<Blob> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  let idleTimer: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abort, 45_000);
  };
  resetTimeout();
  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Download unavailable");
    } catch (error) {
      if (controller.signal.aborted || !options.fallbackUrl || url === options.fallbackUrl) throw error;
      response = await fetch(options.fallbackUrl, { signal: controller.signal });
    }
    if (!response.ok) throw new Error("Download unavailable");
    const size = Number(response.headers.get("content-length"));
    const total = Number.isFinite(size) && size > 0 ? size : null;
    options.onProgress({ loaded: 0, total });
    if (!response.body) return await response.blob();
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout();
      chunks.push(value.slice().buffer as ArrayBuffer);
      loaded += value.byteLength;
      options.onProgress({ loaded, total });
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
  } finally {
    clearTimeout(idleTimer!);
    options.signal.removeEventListener("abort", abort);
  }
}

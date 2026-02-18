// Client-side media conversion utilities

/**
 * Convert HEIC/HEIF image to JPEG using canvas (browser's native decoding)
 * This works on Safari/iOS which natively supports HEIC rendering.
 * Falls back gracefully if the browser doesn't support HEIC.
 */
async function convertHeicViaCanvas(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);

  try {
    // Try to load the HEIC image using browser's native decoder
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Browser cannot decode HEIC"));
      img.src = url;
    });

    // Successfully loaded - browser supports HEIC natively
    // Draw to canvas and export as JPEG
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas context not available");
    }

    ctx.drawImage(img, 0, 0);

    // Export as JPEG
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });

    if (!blob || blob.size === 0) {
      throw new Error("Canvas export produced empty result");
    }

    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    // Browser doesn't support native HEIC decoding
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface HeicConversionResult {
  file: File;
  needsServerConversion: boolean;
}

/**
 * Convert HEIC/HEIF image to JPEG
 *
 * Strategy:
 * 1. Try client-side heic2any conversion (WASM-based, works on most browsers)
 * 2. If that fails, try canvas conversion (uses browser's native HEIC decoder, works on Safari/iOS)
 * 3. If both fail, return original HEIC with flag for server-side conversion
 *
 * Server-side conversion flow:
 * - Upload HEIC to R2 via presigned URL (bypasses Cloudflare WAF)
 * - Call /api/convert-heic-r2 with the R2 path
 * - Server reads from R2, converts with sharp, saves JPEG back
 */
export async function convertHeicToJpeg(file: File): Promise<HeicConversionResult> {
  // Method 1: Try heic2any (WASM-based, works on most browsers)
  // Suppress console output from the WASM module — "Could not parse HEIF file"
  // and "ERR_LIBHEIF format not supported" are expected when falling through
  // to canvas or server-side conversion.
  try {
    const heic2any = (await import("heic2any")).default;

    const savedWarn = console.warn;
    const savedError = console.error;
    console.warn = () => {};
    console.error = () => {};
    let blob: Blob | Blob[];
    try {
      blob = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9,
      });
    } finally {
      console.warn = savedWarn;
      console.error = savedError;
    }

    const resultBlob = Array.isArray(blob) ? blob[0] : blob;

    if (!resultBlob || resultBlob.size === 0) {
      throw new Error("HEIC conversion produced empty result");
    }

    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    const convertedFile = new File([resultBlob], newName, {
      type: "image/jpeg",
    });

    return { file: convertedFile, needsServerConversion: false };
  } catch {
    // Expected — fall through to canvas
  }

  // Method 2: Try canvas conversion (uses browser's native HEIC decoder)
  // This works on Safari/iOS which is where most HEIC files come from
  try {
    const canvasResult = await convertHeicViaCanvas(file);
    if (canvasResult) {
      return { file: canvasResult, needsServerConversion: false };
    }
  } catch {
    // Expected — fall through to server-side
  }

  // Both client-side methods failed - return original for server-side conversion
  return { file, needsServerConversion: true };
}

/**
 * Upload HEIC file directly to server for conversion and storage
 * This bypasses R2 CORS issues by routing through our server
 *
 * @param file - The HEIC file to upload
 * @param bucket - Target bucket (e.g., "moments")
 * @param path - Target path within bucket
 * @returns URL and path of the converted JPEG
 */
export async function uploadHeicServerSide(
  file: File,
  bucket: string,
  path: string
): Promise<{ url: string; path: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);
  formData.append("path", path);

  let lastError: Error | null = null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s per attempt

    try {
      const response = await fetch("/api/upload-heic", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        return { url: result.url, path: result.path };
      }

      // Don't retry rate limits or auth errors
      if (response.status === 429 || response.status === 401) {
        const error = await response.json();
        throw new Error(error.error || `HEIC upload failed (${response.status})`);
      }

      const error = await response.json();
      lastError = new Error(error.error || "Server-side HEIC upload failed");
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error("HEIC conversion timed out — try a smaller file or retry");
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      // Don't retry non-retryable errors (rate limit, auth)
      if (lastError.message.includes("Rate limit") || lastError.message.includes("401")) {
        throw lastError;
      }
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw lastError || new Error("HEIC upload failed after retries");
}

/**
 * Convert a HEIC file already uploaded to R2 into JPEG server-side.
 * Sends only the path (small JSON), NOT the file binary — so Cloudflare WAF
 * doesn't block it. The server reads from R2, converts with sharp, saves
 * the JPEG back, and deletes the original HEIC.
 */
export async function convertHeicOnR2(
  bucket: string,
  path: string
): Promise<{ url: string; path: string }> {
  let lastError: Error | null = null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("/api/convert-heic-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, path }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        return { url: result.url, path: result.path };
      }

      // Don't retry auth errors
      if (response.status === 401) {
        const error = await response.json();
        throw new Error(error.error || "Authentication required");
      }

      const error = await response.json();
      lastError = new Error(error.error || "HEIC conversion failed");
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error("HEIC conversion timed out");
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (lastError.message.includes("Authentication")) throw lastError;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw lastError || new Error("HEIC conversion failed after retries");
}

/**
 * Convert MOV video to MP4 using CloudConvert API
 * Uploads to CloudConvert, converts, and returns the converted file
 */
export async function convertMovToMp4(
  file: File,
  onProgress?: (status: string) => void
): Promise<File> {
  onProgress?.("Preparing conversion...");

  // Step 1: Create conversion job
  const createResponse = await fetch("/api/convert-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, filesize: file.size }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(error.error || "Failed to create conversion job");
  }

  const { jobId, uploadUrl, uploadFields } = await createResponse.json();

  // Step 2: Upload file to CloudConvert
  onProgress?.("Uploading video...");
  const formData = new FormData();
  // CloudConvert requires fields to be added before the file
  if (uploadFields) {
    Object.entries(uploadFields).forEach(([key, value]) => {
      formData.append(key, value as string);
    });
  }
  formData.append("file", file);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload video for conversion");
  }

  // Step 3: Poll for completion
  onProgress?.("Converting to MP4...");
  const result = await pollConversionJob(jobId, onProgress);

  // Step 4: Download converted file
  onProgress?.("Downloading converted video...");
  const mp4Response = await fetch(result.downloadUrl);
  if (!mp4Response.ok) {
    throw new Error("Failed to download converted video");
  }

  const mp4Blob = await mp4Response.blob();
  const newName = file.name.replace(/\.mov$/i, ".mp4");
  return new File([mp4Blob], newName, { type: "video/mp4" });
}

/**
 * Poll CloudConvert job until completion
 */
async function pollConversionJob(
  jobId: string,
  onProgress?: (status: string) => void
): Promise<{ downloadUrl: string }> {
  const maxAttempts = 120; // 10 minutes max (5s intervals)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(`/api/convert-video?jobId=${jobId}`);
    if (!response.ok) {
      throw new Error("Failed to check conversion status");
    }

    const data = await response.json();

    if (data.status === "finished") {
      return { downloadUrl: data.downloadUrl };
    }

    if (data.status === "error") {
      throw new Error(data.error || "Conversion failed");
    }

    // Update progress
    if (data.progress) {
      onProgress?.(`Converting... ${Math.round(data.progress * 100)}%`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error("Conversion timed out");
}

export interface ConversionResult {
  file: File;
  needsServerConversion: boolean;
}

/**
 * Convert file if needed, returns original file if no conversion required
 * Note: MOV files now upload directly without conversion (modern browsers handle them)
 *
 * @returns ConversionResult with file and needsServerConversion flag
 *          If needsServerConversion is true, upload to R2 first, then call convertHeicServerSide
 */
export async function convertIfNeeded(
  file: File,
  onProgress?: (status: string) => void
): Promise<ConversionResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    ext === "heic" ||
    ext === "heif";

  if (isHeic) {
    onProgress?.("Converting HEIC to JPEG...");
    return await convertHeicToJpeg(file);
  }

  return { file, needsServerConversion: false };
}

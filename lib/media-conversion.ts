// Client-side media conversion utilities

/**
 * Convert HEIC/HEIF image to JPEG
 * Tries client-side heic2any first. If that fails, returns the original file
 * (modern browsers + Cloudflare CDN can display HEIC directly).
 *
 * Note: Server-side conversion removed due to Vercel body size limits causing 403s.
 * Modern Safari, Chrome (macOS/iOS), and Edge can display HEIC natively.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log("[HEIC] Starting conversion for:", file.name, "size:", file.size);

  try {
    // Dynamic import to ensure WASM loads properly at runtime
    const heic2any = (await import("heic2any")).default;

    console.log("[HEIC] heic2any loaded, starting conversion...");

    const blob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    console.log("[HEIC] Conversion complete, blob result:", blob);

    // heic2any can return a single blob or array of blobs (for multi-image HEIC)
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;

    if (!resultBlob || resultBlob.size === 0) {
      throw new Error("HEIC conversion produced empty result");
    }

    // Create new file with .jpg extension
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    const convertedFile = new File([resultBlob], newName, {
      type: "image/jpeg",
    });

    console.log(
      "[HEIC] Created converted file:",
      convertedFile.name,
      "size:",
      convertedFile.size
    );

    return convertedFile;
  } catch (error) {
    // Client-side conversion failed - just upload HEIC directly
    // Modern browsers (Safari, Chrome on macOS/iOS, Edge) can display HEIC natively
    // Cloudflare CDN will serve it, and Cloudflare Images can transform if needed
    console.warn("[HEIC] Client-side conversion failed, uploading original:", error);
    console.log("[HEIC] Uploading HEIC directly - modern browsers handle it natively");

    return file; // Return original HEIC file
  }
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

/**
 * Convert file if needed, returns original file if no conversion required
 * Note: MOV files now upload directly without conversion (modern browsers handle them)
 */
export async function convertIfNeeded(
  file: File,
  onProgress?: (status: string) => void
): Promise<File> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    ext === "heic" ||
    ext === "heif";

  console.log("[Convert] Checking file:", file.name, "type:", file.type, "ext:", ext, "isHeic:", isHeic);

  if (isHeic) {
    onProgress?.("Converting HEIC to JPEG...");
    console.log("[Convert] Starting HEIC conversion...");
    const result = await convertHeicToJpeg(file);
    console.log("[Convert] HEIC conversion result:", result.name, result.type, result.size);
    return result;
  }

  console.log("[Convert] No conversion needed, returning original");
  return file;
}

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

/**
 * Convert HEIC/HEIF image to JPEG
 *
 * Strategy:
 * 1. Try client-side heic2any conversion (WASM-based, works on most browsers)
 * 2. If that fails, try canvas conversion (uses browser's native HEIC decoder, works on Safari/iOS)
 * 3. If both fail, throw an error (storage backends don't accept raw HEIC)
 *
 * Note: We never upload raw HEIC files because:
 * - Supabase Storage rejects HEIC with "mime type not supported"
 * - R2 might accept it, but fallback to Supabase would still fail
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log("[HEIC] Starting conversion for:", file.name, "size:", file.size, "type:", file.type);

  // Method 1: Try heic2any (WASM-based, works on most browsers)
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
  } catch (heic2anyError) {
    console.warn("[HEIC] heic2any conversion failed, trying canvas fallback:", heic2anyError);
  }

  // Method 2: Try canvas conversion (uses browser's native HEIC decoder)
  // This works on Safari/iOS which is where most HEIC files come from
  try {
    console.log("[HEIC] Attempting canvas-based conversion (native browser decoder)...");
    const canvasResult = await convertHeicViaCanvas(file);

    if (canvasResult) {
      console.log(
        "[HEIC] Canvas conversion successful:",
        canvasResult.name,
        "size:",
        canvasResult.size
      );
      return canvasResult;
    }
  } catch (canvasError) {
    console.warn("[HEIC] Canvas conversion failed:", canvasError);
  }

  // Both methods failed - throw error instead of uploading raw HEIC
  // (storage backends don't accept HEIC mime type)
  console.error("[HEIC] All conversion methods failed for:", file.name);
  throw new Error(
    "Unable to convert HEIC image. Please convert to JPEG/PNG before uploading, or try a different browser."
  );
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

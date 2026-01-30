/**
 * Client-side video compression using FFmpeg.wasm
 * Compresses large videos before upload to reduce file size and upload time.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Compression target: videos larger than this will be compressed
export const COMPRESSION_THRESHOLD = 50 * 1024 * 1024; // 50MB

// Maximum allowed size after compression attempt
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB input limit

// Singleton FFmpeg instance
let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

/**
 * Get or create the FFmpeg instance (lazy-loaded singleton)
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) {
    return ffmpeg;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const instance = new FFmpeg();

    // Load FFmpeg core from CDN (smaller than bundling)
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await instance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpeg = instance;
    return instance;
  })();

  return loadingPromise;
}

export interface CompressionProgress {
  stage: "loading" | "compressing" | "done" | "error";
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: CompressionProgress) => void;

/**
 * Check if a video file needs compression
 */
export function needsCompression(file: File): boolean {
  const isVideo = file.type.startsWith("video/") ||
    file.name.toLowerCase().endsWith(".mov");
  return isVideo && file.size > COMPRESSION_THRESHOLD;
}

/**
 * Check if a video file is too large even for compression
 */
export function isVideoTooLarge(file: File): boolean {
  const isVideo = file.type.startsWith("video/") ||
    file.name.toLowerCase().endsWith(".mov");
  return isVideo && file.size > MAX_VIDEO_SIZE;
}

/**
 * Compress a video file using FFmpeg.wasm
 *
 * @param file - The video file to compress
 * @param onProgress - Callback for progress updates
 * @returns Compressed video file, or original if compression fails/not needed
 */
export async function compressVideo(
  file: File,
  onProgress?: ProgressCallback
): Promise<File> {
  // Skip if doesn't need compression
  if (!needsCompression(file)) {
    return file;
  }

  const report = (stage: CompressionProgress["stage"], progress: number, message: string) => {
    onProgress?.({ stage, progress, message });
  };

  try {
    report("loading", 0, "Loading compressor...");

    const ff = await getFFmpeg();

    report("loading", 20, "Preparing video...");

    // Determine input/output formats
    const inputExt = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const inputName = `input.${inputExt}`;
    const outputName = "output.mp4";

    // Write input file to FFmpeg virtual filesystem
    await ff.writeFile(inputName, await fetchFile(file));

    report("compressing", 30, "Compressing video...");

    // Set up progress tracking
    ff.on("progress", ({ progress }) => {
      // FFmpeg progress is 0-1, map to 30-90%
      const percent = Math.round(30 + progress * 60);
      report("compressing", percent, `Compressing... ${Math.round(progress * 100)}%`);
    });

    // Compression settings:
    // - CRF 28: Good balance of quality and size (lower = better quality, larger file)
    // - preset: veryfast for reasonable speed
    // - scale: max 1080p height while maintaining aspect ratio
    // - audio: 128k AAC (good quality, reasonable size)
    await ff.exec([
      "-i", inputName,
      "-c:v", "libx264",
      "-crf", "28",
      "-preset", "veryfast",
      "-vf", "scale=-2:min(ih\\,1080)", // Max 1080p height, maintain aspect
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart", // Enable streaming
      outputName,
    ]);

    report("compressing", 95, "Finalizing...");

    // Read output file
    const data = await ff.readFile(outputName);

    // Clean up
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    // Create new File object
    // FFmpeg returns Uint8Array, need to extract the underlying ArrayBuffer portion
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected output format from FFmpeg");
    }
    const compressedBlob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: "video/mp4" });
    const compressedFile = new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, ".mp4"),
      { type: "video/mp4" }
    );

    report("done", 100, `Compressed: ${formatSize(file.size)} → ${formatSize(compressedFile.size)}`);

    // Return compressed file (or original if compression made it larger)
    if (compressedFile.size < file.size) {
      return compressedFile;
    } else {
      console.log("[Compression] Output larger than input, using original");
      return file;
    }
  } catch (error) {
    console.error("[Compression] Failed:", error);
    report("error", 0, "Compression failed, uploading original...");
    // Return original file on error
    return file;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

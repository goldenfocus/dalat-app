/**
 * Centralized R2 Configuration
 *
 * All R2 environment variables are trimmed here to prevent
 * issues with trailing newlines (\n) that Vercel sometimes adds.
 *
 * ALWAYS use this module instead of reading process.env directly.
 */

export interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl: string;
  bucketName: string;
}

const DEFAULT_BUCKET_NAME = "dalat-app-media";

/**
 * Get R2 configuration with all values trimmed
 * @returns R2Config if all required vars are set, null otherwise
 */
export function getR2Config(): R2Config | null {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim();
  const bucketName = (
    process.env.CLOUDFLARE_R2_BUCKET_NAME || DEFAULT_BUCKET_NAME
  ).trim();

  if (!accessKeyId || !secretAccessKey || !endpoint || !publicUrl) {
    return null;
  }

  return { accessKeyId, secretAccessKey, endpoint, publicUrl, bucketName };
}

/**
 * Get R2 configuration or throw if not configured
 * Use this when R2 is required (not optional fallback)
 */
export function getR2ConfigOrThrow(): R2Config {
  const config = getR2Config();

  if (!config) {
    const missing = [];
    if (!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim())
      missing.push("CLOUDFLARE_R2_ACCESS_KEY_ID");
    if (!process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim())
      missing.push("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    if (!process.env.CLOUDFLARE_R2_ENDPOINT?.trim())
      missing.push("CLOUDFLARE_R2_ENDPOINT");
    if (!process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim())
      missing.push("CLOUDFLARE_R2_PUBLIC_URL");

    throw new Error(
      `Cloudflare R2 not configured. Missing: ${missing.join(", ")}`
    );
  }

  return config;
}

/**
 * Check if R2 is properly configured
 */
export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/**
 * File hashing utilities for duplicate detection
 *
 * Uses the Web Crypto API (built into all modern browsers) to compute
 * SHA-256 hashes of file contents. This is used to detect duplicate
 * uploads within an album before wasting bandwidth on re-uploading.
 */

/**
 * Compute SHA-256 hash of a file
 * Returns a hex string like "a1b2c3d4..."
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute hashes for multiple files in parallel
 * Returns a Map of file -> hash
 */
export async function computeFileHashes(
  files: File[]
): Promise<Map<File, string>> {
  const results = new Map<File, string>();

  // Process in batches to avoid overwhelming memory with large files
  const BATCH_SIZE = 10;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const hashes = await Promise.all(batch.map(computeFileHash));

    batch.forEach((file, index) => {
      results.set(file, hashes[index]);
    });
  }

  return results;
}

/**
 * Check which hashes already exist in an event/album
 * Returns the set of hashes that are duplicates
 */
export async function checkDuplicateHashes(
  eventId: string,
  hashes: string[]
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();

  const response = await fetch("/api/moments/check-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, hashes }),
  });

  if (!response.ok) {
    console.warn("[DuplicateCheck] API call failed, skipping check");
    return new Set();
  }

  const { duplicates } = await response.json();
  return new Set(duplicates);
}

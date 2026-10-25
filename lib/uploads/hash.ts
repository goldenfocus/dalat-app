import { sha256 } from '@noble/hashes/sha256';

// Read bounded slices instead of file.arrayBuffer() on every selected video.
// Yield between slices so a large batch never blocks taps or paints.
export async function hashUpload(file: Blob, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
    signal?.throwIfAborted();
    hash.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
}

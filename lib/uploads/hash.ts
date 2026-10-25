import { sha256 } from '@noble/hashes/sha256';

// Read bounded slices instead of file.arrayBuffer() on every selected video.
// Yield between slices so a large batch never blocks taps or paints.
export async function hashUpload(file: Blob, signal?: AbortSignal): Promise<string> {
  return hashByteRanges(file.size, async (start, end) => file.slice(start, end).arrayBuffer(), signal);
}
export async function hashByteRanges(size: number, read: (start: number, end: number) => Promise<ArrayBuffer>, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < size; offset += 1024 * 1024) {
    signal?.throwIfAborted();
    hash.update(new Uint8Array(await read(offset, offset + 1024 * 1024)));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
}

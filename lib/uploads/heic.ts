// HEIC/HEIF handling for the moment uploader. Pure decision logic lives here so
// it can be tested without a browser; the heavy decoder is loaded on demand.

export const isHeicFile = (name: string, mime: string) =>
  /^image\/hei[cf]$/i.test(mime) || /\.(heic|heif)$/i.test(name);

export const jpegNameFor = (name: string) => name.replace(/\.(heic|heif)$/i, '.jpg');

export type HeicConverter = (file: File) => Promise<{ file: File; needsServerConversion: boolean }>;

/**
 * Convert a HEIC photo to JPEG on the device. Any failure (or a converter that
 * defers to the server) returns the untouched original, so the existing server
 * conversion in lib/uploads/server.ts remains the safety net.
 */
export async function prepareHeicForUpload(file: File, convert: HeicConverter): Promise<{ file: File; converted: boolean }> {
  if (!isHeicFile(file.name, file.type)) return { file, converted: false };
  try {
    const result = await convert(file);
    if (result.needsServerConversion || result.file.size <= 0 || result.file.type !== 'image/jpeg') return { file, converted: false };
    const named = result.file.name === jpegNameFor(file.name) ? result.file
      : new File([result.file], jpegNameFor(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
    return { file: named, converted: true };
  } catch {
    return { file, converted: false };
  }
}

// One decode at a time: a 12 MP HEIC needs tens of MB of working memory and a
// phone batch runs several jobs in parallel.
let chain: Promise<unknown> = Promise.resolve();
export function convertHeicOnDevice(file: File): Promise<{ file: File; needsServerConversion: boolean }> {
  const run = chain.then(async () => {
    const { convertHeicToJpeg } = await import('@/lib/media-conversion');
    return convertHeicToJpeg(file, { preferNative: true });
  });
  chain = run.catch(() => {});
  return run;
}

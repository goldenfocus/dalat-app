// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isHeicFile, jpegNameFor, prepareHeicForUpload } from './heic';

const heic = new File([new Uint8Array(10)], 'IMG_0001.HEIC', { type: 'image/heic' });
const jpeg = (name = 'IMG_0001.jpg') => new File([new Uint8Array(4)], name, { type: 'image/jpeg' });

describe('HEIC detection', () => {
  it('recognises HEIC by MIME or extension, and nothing else', () => {
    expect(isHeicFile('a.jpg', 'image/heic')).toBe(true);
    expect(isHeicFile('A.HEIF', '')).toBe(true);
    expect(isHeicFile('a.jpg', 'image/jpeg')).toBe(false);
    expect(isHeicFile('movie.mov', 'video/quicktime')).toBe(false);
  });
  it('renames to .jpg', () => { expect(jpegNameFor('IMG_1.HEIC')).toBe('IMG_1.jpg'); });
});

describe('prepareHeicForUpload', () => {
  it('leaves non-HEIC files alone without calling the converter', async () => {
    const convert = vi.fn(); const file = jpeg();
    expect(await prepareHeicForUpload(file, convert)).toEqual({ file, converted: false });
    expect(convert).not.toHaveBeenCalled();
  });
  it('uses the on-device JPEG and fixes its name', async () => {
    const result = await prepareHeicForUpload(heic, async () => ({ file: jpeg('blob.jpg'), needsServerConversion: false }));
    expect(result.converted).toBe(true);
    expect(result.file.name).toBe('IMG_0001.jpg'); expect(result.file.type).toBe('image/jpeg');
  });
  it('falls back to the original (server conversion) when the device cannot convert', async () => {
    expect(await prepareHeicForUpload(heic, async () => ({ file: heic, needsServerConversion: true }))).toEqual({ file: heic, converted: false });
    expect(await prepareHeicForUpload(heic, async () => { throw new Error('wasm'); })).toEqual({ file: heic, converted: false });
    expect(await prepareHeicForUpload(heic, async () => ({ file: new File([], 'x.jpg', { type: 'image/jpeg' }), needsServerConversion: false })))
      .toEqual({ file: heic, converted: false });
  });
});

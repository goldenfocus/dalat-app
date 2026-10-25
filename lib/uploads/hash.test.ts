// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashUpload } from './hash';
import { mediaError, mediaMime } from './types';

describe('original media identity', () => {
  it('hashes a large file in bounded chunks and matches SHA-256', async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024 + 17).fill(197);
    bytes[bytes.length - 1] = 3;
    const file = new Blob([bytes]);
    const whole = vi.spyOn(file, 'arrayBuffer');
    const slices = vi.spyOn(file, 'slice');
    expect(await hashUpload(file)).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(whole).not.toHaveBeenCalled();
    expect(slices).toHaveBeenCalledTimes(4);
    for (const [start, end] of slices.mock.calls) expect(Number(end) - Number(start)).toBeLessThanOrEqual(1024 * 1024);
  });
  it('can stop before reading a cancelled upload', async () => {
    const controller = new AbortController(); controller.abort();
    const file = new Blob(['photo']); const read = vi.spyOn(file, 'slice');
    await expect(hashUpload(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('mobile selection validation', () => {
  it('accepts a 150MB iPhone MOV without requiring browser transcoding', () => {
    expect(mediaError('IMG_0001.MOV', 150 * 1024 * 1024, '')).toBeNull();
    expect(mediaMime('IMG_0001.MOV', '')).toBe('video/quicktime');
  });
  it('accepts HEIC from pickers that omit MIME', () => {
    expect(mediaError('IMG_0001.HEIC', 10 * 1024 * 1024, '')).toBeNull();
  });
  it('rejects empty files, unsafe types and files above the supported limit', () => {
    expect(mediaError('x.jpg', 0, 'image/jpeg')).toBe('empty');
    expect(mediaError('x.svg', 100, 'image/svg+xml')).toBe('unsupported');
    expect(mediaError('x.mov', 501 * 1024 * 1024, 'video/quicktime')).toBe('size');
    expect(mediaError('x.jpg', 51 * 1024 * 1024, 'image/jpeg')).toBe('size');
  });
});

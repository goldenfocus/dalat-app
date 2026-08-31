import { describe, expect, it } from 'vitest';

import { noStoreJson } from './no-store-json';

describe('noStoreJson', () => {
  it('prevents browsers, Cloudflare, and Vercel from replaying cron responses', async () => {
    const response = noStoreJson({ ok: true });

    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

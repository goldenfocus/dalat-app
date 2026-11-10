// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type FetchEvent = {
  request: { url: string; mode: string; method: string };
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};

function worker(network: ReturnType<typeof vi.fn>, cached?: Response) {
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const cache = { match: vi.fn(async () => cached), delete: vi.fn(async () => true),
    put: vi.fn(async () => {}), keys: vi.fn(async () => []) };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://dalat.app', hostname: 'dalat.app' },
      addEventListener: (name: string, callback: (event: FetchEvent) => void) => handlers.set(name, callback) },
    URL, Response, fetch: network, caches: { open: async () => cache },
  });
  async function navigate(path = '/') {
    let response: Promise<Response> | undefined;
    const work: Promise<unknown>[] = [];
    handlers.get('fetch')!({ request: { url: `https://dalat.app${path}`, mode: 'navigate', method: 'GET' },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => { work.push(value); } });
    const result = await response;
    await Promise.all(work);
    return result;
  }
  return { navigate, cache };
}

const html = (body: string, init: ResponseInit = {}) => new Response(body,
  { ...init, headers: { 'content-type': 'text/html', ...init.headers } });

describe('public page navigation', () => {
  it.each(['/', '/vi', '/events/a-real-event', '/vi/moments'])('loads fresh online HTML for %s', async path => {
    const fresh = html('current deployment');
    const network = vi.fn(async () => fresh);
    const { navigate, cache } = worker(network, html('old deployment'));
    expect(await navigate(path)).toBe(fresh);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledOnce();
  });
  it('falls back to saved public HTML only on a network failure', async () => {
    const offline = html('saved page');
    const { navigate } = worker(vi.fn(async () => { throw new Error('offline'); }), offline);
    expect(await navigate()).toBe(offline);
  });
  it('returns a network error if offline without a saved page', async () => {
    const { navigate } = worker(vi.fn(async () => { throw new Error('offline'); }));
    expect((await navigate())?.type).toBe('error');
  });
  it.each([403, 404, 500])('preserves HTTP %i and removes the stale fallback', async status => {
    const failed = html('failure', { status });
    const { navigate, cache } = worker(vi.fn(async () => failed), html('stale page'));
    expect(await navigate()).toBe(failed);
    expect(cache.delete).toHaveBeenCalledOnce();
    expect(cache.put).not.toHaveBeenCalled();
  });
  it.each(['private, max-age=0', 'no-store'])('does not save %s HTML', async control => {
    const { navigate, cache } = worker(vi.fn(async () => html('private', { headers: { 'cache-control': control } })));
    await navigate();
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('does not save redirects or non-HTML responses', async () => {
    for (const response of [new Response('rsc'), Response.redirect('https://dalat.app/auth/login')]) {
      const { navigate, cache } = worker(vi.fn(async () => response));
      await navigate();
      expect(cache.put).not.toHaveBeenCalled();
    }
  });
  it.each(['/auth/login', '/events/example/host', '/vi/events/example/arrive'])('does not intercept private route %s', async path => {
    const network = vi.fn();
    expect(await worker(network).navigate(path)).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  });
});

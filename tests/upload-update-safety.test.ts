// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

async function installWithPages(paths: string[]) {
  const handlers = new Map<string, (event: unknown) => void>();
  const skipWaiting = vi.fn();
  const clients = { matchAll: async () => paths.map(path => ({ url: `https://dalat.app${path}` })) };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://dalat.app', hostname: 'dalat.app' }, clients, skipWaiting,
      addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback) },
    clients, URL, console: { log() {} },
    caches: { open: async () => ({ addAll: async () => {} }) },
  });
  let finished: Promise<unknown> | undefined;
  handlers.get('install')!({ waitUntil: (promise: Promise<unknown>) => { finished = promise; } });
  await finished;
  return skipWaiting;
}

describe('upgrade safety for the old uploader', () => {
  it.each(['/events/past-event/moments/new', '/vi/events/past-event/moments/new', '/events/past-event/moments/pro-upload'])('waits instead of forcing %s to reload', async path => {
    expect(await installWithPages(['/', path])).not.toHaveBeenCalled();
  });
  it('activates normally when no old uploader is open', async () => {
    expect(await installWithPages(['/', '/events/past-event/moments'])).toHaveBeenCalledOnce();
  });
});

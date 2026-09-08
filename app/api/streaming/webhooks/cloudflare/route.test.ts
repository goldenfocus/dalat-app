import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ result: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ verifyWebhookSignature: () => true, getCloudflareWebhookEventType: () => 'video.ready', getVideoDetails: async () => ({ playback: { hls: 'playback' } }), enableVideoDownloads: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: () => ({ neq: () => ({ select: () => ({ maybeSingle: mocks.result }) }) }) }), select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }) }) }));
import { POST } from './route';
const call = () => POST(new Request('https://dalat.app', { method: 'POST', body: JSON.stringify({ uid: 'cf' }) }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.com'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test'); mocks.result.mockResolvedValue({ data: null, error: null }); });
describe('early video completion webhook', () => {
  it('does not acknowledge completion before the moment exists', async () => {
    mocks.lookup.mockResolvedValue({ data: null });
    expect((await call()).status).toBe(503);
  });
  it('acknowledges an already reconciled video', async () => {
    mocks.lookup.mockResolvedValue({ data: { id: 'moment' } });
    expect((await call()).status).toBe(200);
  });
  it('does not swallow a database failure', async () => {
    mocks.result.mockResolvedValue({ error: new Error('Database unavailable') });
    expect((await call()).status).toBe(503);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), details: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: mocks.read }) }) }) }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ update: mocks.update }) }) }));
vi.mock('@/lib/cloudflare-stream', () => ({ getVideoDetails: mocks.details }));
import { POST } from './route';
const call = () => POST(new Request('https://dalat.app', { method: 'POST' }), { params: Promise.resolve({ id: 'moment' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: { id: 'moment', cf_video_uid: 'cf', video_status: 'processing', thumbnail_url: 'custom-cover' } }); mocks.update.mockReturnValue({ eq: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }); });
describe('video status reconciliation', () => {
  it('refuses inaccessible moments before contacting Cloudflare', async () => {
    mocks.read.mockResolvedValue({ data: null });
    expect((await call()).status).toBe(404);
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('recovers ready metadata and preserves a selected cover', async () => {
    mocks.details.mockResolvedValue({ status: { state: 'ready' }, playback: { hls: 'playback' }, thumbnail: 'provider-cover', duration: 10 });
    const response = await call();
    expect(await response.json()).toMatchObject({ video_status: 'ready', cf_playback_url: 'playback', thumbnail_url: 'custom-cover' });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('allows playback when the first quality level is ready', async () => {
    mocks.details.mockResolvedValue({ readyToStream: true, status: { state: 'inprogress' }, playback: { hls: 'playback' } });
    expect((await (await call()).json()).video_status).toBe('ready');
  });
  it('does not mark a still encoding video ready', async () => {
    mocks.details.mockResolvedValue({ status: { state: 'inprogress' } });
    expect((await (await call()).json()).video_status).toBe('processing');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('returns a retryable error when Cloudflare is unavailable', async () => {
    mocks.details.mockRejectedValue(new Error('Unavailable'));
    expect((await call()).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

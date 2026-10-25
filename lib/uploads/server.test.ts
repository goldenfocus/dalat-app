import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ details: vi.fn(), create: vi.fn(), remove: vi.fn(), rpc: vi.fn(), updated: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ getVideoDetails: mocks.details, createTusDirectUpload: mocks.create, deleteVideo: mocks.remove }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => {
  const chain = { eq: () => chain, is: () => chain, select: () => chain, maybeSingle: mocks.updated };
  return { rpc: mocks.rpc, from: () => ({ update: () => chain }) };
} }));
import { prepareDestination, reconcileUpload, type ServerUpload } from './server';
const upload: ServerUpload = { id: 'upload', batch_id: 'batch', user_id: 'owner', event_id: 'event', file_hash: 'a'.repeat(64),
  filename: 'film.mov', file_size: 150000000, mime_type: 'video/quicktime', source_locale: 'en',
  object_path: null, media_url: null, cf_video_uid: 'old', upload_url: 'old-url', moment_id: null, received_at: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.details.mockResolvedValue({ status: { state: 'pendingupload' } });
  mocks.create.mockResolvedValue({ uid: 'new', uploadURL: 'new-url' });
  mocks.remove.mockResolvedValue(undefined);
  mocks.updated.mockResolvedValue({ data: { ...upload, cf_video_uid: 'new', upload_url: 'new-url' }, error: null });
  mocks.rpc.mockResolvedValue({ data: { id: upload.id, status: 'published', momentId: 'moment' }, error: null });
});
describe('video reservation recovery', () => {
  it('resumes a still-valid reservation without creating another video', async () => {
    expect(await prepareDestination(upload)).toEqual({ id: 'upload', status: 'waiting', uploadUrl: 'old-url' });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('renews an expired reservation even before the client can HEAD its old URL', async () => {
    mocks.details.mockRejectedValue(new Error('Cloudflare API error: Video not found'));
    expect(await prepareDestination(upload)).toMatchObject({ status: 'waiting', uploadUrl: 'new-url' });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledWith('old');
  });
  it('does not discard resumable bytes during a provider outage', async () => {
    mocks.details.mockRejectedValue(new Error('Service unavailable'));
    await expect(prepareDestination(upload)).rejects.toThrow('Service unavailable');
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('does not recreate an already published missing video behind the user’s back', async () => {
    mocks.details.mockRejectedValue(new Error('Video not found'));
    await expect(prepareDestination({ ...upload, received_at: '2026-10-24', moment_id: 'moment' })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('never publishes before Stream has received the file', async () => {
    expect((await reconcileUpload(upload)).status).toBe('waiting');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reconciles a finished video instead of reuploading it after a lost response', async () => {
    mocks.details.mockResolvedValue({ status: { state: 'ready' }, playback: { hls: 'playback' }, thumbnail: 'cover', duration: 3 });
    expect(await prepareDestination(upload)).toMatchObject({ status: 'published', momentId: 'moment' });
    expect(mocks.rpc).toHaveBeenCalledWith('complete_verified_moment_upload', expect.objectContaining({ p_video_ready: true, p_upload_id: 'upload' }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), visible: vi.fn(), owned: vi.fn(), prepare: vi.fn(), reconcile: vi.fn(), reserve: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.visible }) }) }) }) }));
vi.mock('@/lib/uploads/server', () => {
  return { ownedUpload: mocks.owned, prepareDestination: mocks.prepare, reconcileUpload: mocks.reconcile,
    uploadAdmin: () => ({ rpc: mocks.reserve }),
    UploadApiError: class extends Error { constructor(message: string, public status = 400) { super(message); } } };
});
import { POST } from './route';
import { UploadApiError } from '@/lib/uploads/server';
const id = '11111111-1111-4111-8111-111111111111';
const body = { action: 'prepare', id, batchId: id, eventId: id, name: 'IMG_1.MOV', size: 150 * 1024 * 1024,
  mime: 'video/quicktime', hash: 'a'.repeat(64) };
const request = (payload: unknown) => POST(new Request('https://dalat.app/api/moments/uploads', { method: 'POST', body: JSON.stringify(payload) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ data: { user: { id: 'real-user' } } });
  mocks.visible.mockResolvedValue({ data: { id }, error: null });
  mocks.reserve.mockResolvedValue({ data: { upload: { id }, created: true }, error: null });
  mocks.prepare.mockResolvedValue({ id, status: 'waiting', uploadUrl: 'https://uploads.example/one-time' });
  mocks.owned.mockResolvedValue({ id }); mocks.reconcile.mockResolvedValue({ id, status: 'published', momentId: 'moment' });
});
describe('durable upload API boundary', () => {
  it('requires sign-in before creating storage sessions', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await request(body)).status).toBe(401); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('uses the authenticated owner and never a supplied userId', async () => {
    expect((await request({ ...body, userId: 'victim' })).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith('reserve_moment_upload', expect.objectContaining({ p_user_id: 'real-user', p_request: expect.objectContaining({ eventId: id }) }));
  });
  it('reserves the original hash and capture time before the transfer', async () => {
    const capturedAt = '2026-10-23T12:30:00+07:00';
    await request({ ...body, capturedAt });
    expect(mocks.reserve).toHaveBeenCalledWith('reserve_moment_upload', expect.objectContaining({ p_request: expect.objectContaining({ hash: body.hash, capturedAt }) }));
  });
  it.each([
    { mime: 'text/html' }, { mime: 'image/svg+xml', name: 'disguised.jpg' },
    { size: 501 * 1024 * 1024 }, { mime: 'image/jpeg', name: 'photo.jpg', size: 51 * 1024 * 1024 },
    { hash: 'filename-not-a-hash' }, { id: 'not-a-uuid' },
  ])('rejects an invalid or oversized upload: %j', async patch => {
    expect((await request({ ...body, ...patch })).status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('refuses an event where the user cannot post', async () => {
    mocks.reserve.mockResolvedValue({ data: null, error: { message: 'not_allowed_to_post' } });
    expect((await request(body)).status).toBe(403); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('does not use the service key to bypass a private event’s visibility', async () => {
    mocks.visible.mockResolvedValue({ data: null, error: null });
    expect((await request(body)).status).toBe(404);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('reconciles completion through the owned server record', async () => {
    const response = await request({ action: 'complete', id, mediaUrl: 'https://evil.example/file.jpg' });
    expect(response.status).toBe(200); expect(mocks.owned).toHaveBeenCalledWith(id, 'real-user');
    expect(mocks.reconcile).toHaveBeenCalledWith({ id });
  });
  it('does not disclose or finish another user’s receipt', async () => {
    mocks.owned.mockRejectedValue(new UploadApiError('Upload not found', 404));
    expect((await request({ action: 'complete', id })).status).toBe(404); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});

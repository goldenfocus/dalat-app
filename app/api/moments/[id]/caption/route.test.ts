import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), owned: vi.fn(), update: vi.fn(), saved: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth }, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.owned }) }) }) }) }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ update: mocks.update }) }) }));
import { PATCH } from './route';
const call = (body = { text: 'A lovely evening', locale: 'en' }) => PATCH(new Request('https://dalat.app', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'moment' }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ data: { user: { id: 'owner' } } });
  mocks.owned.mockResolvedValue({ data: { id: 'moment' }, error: null });
  mocks.saved.mockResolvedValue({ data: { id: 'moment', text_content: 'A lovely evening' }, error: null });
  mocks.update.mockReturnValue({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: mocks.saved }) }) }) });
});
describe('optional captions after upload', () => {
  it('saves an owner’s caption without changing publication or media fields', async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ text_content: 'A lovely evening', source_locale: 'en' });
  });
  it('never reaches the service write for someone else’s moment', async () => {
    mocks.owned.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(404); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated edits and oversized captions', async () => {
    expect((await call({ text: 'a'.repeat(501), locale: 'en' })).status).toBe(400);
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401); expect(mocks.update).not.toHaveBeenCalled();
  });
});

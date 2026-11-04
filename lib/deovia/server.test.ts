// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { safePath, readIdentity } from './policy';
const mocks = vi.hoisted(() => ({ client: vi.fn(), session: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }));
import { authorized, bind, eligible, provision, signIn } from './server';
const source = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@example.invalid', name: 'QA', avatar: null };
const target = '00000000-0000-4000-8000-000000000002';
function dbFixture(link: string | null = null) {
  const read = vi.fn().mockResolvedValue({ data: link ? { local_user_id: link } : null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: read, insert: vi.fn().mockResolvedValue({ error: null }) };
  const db = { from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue({ data: null }), auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { id: target } } }), getUserById: vi.fn(), generateLink: vi.fn() } } };
  mocks.client.mockReturnValue(db); return { db, query, read };
}
beforeEach(() => { vi.stubEnv('DEOVIA_ACCOUNTS_ENABLED', '1'); vi.stubEnv('DEOVIA_ACCOUNTS_SECRET', 'x'.repeat(64)); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('Deovia account safety', () => {
  it('rejects external, protocol-relative, backslash, control-character and loop return paths', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil', '/auth/deovia/start']) expect(safePath(path)).toBe('/');
    expect(safePath('/meet?event=one#details')).toBe('/meet?event=one#details');
  });
  it('ignores roles and unsafe avatar URLs in peer identity', () => {
    expect(readIdentity({ ...source, is_admin: true, avatar: 'javascript:alert(1)' })).toEqual(source);
    expect(readIdentity({ ...source, id: 'bad' })).toBeNull();
  });
  it('requires a configured peer secret, not user cookies', () => {
    expect(authorized(new Request('https://dalat.app', { headers: { cookie: 'admin=true' } }))).toBe(false);
    expect(authorized(new Request('https://dalat.app', { headers: { authorization: `Bearer ${'x'.repeat(64)}` } }))).toBe(true);
    vi.stubEnv('DEOVIA_ACCOUNTS_ENABLED', '0');
    expect(authorized(new Request('https://dalat.app', { headers: { authorization: `Bearer ${'x'.repeat(64)}` } }))).toBe(false);
  });
  it('rejects unverified, anonymous, banned and MFA accounts', () => {
    const user = { email: source.email, email_confirmed_at: '2026-01-01', factors: [] } as unknown as User;
    expect(eligible(user)).toBe(true);
    expect(eligible({ ...user, email_confirmed_at: undefined })).toBe(false);
    expect(eligible({ ...user, is_anonymous: true })).toBe(false);
    expect(eligible({ ...user, factors: [{ status: 'verified' }] } as User)).toBe(false);
    expect(eligible({ ...user, banned_until: '2099-01-01' } as User)).toBe(false);
  });
  it('uses an established identity link even after email changes', async () => {
    const { db } = dbFixture(target);
    expect(await provision(source)).toEqual({ id: target });
    expect(db.rpc).not.toHaveBeenCalled(); expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('never merges an existing account just because its email matches', async () => {
    const { db } = dbFixture(); db.rpc.mockResolvedValue({ data: target });
    db.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: target, app_metadata: {} } } });
    expect(await provision(source)).toEqual({ linkRequired: true });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('creates a regular profile without copying privileges or passwords', async () => {
    const { db } = dbFixture();
    expect(await provision(source)).toEqual({ id: target });
    const input = db.auth.admin.createUser.mock.calls[0][0];
    expect(input.email_confirm).toBe(true); expect(input.password).toHaveLength(64);
    expect(input.user_metadata).toEqual({ full_name: 'QA', avatar_url: null });
    expect(input.app_metadata).toEqual({ deovia_peer_id: source.id, deovia_peer_app: 'ezviet' });
  });
  it('recovers only server-marked interrupted provisioning', async () => {
    const { db } = dbFixture(); db.rpc.mockResolvedValue({ data: target });
    db.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: target, app_metadata: { deovia_peer_id: source.id } } } });
    expect(await provision(source)).toEqual({ id: target });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('never overwrites a peer mapped to another person', async () => {
    const { query } = dbFixture(target);
    await expect(bind(source.id, source.id)).rejects.toThrow('already connected');
    expect(query.insert).not.toHaveBeenCalled();
  });
  it('rejects a local token issued for a different account', async () => {
    const { db } = dbFixture();
    db.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: source.email, email_confirmed_at: '2026-01-01' } } });
    db.auth.admin.generateLink.mockResolvedValue({ data: { user: { id: 'wrong' }, properties: { hashed_token: 'secret' } } });
    await expect(signIn(target)).rejects.toThrow('Local sign-in required');
    expect(mocks.session).not.toHaveBeenCalled();
  });
});

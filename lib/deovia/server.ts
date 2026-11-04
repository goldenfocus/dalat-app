import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { APP } from './app';
import { origins, type PeerIdentity } from './policy';
export const PEER = ({ ezviet: 'dalat', dalat: 'ezviet' } as const)[APP];
export const origin = origins[APP];
export const peerOrigin = origins[PEER];
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function enabled() { return process.env.DEOVIA_ACCOUNTS_ENABLED === '1' && (process.env.DEOVIA_ACCOUNTS_SECRET?.length ?? 0) >= 64; }
export function authorized(request: Request) {
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${process.env.DEOVIA_ACCOUNTS_SECRET || ''}`);
  return enabled() && actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function eligible(user: User | null): user is User {
  const bannedUntil = user && (user as User & { banned_until?: string }).banned_until;
  return !!user?.email && !!user.email_confirmed_at && !user.is_anonymous &&
    !(user.factors || []).some(f => f.status === 'verified') &&
    !(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
}
export async function currentIdentity(): Promise<PeerIdentity | null> {
  const jar = await cookies();
  if (jar.getAll().some(cookie => /impersonat|god.mode/i.test(cookie.name))) return null;
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return null;
  const { data: fresh, error } = await admin().auth.admin.getUserById(user.id);
  if (error || !eligible(fresh.user)) return null;
  const { data: profile } = await session.from('profiles').select('display_name,avatar_url,is_ghost').eq('id', user.id).maybeSingle();
  if (profile?.is_ghost) return null;
  return { id: user.id, email: fresh.user.email!.toLowerCase(), name: profile?.display_name || null, avatar: profile?.avatar_url || null };
}
export async function peerCall(action: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${peerOrigin}/api/deovia/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEOVIA_ACCOUNTS_SECRET}` },
    body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Peer unavailable');
  return await response.json() as Record<string, unknown>;
}
export async function bind(localId: string, peerId: string) {
  const db = admin();
  const { data: existing, error: readError } = await db.from('deovia_account_links').select('local_user_id').eq('peer_user_id', peerId).maybeSingle();
  if (readError) throw new Error('Link unavailable');
  if (existing) {
    if (existing.local_user_id !== localId) throw new Error('Account already connected');
    return;
  }
  const { error } = await db.from('deovia_account_links').insert({ peer_user_id: peerId, local_user_id: localId });
  if (error) {
    const { data } = await db.from('deovia_account_links').select('local_user_id').eq('peer_user_id', peerId).maybeSingle();
    if (data?.local_user_id !== localId) throw new Error('Account already connected');
  }
}
export async function provision(identity: PeerIdentity): Promise<{ id?: string; linkRequired?: true }> {
  const db = admin();
  const { data: link, error } = await db.from('deovia_account_links').select('local_user_id').eq('peer_user_id', identity.id).maybeSingle();
  if (error) throw new Error('Link unavailable');
  if (link) return { id: link.local_user_id };
  const { data: existingId, error: lookupError } = await db.rpc('deovia_user_by_email', { p_email: identity.email });
  if (lookupError) throw new Error('Lookup unavailable');
  if (existingId) {
    const { data } = await db.auth.admin.getUserById(existingId);
    // Only recover our own interrupted provisioning; never match existing people by email.
    if (data.user?.app_metadata?.deovia_peer_id !== identity.id) return { linkRequired: true };
    await bind(existingId, identity.id);
    return { id: existingId };
  }
  const created = await db.auth.admin.createUser({
    email: identity.email, email_confirm: true, password: randomToken(),
    app_metadata: { deovia_peer_id: identity.id, deovia_peer_app: PEER },
    user_metadata: { full_name: identity.name, avatar_url: identity.avatar },
  });
  if (created.error || !created.data.user) throw new Error('Provisioning unavailable');
  await bind(created.data.user.id, identity.id);
  return { id: created.data.user.id };
}
export async function signIn(localId: string) {
  const db = admin();
  const { data: { user }, error } = await db.auth.admin.getUserById(localId);
  if (error || !eligible(user)) throw new Error('Local sign-in required');
  const { data: profile } = await db.from('profiles').select('is_ghost').eq('id', localId).maybeSingle();
  if (profile?.is_ghost) throw new Error('Local sign-in required');
  const { data, error: linkError } = await db.auth.admin.generateLink({ type: 'magiclink', email: user.email! });
  if (linkError || data.user.id !== localId) throw new Error('Local sign-in required');
  const session = await createClient();
  const { data: verified, error: verifyError } = await session.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (verifyError || verified.user?.id !== localId) throw new Error('Local sign-in required');
}

export async function peerReady(): Promise<boolean> {
  try {
    const response = await fetch(`${peerOrigin}/api/deovia/status`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000) });
    return response.ok && (await response.json()).available === true;
  } catch { return false; }
}

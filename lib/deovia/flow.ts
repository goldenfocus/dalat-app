import { cookies } from 'next/headers';
import { admin, currentIdentity, enabled, hash, origin, peerOrigin, peerCall, provision, randomToken, signIn, peerReady } from './server';
import { redirect, setCookie } from './http';
import { safePath, readIdentity, tokenPattern } from './policy';
import { loginPath, landingPath } from './app';
const flowCookie = '__Host-deovia_flow';
export async function start(request: Request) {
  const url = new URL(request.url); const next = safePath(url.searchParams.get('next'));
  if (!enabled() || !await peerReady()) return redirect(next);
  const state = randomToken(); const verifier = randomToken();
  await setCookie(flowCookie, JSON.stringify({ state, verifier, next, mode: url.searchParams.get('mode') === 'link' ? 'link' : 'auto' }));
  const target = new URL('/auth/deovia/authorize', peerOrigin);
  target.searchParams.set('state', state); target.searchParams.set('challenge', hash(verifier));
  if (url.searchParams.get('mode') === 'link') target.searchParams.set('interactive', '1');
  return redirect(target.toString());
}
export async function authorize(request: Request) {
  const url = new URL(request.url); const state = url.searchParams.get('state') || ''; const challenge = url.searchParams.get('challenge') || '';
  if (!tokenPattern.test(state) || !tokenPattern.test(challenge)) return redirect('/');
  const target = new URL('/auth/deovia/callback', peerOrigin); target.searchParams.set('state', state);
  if (!enabled()) { target.searchParams.set('error', 'unavailable'); return redirect(target.toString()); }
  try {
    const identity = await currentIdentity();
    if (!identity) {
      if (url.searchParams.get('interactive') === '1') return redirect(loginPath(url.pathname + url.search));
      target.searchParams.set('error', 'login_required'); return redirect(target.toString());
    }
    const code = randomToken();
    const { error } = await admin().from('deovia_auth_grants').insert({ code_hash: hash(code), challenge, user_id: identity.id });
    if (error) throw new Error('Grant unavailable');
    target.searchParams.set('code', code);
    return redirect(target.toString());
  } catch { target.searchParams.set('error', 'unavailable'); return redirect(target.toString()); }
}
export async function callback(request: Request) {
  const url = new URL(request.url); const jar = await cookies();
  const raw = jar.get(flowCookie)?.value;
  await setCookie(flowCookie, '', 0);
  await setCookie('__Host-deovia_checked', '1', 300);
  if (!enabled() || !raw) return redirect('/');
  let flow: { state: string; verifier: string; next: string; mode: string };
  try { flow = JSON.parse(raw); } catch { return redirect('/'); }
  const next = safePath(flow.next);
  if (flow.state !== url.searchParams.get('state') || !tokenPattern.test(flow.verifier)) return redirect('/');
  if (url.searchParams.has('error')) return redirect(next);
  const code = url.searchParams.get('code') || '';
  if (!tokenPattern.test(code)) return redirect(next);
  try {
    const exchanged = await peerCall('exchange', { code, verifier: flow.verifier });
    const identity = readIdentity(exchanged.identity);
    if (!identity) throw new Error('Invalid peer identity');
    const current = await currentIdentity();
    // Never silently replace an existing signed-in person's session.
    if (current && flow.mode !== 'link') return redirect(next);
    const result: { id?: string; linkRequired?: true } = current ? { linkRequired: true } : await provision(identity);
    if (result.linkRequired || !result.id) {
      const token = randomToken();
      const { error } = await admin().from('deovia_pending_links').insert({ token_hash: hash(token), peer_user_id: identity.id, next_path: next });
      if (error) throw new Error('Link unavailable');
      await setCookie('__Host-deovia_link', token);
      return redirect('/auth/deovia/link');
    }
    await peerCall('bind', { localId: identity.id, peerId: result.id });
    await signIn(result.id);
    await setCookie('__Host-deovia_checked', '', 0);
    return redirect(await landingPath(result.id, next));
  } catch { return redirect(next); }
}
export async function pendingLink() {
  const token = (await cookies()).get('__Host-deovia_link')?.value;
  if (!enabled() || !token || !tokenPattern.test(token)) return null;
  const { data, error } = await admin().from('deovia_pending_links').select('peer_user_id,next_path').eq('token_hash', hash(token)).gt('expires_at', new Date().toISOString()).maybeSingle();
  return error || !data ? null : { ...data, token };
}
export async function confirm(request: Request) {
  // This handles a form POST, so every exit must be a 303 (see redirect()).
  const seeOther = (path: string) => redirect(path, 303);
  if (request.headers.get('origin') !== origin) return seeOther('/');
  const pending = await pendingLink();
  const identity = await currentIdentity();
  if (!pending || !identity) return seeOther(loginPath('/auth/deovia/link'));
  const form = await request.formData();
  if (form.get('token') !== pending.token) return seeOther('/auth/deovia/link');
  try {
    // Explicit consent plus authentication of both accounts authorizes replacing
    // previous connections. No profiles, auth users or learning/event data move.
    await peerCall('reconnect', { localId: pending.peer_user_id, peerId: identity.id });
    const { error } = await admin().rpc('deovia_reconnect', { p_local_id: identity.id, p_peer_id: pending.peer_user_id });
    if (error) throw new Error('Reconnect unavailable');
    await admin().from('deovia_pending_links').delete().eq('token_hash', hash(pending.token));
    await setCookie('__Host-deovia_link', '', 0);
    return seeOther(pending.next_path);
  } catch { return seeOther('/auth/deovia/link?error=conflict'); }
}

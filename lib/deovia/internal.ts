import { admin, authorized, bind, currentIdentity, hash, provision, peerCall, enabled } from './server';
import { limitedBody, reply, sameOrigin } from './http';
import { readIdentity, tokenPattern, uuidPattern } from './policy';
export async function internal(request: Request, action: string) {
  if (!authorized(request)) return reply({ error: 'Unavailable' }, 404);
  try {
    const body = await limitedBody(request);
    if (action === 'provision') {
      const identity = readIdentity(body.identity);
      if (!identity) return reply({ error: 'Invalid request' }, 400);
      return reply(await provision(identity));
    }
    if (action === 'bind' || action === 'reconnect') {
      if (typeof body.localId !== 'string' || typeof body.peerId !== 'string' || !uuidPattern.test(body.localId) || !uuidPattern.test(body.peerId)) return reply({ error: 'Invalid request' }, 400);
      const { data } = await admin().auth.admin.getUserById(body.localId);
      if (!data.user) return reply({ error: 'Invalid account' }, 400);
      if (action === 'reconnect') {
        const { eligible } = await import('./server');
        if (!eligible(data.user)) return reply({ error: 'Local sign-in required' }, 403);
        const { error } = await admin().rpc('deovia_reconnect', { p_local_id: body.localId, p_peer_id: body.peerId });
        if (error) throw new Error('Reconnect unavailable');
      } else await bind(body.localId, body.peerId);
      return reply({ ok: true });
    }
    if (action === 'exchange') {
      if (typeof body.code !== 'string' || typeof body.verifier !== 'string' || !tokenPattern.test(body.code) || !tokenPattern.test(body.verifier)) return reply({ error: 'Invalid request' }, 400);
      const db = admin();
      const { data, error } = await db.rpc('deovia_consume_grant', { p_hash: hash(body.code), p_challenge: hash(body.verifier) });
      if (error || !data) return reply({ error: 'Expired sign-in' }, 400);
      const { data: fresh } = await db.auth.admin.getUserById(data);
      const { eligible } = await import('./server');
      if (!eligible(fresh.user)) return reply({ error: 'Local sign-in required' }, 403);
      const { data: profile } = await db.from('profiles').select('display_name,avatar_url,is_ghost').eq('id', data).maybeSingle();
      if (profile?.is_ghost) return reply({ error: 'Local sign-in required' }, 403);
      return reply({ identity: { id: data, email: fresh.user.email, name: profile?.display_name || null, avatar: profile?.avatar_url || null } });
    }
    return reply({ error: 'Not found' }, 404);
  } catch { return reply({ error: 'Please try again' }, 503); }
}
export async function sync(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  if (!enabled()) return reply({ enabled: false });
  try {
    const identity = await currentIdentity();
    if (!identity) return reply({ error: 'Sign-in required' }, 401);
    const { data: existing } = await admin().from('deovia_account_links').select('peer_user_id').eq('local_user_id', identity.id).maybeSingle();
    if (existing) return reply({ connected: true });
    const result = await peerCall('provision', { identity });
    if (typeof result.id === 'string' && uuidPattern.test(result.id)) {
      await bind(identity.id, result.id);
      return reply({ connected: true });
    }
    return reply({ connected: false, linkRequired: true });
  } catch { return reply({ error: 'Please try again' }, 503); }
}

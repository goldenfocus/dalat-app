// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ jar: new Map<string,string>(), identity: null as unknown, peerReady: vi.fn(), peerCall: vi.fn(), provision: vi.fn(), signIn: vi.fn(), bind: vi.fn(), insert: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key:string) => state.jar.has(key) ? { value: state.jar.get(key) } : undefined }) }));
vi.mock('./server', () => ({
  origin: 'https://dalat.app', peerOrigin: 'https://ezviet.org', enabled: () => true, peerReady: state.peerReady,
  hash: (x:string) => 'hashed-'+x, randomToken: () => 'a'.repeat(64),
  currentIdentity: async () => state.identity, peerCall: state.peerCall, provision: state.provision,
  signIn: state.signIn, bind: state.bind,
  admin: () => ({ from: () => ({ insert: state.insert }) }),
}));
vi.mock('./http', () => ({
  redirect: (path:string, status = 307) => new Response(null, { status, headers: { location: new URL(path,'https://dalat.app').toString() } }),
  setCookie: async (name:string,value:string) => { state.jar.set(name,value); },
}));
import { start, authorize, callback, confirm } from './flow';
const identity = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@example.invalid', name: null, avatar: null };
beforeEach(() => { vi.clearAllMocks(); state.jar.clear(); state.peerReady.mockResolvedValue(true); state.identity=null; state.insert.mockResolvedValue({ error:null }); });
describe('browser-bound account handoff', () => {
  it('stays on the local page until the peer deployment is ready', async () => {
    state.peerReady.mockResolvedValue(false);
    const response = await start(new Request('https://dalat.app/auth/deovia/start?next=/meet'));
    expect(response.headers.get('location')).toBe('https://dalat.app/meet');
    expect(state.jar.size).toBe(0);
  });
  it('binds each start to a state and verifier while ignoring external return URLs', async () => {
    const response=await start(new Request('https://dalat.app/auth/deovia/start?next=//evil.example'));
    const target=new URL(response.headers.get('location')!);
    expect(target.origin).toBe('https://ezviet.org'); expect(target.pathname).toBe('/auth/deovia/authorize');
    const flow=JSON.parse(state.jar.get('__Host-deovia_flow')!);
    expect(flow.next).toBe('/'); expect(target.searchParams.get('state')).toBe(flow.state);
    expect(target.searchParams.get('challenge')).toBe('hashed-'+flow.verifier);
  });
  it('returns an anonymous automatic probe without forcing login', async () => {
    const r=await authorize(new Request(`https://dalat.app/auth/deovia/authorize?state=${'a'.repeat(64)}&challenge=${'b'.repeat(64)}`));
    expect(r.headers.get('location')).toContain('error=login_required'); expect(state.insert).not.toHaveBeenCalled();
  });
  it('offers normal login after an explicit peer-account action', async () => {
    const r=await authorize(new Request(`https://dalat.app/auth/deovia/authorize?interactive=1&state=${'a'.repeat(64)}&challenge=${'b'.repeat(64)}`));
    expect(r.headers.get('location')).toContain('/auth/login?next='); expect(state.insert).not.toHaveBeenCalled();
  });
  it('never accepts a callback without the target browser binding', async () => {
    await callback(new Request(`https://dalat.app/auth/deovia/callback?code=${'b'.repeat(64)}&state=${'a'.repeat(64)}`));
    expect(state.peerCall).not.toHaveBeenCalled(); expect(state.signIn).not.toHaveBeenCalled();
  });
  it('rejects callback state substitution before talking to the peer', async () => {
    state.jar.set('__Host-deovia_flow',JSON.stringify({state:'a'.repeat(64),verifier:'c'.repeat(64),next:'/meet'}));
    await callback(new Request(`https://dalat.app/auth/deovia/callback?code=${'b'.repeat(64)}&state=${'d'.repeat(64)}`));
    expect(state.peerCall).not.toHaveBeenCalled();
  });
  it('never silently replaces an existing signed-in account', async () => {
    state.identity=identity;
    state.jar.set('__Host-deovia_flow',JSON.stringify({state:'a'.repeat(64),verifier:'c'.repeat(64),next:'/meet',mode:'auto'}));
    state.peerCall.mockResolvedValue({identity});
    const r=await callback(new Request(`https://dalat.app/auth/deovia/callback?code=${'b'.repeat(64)}&state=${'a'.repeat(64)}`));
    expect(r.headers.get('location')).toBe('https://dalat.app/meet'); expect(state.provision).not.toHaveBeenCalled(); expect(state.signIn).not.toHaveBeenCalled();
  });
  it('requires confirmation for a collision, without minting a local session', async () => {
    state.jar.set('__Host-deovia_flow',JSON.stringify({state:'a'.repeat(64),verifier:'c'.repeat(64),next:'/events/test',mode:'auto'}));
    state.peerCall.mockResolvedValue({identity}); state.provision.mockResolvedValue({linkRequired:true});
    const r=await callback(new Request(`https://dalat.app/auth/deovia/callback?code=${'b'.repeat(64)}&state=${'a'.repeat(64)}`));
    expect(r.headers.get('location')).toBe('https://dalat.app/auth/deovia/link'); expect(state.signIn).not.toHaveBeenCalled();
    expect(state.jar.has('__Host-deovia_link')).toBe(true);
  });
  it('rejects a cross-site confirmation without touching identity links', async () => {
    await confirm(new Request('https://dalat.app/api/deovia/confirm',{method:'POST',headers:{origin:'https://evil.example'}}));
    expect(state.bind).not.toHaveBeenCalled();
  });
  it('answers the confirmation form POST with 303, so the browser follows with GET', async () => {
    // A 307 would re-send the POST to the destination page, which answers 405.
    const rejected = await confirm(new Request('https://dalat.app/api/deovia/confirm',{method:'POST',headers:{origin:'https://evil.example'}}));
    expect(rejected.status).toBe(303);
    const signedOut = await confirm(new Request('https://dalat.app/api/deovia/confirm',{method:'POST',headers:{origin:'https://dalat.app'}}));
    expect(signedOut.status).toBe(303);
    expect(signedOut.headers.get('location')).toContain('/auth/login');
  });
  it('keeps method-preserving 307 redirects for the GET hand-offs', async () => {
    state.peerReady.mockResolvedValue(false);
    const response = await start(new Request('https://dalat.app/auth/deovia/start?next=/meet'));
    expect(response.status).toBe(307);
  });
});

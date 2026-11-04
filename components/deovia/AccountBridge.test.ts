// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cleanup: undefined as (()=>void)|undefined, getUser: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('react',()=>({useEffect:(effect:()=>()=>void)=>{state.cleanup=effect();}}));
vi.mock('next/navigation',()=>({usePathname:()=>'/meet'}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{getUser:state.getUser,onAuthStateChange:()=>({data:{subscription:{unsubscribe:state.unsubscribe}}})}})}));
import { AccountBridge } from './AccountBridge';
let doc: EventTarget;
let win: EventTarget;
let loc: {pathname:string;search:string;hash:string;replace:ReturnType<typeof vi.fn>};
let finish: (value:unknown)=>void;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
beforeEach(()=>{
  const saved=new Map<string,string>();doc=new EventTarget();win=new EventTarget();
  loc={pathname:'/meet',search:'',hash:'',replace:vi.fn()};
  Object.defineProperty(doc,'cookie',{value:'',writable:true});
  vi.stubGlobal('document',doc);vi.stubGlobal('window',win);vi.stubGlobal('location',loc);
  vi.stubGlobal('sessionStorage',{getItem:(k:string)=>saved.get(k),setItem:(k:string,v:string)=>saved.set(k,v)});
  state.getUser.mockResolvedValue({data:{user:null}});
  vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
});
afterEach(()=>{state.cleanup?.();vi.unstubAllGlobals();vi.clearAllMocks();});
it('discovers an existing peer session while an untouched page remains current',async()=>{
  AccountBridge();await flush();finish({ok:true,json:async()=>({enabled:true})});await flush();
  expect(loc.replace).toHaveBeenCalledWith('/auth/deovia/start?next=%2Fmeet');
});
it('never hijacks navigation after a pointer interaction',async()=>{
  AccountBridge();await flush();doc.dispatchEvent(new Event('pointerdown'));
  finish({ok:true,json:async()=>({enabled:true})});await flush();expect(loc.replace).not.toHaveBeenCalled();
});
it('never redirects an unloading document',async()=>{
  AccountBridge();await flush();win.dispatchEvent(new Event('beforeunload'));
  finish({ok:true,json:async()=>({enabled:true})});await flush();expect(loc.replace).not.toHaveBeenCalled();
});
it('rechecks the current path after the asynchronous status body',async()=>{
  AccountBridge();await flush();let parsed:(v:unknown)=>void=()=>{};
  finish({ok:true,json:()=>new Promise(resolve=>{parsed=resolve;})});await flush();
  loc.pathname='/login';parsed({enabled:true});await flush();expect(loc.replace).not.toHaveBeenCalled();
});

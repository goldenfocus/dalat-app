// @vitest-environment node
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ send: vi.fn(async () => ({sent: 2, failed: 0})), user: {id:'my-account',email:'private@example.com'} as {id:string;email:string}|null }));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>({select:()=>({eq:async()=>({data:[],error:null})})})})}));
vi.mock('@/lib/web-push',()=>({sendPushToUser:state.send}));
import {POST} from './route';
it('uses the authenticated account and returns counts without diagnostics',async()=>{
 const res=await POST(new Request('https://dalat.app/api/test-push',{method:'POST',headers:{origin:'https://dalat.app'}}));
 expect(await res.json()).toEqual({result:{sent:2,failed:0}});
 expect(state.send).toHaveBeenCalledWith('my-account',expect.objectContaining({tag:'test-push'}));
 expect(res.headers.get('cache-control')).toContain('no-store');
});
it('rejects a cross-origin trigger',async()=>{
 const res=await POST(new Request('https://dalat.app/api/test-push',{method:'POST',headers:{origin:'https://other.example'}}));
 expect(res.status).toBe(403);
});

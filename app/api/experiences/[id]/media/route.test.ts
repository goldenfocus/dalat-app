import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({owner:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/experiences/server',()=>({ownerExperience:mocks.owner,experienceAdmin:mocks.admin,safeMutation:()=>true,bucket:'experience-originals'}));
import { POST } from './route';
const mediaId='00000000-0000-4000-8000-000000000001';
beforeEach(()=>mocks.owner.mockResolvedValue({user:{id:'owner'},experience:{status:'draft'}}));
describe('immutable media registration',()=>{
 for(const [existing,status] of [['other-draft',403],['own-draft',200]] as const){
 it(existing==='other-draft'?'cannot reassign an existing media ID to another draft':'retries its own registration without rewriting the original',async()=>{
 const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{experience_id:existing}})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
 const from=vi.fn().mockReturnValue(query);mocks.admin.mockReturnValue({from});
 const response=await POST(new Request('https://dalat.app/api/experiences/own-draft/media',{method:'POST',body:JSON.stringify({id:mediaId,mime:'image/jpeg',kind:'photo'})}),{params:Promise.resolve({id:'own-draft'})});
 expect(response.status).toBe(status);expect(from).toHaveBeenCalledOnce();
 });}
});

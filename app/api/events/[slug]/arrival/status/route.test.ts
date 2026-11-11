// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({user:vi.fn(), event:vi.fn(), token:vi.fn(), admin:vi.fn(), results:[] as unknown[], filters:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mock.user},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:mock.event};return q;}})}));
vi.mock("@/lib/arrival/server",()=>({guestToken:mock.token, tokenHash:()=>"hashed-cookie", arrivalAdmin:mock.admin}));
import { GET } from "./route";
const params={params:Promise.resolve({slug:"exchange"})};
beforeEach(()=>{
 vi.clearAllMocks();mock.results=[];mock.user.mockResolvedValue({data:{user:{id:"session-user"}}});mock.token.mockResolvedValue(null);mock.event.mockResolvedValue({data:{id:"event"},error:null});
 mock.admin.mockImplementation(()=>({from:(table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{mock.filters(table,...args);return q;},not:()=>q,maybeSingle:async()=>({data:mock.results.shift()??null,error:null})};return q;}}));
});
it("uses only the signed-in account and disables CDN caching",async()=>{
 mock.results=[{id:"saved-arrival"}];
 const response=await GET(new Request("https://dalat.app/api/events/exchange/arrival/status?userId=someone-else"),params);
 expect(await response.json()).toEqual({checkedIn:true});expect(mock.filters).toHaveBeenCalledWith("event_arrival_participants","user_id","session-user");
 expect(response.headers.get("cache-control")).toContain("private, no-store");expect(response.headers.get("cdn-cache-control")).toBe("no-store");
});
it("recognizes the anonymous browser's existing receipt without exposing it",async()=>{
 mock.user.mockResolvedValue({data:{user:null}});mock.token.mockResolvedValue("cookie");mock.results=[{id:"private-arrival"}];
 expect(await (await GET(new Request("https://dalat.app"),params)).json()).toEqual({checkedIn:true});expect(mock.filters).toHaveBeenCalledWith("event_arrival_participants","token_hash","hashed-cookie");
});
it("recognizes a legacy RSVP check-in",async()=>{
 mock.results=[null,{id:"legacy-rsvp"}];expect(await (await GET(new Request("https://dalat.app"),params)).json()).toEqual({checkedIn:true});
});
it("does not query privileged records for a new anonymous browser or a private event",async()=>{
 mock.user.mockResolvedValue({data:{user:null}});expect(await (await GET(new Request("https://dalat.app"),params)).json()).toEqual({checkedIn:false});expect(mock.admin).not.toHaveBeenCalled();
 mock.event.mockResolvedValue({data:{id:"event",tribe_id:"private",tribe_visibility:"private"}});expect((await GET(new Request("https://dalat.app"),params)).status).toBe(404);
});

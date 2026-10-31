// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {deliverFollowup,followupSendTime,allowsFollowup,type FollowupDelivery} from './event-followup';
vi.mock('./event-followup-template',()=>({followupLocale:(v:string)=>v||'en',buildEventFollowup:vi.fn(async()=>({subject:'Thanks',html:'<p>Thanks</p>',text:'Thanks'}))}));
const now=new Date('2026-11-05T03:00:00Z');
let rows:Record<string,Record<string,unknown>[]>;
let send=vi.fn<Parameters<typeof deliverFollowup>[3]>();
let saved:Record<string,unknown>[];
const job=():FollowupDelivery=>({event_id:'event',user_id:'user',lease_token:'lease',first_attempt_at:now.toISOString(),payload:null});
function database(){
 return {auth:{admin:{getUserById:async()=>({data:{user:{email:'attendee@example.com',email_confirmed_at:'2026-01-01'}},error:null})}},from(table:string){
  const filters:Record<string,unknown>={};const after:Record<string,string>={};let publicOnly=false;let max=Infinity;let update:Record<string,unknown>|undefined;
  const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},gt:(k:string,v:string)=>{after[k]=v;return q;},or:()=>{publicOnly=true;return q;},order:()=>q,limit:(n:number)=>{max=n;return q;},update:(v:Record<string,unknown>)=>{update=v;return q;},maybeSingle:()=>q,
    then:(resolve:(v:unknown)=>unknown)=>{
      if(update){saved.push(update);return resolve({data:[{event_id:'event'}],error:null});}
      const data=(rows[table]||[]).filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)&&Object.entries(after).every(([k,v])=>String(r[k])>v)&&(!publicOnly||!r.tribe_id||r.tribe_visibility==='public')).slice(0,max);
      return resolve({data:table==='events'&&!filters.id?data:data[0]||null,error:null});
    }};return q;
 }} as unknown as SupabaseClient;
}
beforeEach(()=>{vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test');saved=[];rows={events:[{id:'event',title:'Language Exchange',slug:'event',series_id:'series',starts_at:'2026-11-04T11:00:00Z',ends_at:'2026-11-04T13:00:00Z',status:'published'}],event_followup_settings:[{series_id:'series',enabled:true,enabled_after:'2026-10-31T00:00:00Z'}],profiles:[{id:'user',is_ghost:false,locale:'en'}],notification_preferences:[{user_id:'user',email_enabled:true}],rsvps:[{event_id:'event',user_id:'user',status:'going',checked_in_at:'2026-11-04',no_show_at:null}],event_arrival_participants:[]};send=vi.fn<Parameters<typeof deliverFollowup>[3]>().mockResolvedValue({data:{id:'provider-id'},error:null});});
describe('automatic post-event email',()=>{
 it('uses 9 AM in Vietnam on the following calendar day',()=>{expect(followupSendTime('2026-11-04T13:00:00Z')).toBe('2026-11-05T02:00:00.000Z');expect(followupSendTime('2026-12-31T18:00:00Z')).toBe('2027-01-02T02:00:00.000Z');});
 it('freezes the request before sending and records the provider receipt',async()=>{send.mockImplementation(async()=>{expect(saved[0]).toHaveProperty('payload');return {data:{id:'provider-id'},error:null};});expect(await deliverFollowup(database(),job(),now,send)).toBe('sent');expect(send.mock.calls[0][1]).toBe('event-followup/event/user');expect(saved.at(-1)).toMatchObject({status:'sent',provider_id:'provider-id'});});
 it.each(['optout','ghost','cancelled','no-show','rsvp-only'])('does not email %s attendees',async(reason)=>{if(reason==='optout')rows.notification_preferences[0].email_enabled=false;if(reason==='ghost')rows.profiles[0].is_ghost=true;if(reason==='cancelled')rows.rsvps[0].status='cancelled';if(reason==='no-show')rows.rsvps[0].no_show_at='date';if(reason==='rsvp-only')rows.rsvps[0].checked_in_at=null;expect(await deliverFollowup(database(),job(),now,send)).toBe('skipped');expect(send).not.toHaveBeenCalled();});
 it('accepts a signed-in arrival without a separate RSVP',async()=>{rows.rsvps=[];rows.event_arrival_participants=[{id:'arrival',event_id:'event',user_id:'user'}];expect(await deliverFollowup(database(),job(),now,send)).toBe('sent');});
 it('retries the exact frozen request with the same idempotency key',async()=>{send.mockRejectedValueOnce(new Error('response lost'));expect(await deliverFollowup(database(),job(),now,send)).toBe('pending');const frozen=saved[0].payload as FollowupDelivery['payload'];const retry={...job(),payload:frozen};expect(await deliverFollowup(database(),retry,now,send)).toBe('sent');expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);});
 it('holds a retry if a promoted event has changed',async()=>{rows.events.push({id:'next',title:'Next exchange',slug:'next',series_id:'series',starts_at:'2026-11-11T11:00:00Z',status:'published'});send.mockRejectedValueOnce(new Error('response lost'));await deliverFollowup(database(),job(),now,send);const frozen=saved[0].payload as FollowupDelivery['payload'];rows.events[1].status='cancelled';send.mockClear();expect(await deliverFollowup(database(),{...job(),payload:frozen},now,send)).toBe('review');expect(send).not.toHaveBeenCalled();});
 it('holds a retry if the source event has changed',async()=>{send.mockRejectedValueOnce(new Error('response lost'));await deliverFollowup(database(),job(),now,send);const frozen=saved[0].payload as FollowupDelivery['payload'];rows.events[0].title='Renamed exchange';send.mockClear();expect(await deliverFollowup(database(),{...job(),payload:frozen},now,send)).toBe('review');expect(send).not.toHaveBeenCalled();});
 it('holds uncertain sends after the provider deduplication window',async()=>{expect(await deliverFollowup(database(),{...job(),first_attempt_at:'2026-11-04T01:00:00Z'},now,send)).toBe('review');expect(send).not.toHaveBeenCalled();});
 it('honors per-email preferences',()=>{expect(allowsFollowup({channel_preferences:{post_event_followup:[]}})).toBe(false);expect(allowsFollowup(null)).toBe(true);});
});

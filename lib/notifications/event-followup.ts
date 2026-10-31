import 'server-only';
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildUnsubscribeUrl } from './unsubscribe';
import { buildEventFollowup, followupLocale, type FollowupEvent, type NextFollowupEvent } from './event-followup-template';

type SendPayload = { from:string;to:string;subject:string;html:string;text:string;headers:Record<string,string> };
type FrozenPayload = { request:SendPayload; upcoming:NextFollowupEvent[]; eventVersion:string };
export interface FollowupDelivery { event_id:string;user_id:string;lease_token:string;first_attempt_at:string;payload:FrozenPayload|null }
const must = <T>(result:{data:T;error:unknown}):T => { if(result.error)throw new Error('followup_database');return result.data; };
export const followupSendTime = (endsAt:string) => {
  const day = new Date(new Date(endsAt).getTime()+7*3600000).toISOString().slice(0,10);
  return new Date(Date.parse(`${day}T02:00:00Z`)+86400000).toISOString();
};
export function allowsFollowup(preferences:{email_enabled?:boolean;channel_preferences?:Record<string,string[]>}|null) {
  return preferences?.email_enabled !== false &&
    (!preferences?.channel_preferences?.post_event_followup || preferences.channel_preferences.post_event_followup.includes('email'));
}

export async function deliverFollowup(db:SupabaseClient, row:FollowupDelivery, now:Date,
  send:(request:SendPayload,key:string)=>Promise<{data:{id:string}|null;error:unknown}>) {
  const save = async (values:Record<string,unknown>) => {
    const result=await db.from('event_followup_deliveries').update(values).eq('event_id',row.event_id).eq('user_id',row.user_id).eq('lease_token',row.lease_token).select('event_id');
    if(result.error||!result.data?.length)throw new Error('followup_lease_lost');
  };
  const finish = async (status:string,reason?:string) => {
    await save({status,last_error:reason||null,lease_token:null,lease_until:null});return status;
  };
  // Provider idempotency expires at 24h; a lost receipt must never become a duplicate.
  if(now.getTime()-Date.parse(row.first_attempt_at)>=23*3600000)return finish('review','retry_window_expired');
  const event=must(await db.from('events').select('id,title,slug,starts_at,ends_at,series_id,status,tribe_id,tribe_visibility').eq('id',row.event_id).maybeSingle());
  if(!event||event.status!=='published'||(event.tribe_id&&event.tribe_visibility!=='public'))return finish('skipped','event_unavailable');
  const config=must(await db.from('event_followup_settings').select('enabled,enabled_after').eq('series_id',event.series_id).maybeSingle());
  if(!config?.enabled||!event.ends_at||Date.parse(event.starts_at)<Date.parse(config.enabled_after)||Date.parse(followupSendTime(event.ends_at))>now.getTime())return finish('skipped','event_not_eligible');
  const profile=must(await db.from('profiles').select('is_ghost,locale').eq('id',row.user_id).maybeSingle());
  const prefs=must(await db.from('notification_preferences').select('email_enabled,channel_preferences').eq('user_id',row.user_id).maybeSingle());
  if(!profile||profile.is_ghost||!allowsFollowup(prefs))return finish('skipped','email_disabled');
  const rsvp=must(await db.from('rsvps').select('status,no_show_at,checked_in_at').eq('event_id',row.event_id).eq('user_id',row.user_id).maybeSingle());
  const arrival=must(await db.from('event_arrival_participants').select('id').eq('event_id',row.event_id).eq('user_id',row.user_id).maybeSingle());
  if(rsvp?.status==='cancelled'||rsvp?.no_show_at||(!rsvp?.checked_in_at&&!arrival))return finish('skipped','attendance_unconfirmed');
  const identity=await db.auth.admin.getUserById(row.user_id);
  if(identity.error)throw new Error('followup_identity_lookup');
  const user=identity.data.user;
  if(!user?.email||!user.email_confirmed_at||/@(?:[^@.]+\.)*dalat\.app$/i.test(user.email))return finish('skipped','no_verified_email');
  const upcoming=must(await db.from('events').select('title,slug,starts_at').eq('series_id',event.series_id).eq('status','published')
    .or('tribe_id.is.null,tribe_visibility.eq.public').gt('starts_at',now.toISOString()).order('starts_at').limit(2)) as NextFollowupEvent[];
  let frozen=row.payload;
  const eventVersion=JSON.stringify([event.title,event.slug,event.starts_at,event.ends_at]);
  if(frozen&&frozen.eventVersion!==eventVersion)return finish('review','event_changed');
  if(frozen&&JSON.stringify(frozen.upcoming)!==JSON.stringify(upcoming))return finish('review','promoted_events_changed');
  if(frozen&&frozen.request.to!==user.email)return finish('review','recipient_changed');
  if(!frozen){
    const unsubscribeUrl=buildUnsubscribeUrl(row.user_id,'all');
    if(!unsubscribeUrl)throw new Error('followup_unsubscribe_unavailable');
    const content=await buildEventFollowup(event as FollowupEvent,followupLocale(profile.locale),upcoming,unsubscribeUrl);
    frozen={request:{from:'Dalat Events <events@dalat.app>',to:user.email,...content,headers:{
      'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}},upcoming,eventVersion};
    // Freeze the full request BEFORE contacting the provider, so retries are identical.
    await save({payload:frozen});
  }
  try {
    const result=await send(frozen.request,`event-followup/${row.event_id}/${row.user_id}`);
    if(result.error||!result.data?.id)return finish('pending','provider_retry');
    await save({status:'sent',provider_id:result.data.id,sent_at:now.toISOString(),last_error:null,lease_token:null,lease_until:null});
    return 'sent';
  } catch {
    // Network failure may mean accepted-but-response-lost. Keep the same request/key.
    return finish('pending','provider_retry');
  }
}

export async function processEventFollowups(db:SupabaseClient,now=new Date()) {
  if(!process.env.RESEND_API_KEY)throw new Error('followup_email_not_configured');
  const rows=must(await db.rpc('claim_event_followups',{p_token:randomUUID(),p_now:now.toISOString(),p_limit:25})) as FollowupDelivery[];
  const provider=new Resend(process.env.RESEND_API_KEY);
  const report={claimed:rows.length,sent:0,skipped:0,pending:0,review:0,failed:0};
  for(const row of rows){
    try {const status=await deliverFollowup(db,row,now,(request,key)=>provider.emails.send(request,{idempotencyKey:key}));report[status as 'sent'|'skipped'|'pending'|'review']++;}
    catch {report.failed++;}
  }
  return report;
}

export async function previewEventFollowups(db:SupabaseClient,now=new Date()) {
  const settings=must(await db.from('event_followup_settings').select('series_id,enabled_after').eq('enabled',true));
  const series=(settings||[]).map(s=>s.series_id);
  if(!series.length)return {enabledSeries:0,nextEvents:[]};
  const events=must(await db.from('events').select('id,title,slug,starts_at,ends_at,series_id').in('series_id',series)
    .eq('status','published').gt('starts_at',now.toISOString()).order('starts_at').limit(4));
  return {enabledSeries:series.length,nextEvents:(events||[]).filter(e=>e.ends_at).map(e=>({id:e.id,title:e.title,slug:e.slug,sendAfter:followupSendTime(e.ends_at)}))};
}

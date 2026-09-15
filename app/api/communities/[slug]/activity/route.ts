import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { z } from 'zod';
const schema=z.object({id:z.uuid(),kind:z.enum(['view','event_click','join_click','share_click']),source:z.string().max(100),campaign:z.string().max(100).optional()});
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}) {
  if(request.headers.get('origin')!==new URL(request.url).origin) return new NextResponse(null,{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return new NextResponse(null,{status:400});
  const db=await createClient();const {slug}=await params;
  const {data:community}=await db.from('tribes').select('id').eq('slug',slug).maybeSingle();
  if(!community)return new NextResponse(null,{status:404});
  const {data:{user}}=await db.auth.getUser();
  if(user){const [{data:manager},{data:siteAdmin}]=await Promise.all([db.rpc('is_tribe_admin',{p_tribe_id:community.id}),db.rpc('is_admin')]);if(manager||siteAdmin)return new NextResponse(null,{status:204});}
  const admin=createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const {id,kind,source,campaign}=parsed.data;
  const sources=['direct','facebook','whatsapp','instagram','linkedin','qr','email','other'];
  const {error}=await admin.rpc('record_community_visit',{p_id:id,p_community_id:community.id,p_kind:kind,p_source:sources.includes(source.toLowerCase())?source.toLowerCase():'other',p_campaign:campaign?.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)||null});
  return new NextResponse(null,{status:error?500:204});
}

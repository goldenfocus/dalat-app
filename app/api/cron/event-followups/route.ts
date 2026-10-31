import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { previewEventFollowups, processEventFollowups } from '@/lib/notifications/event-followup';
export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const report=new URL(request.url).searchParams.get('dryRun')==='1'?await previewEventFollowups(db):await processEventFollowups(db);
    return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
  } catch {
    console.error('[event-followups] Processing failed; inspect private delivery receipts');
    return NextResponse.json({error:'Event follow-up processing failed'},{status:503});
  }
}

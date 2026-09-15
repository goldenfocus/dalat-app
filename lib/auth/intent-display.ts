import 'server-only';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
export async function getIntentLabel(id: string | undefined): Promise<string | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const secret = (await cookies()).get(`dalat-intent-${id}`)?.value;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const { data }=await admin.from('signup_intents').select('label').eq('id',id).eq('token_hash',createHash('sha256').update(secret).digest('hex')).gt('expires_at',new Date().toISOString()).maybeSingle();
  return data?.label ?? null;
}

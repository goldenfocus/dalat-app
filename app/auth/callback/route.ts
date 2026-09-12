import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth/continuation';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/auth/error?error=Missing%20authorization%20code',url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/auth/error?error=Please%20try%20signing%20in%20again',url.origin));
  await supabase.rpc('record_login_event', { p_ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, p_user_agent: request.headers.get('user-agent') || null });
  const next = safeReturnPath(url.searchParams.get('next'));
  const destination = next.startsWith('/auth/continue?') ? next : `/auth/continue?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(destination,url.origin));
}

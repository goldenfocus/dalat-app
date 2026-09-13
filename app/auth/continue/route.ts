import { createHash } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { POST as sendInterestedNotifications } from '@/app/api/notifications/interested/route';
import { POST as sendRsvpNotifications } from '@/app/api/notifications/rsvp/route';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath, localizedPath } from '@/lib/auth/continuation';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const intent = url.searchParams.get('intent');
  const next = safeReturnPath(url.searchParams.get('next'));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const secret = intent && /^[0-9a-f-]{36}$/i.test(intent) ? cookieStore.get(`dalat-intent-${intent}`)?.value : null;
  const continuation = intent ? `/auth/continue?intent=${encodeURIComponent(intent)}` : `/auth/continue?next=${encodeURIComponent(next)}`;
  if (!user) {
    const login = new URL('/auth/login', url.origin);
    if (intent) login.searchParams.set('intent', intent);
    else login.searchParams.set('next', next);
    return NextResponse.redirect(login);
  }
  const { data: profile } = await supabase.from('profiles').select('username,locale').eq('id',user.id).maybeSingle();
  const locale = profile?.locale || 'en';
  if (!profile?.username) {
    return NextResponse.redirect(new URL(localizedPath(`/onboarding?next=${encodeURIComponent(continuation)}`, locale), url.origin));
  }
  if (!intent) return NextResponse.redirect(new URL(localizedPath(next, locale), url.origin));
  if (!secret) return NextResponse.redirect(new URL(localizedPath('/auth/error?error=Please%20open%20the%20community%20or%20event%20link%20again%20in%20this%20browser.',locale),url.origin));
  const { data, error } = await supabase.rpc('complete_signup_intent', { p_id: intent, p_token_hash: createHash('sha256').update(secret).digest('hex') });
  if (error) return NextResponse.redirect(new URL(localizedPath('/auth/error?error=Your%20sign-in%20worked.%20Please%20open%20the%20original%20link%20again%20to%20continue.',locale),url.origin));
  if (data.just_completed && data.rsvp_status === 'going' && data.event_id) {
    after(async () => {
      await sendRsvpNotifications(new Request(new URL('/api/notifications/rsvp',url.origin), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: data.event_id, rsvpStatus: 'going' }),
      }));
    });
  }
  if (data.just_completed && data.rsvp_status === 'interested' && data.event_id) {
    after(async () => {
      await sendInterestedNotifications(new Request(new URL('/api/notifications/interested',url.origin), {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:data.event_id}),
      }));
    });
  }
  const destination = new URL(localizedPath(safeReturnPath(data.next_path),locale),url.origin);
  if (data.just_completed && data.community_status) destination.searchParams.set('communityStatus',data.community_status);
  if (data.rsvp_pending) destination.searchParams.set('resumeRsvp','1');
  if (data.just_completed && data.rsvp_status) destination.searchParams.set('rsvpStatus',data.rsvp_status);
  const response = NextResponse.redirect(destination);
  // Keep the browser binding until expiry so callback replay remains harmless and useful.
  response.headers.set('Cache-Control','private, no-store');
  return response;
}

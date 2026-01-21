import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  notifyRsvpConfirmation,
  notifyConfirmAttendance24h,
  notifyFinalReminder2h,
  notifyWaitlistPromotion,
} from '@/lib/notifications';
import type { Locale } from '@/lib/types';

// Test different notification types
// POST /api/test-notification?type=rsvp|24h|2h|waitlist
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') || '24h';

  // Get user's locale
  const { data: profile } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', user.id)
    .single();

  const locale = (profile?.locale as Locale) || 'en';

  try {
    switch (type) {
      case 'rsvp':
        await notifyRsvpConfirmation(
          user.id,
          locale,
          'Test Event - Beach BBQ',
          'test-event',
          'Bring sunscreen and good vibes!'
        );
        break;

      case '24h':
        await notifyConfirmAttendance24h(
          user.id,
          locale,
          'Test Event - Beach BBQ',
          '3:00 PM',
          'test-event'
        );
        break;

      case '2h':
        await notifyFinalReminder2h(
          user.id,
          locale,
          'Test Event - Beach BBQ',
          'Love Kombucha Cafe',
          'https://maps.google.com/?q=Love+Kombucha+Dalat',
          'test-event'
        );
        break;

      case 'waitlist':
        await notifyWaitlistPromotion(
          user.id,
          locale,
          'Test Event - Beach BBQ',
          'test-event'
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid type. Use: rsvp, 24h, 2h, or waitlist' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, type, message: `${type} notification sent!` });
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

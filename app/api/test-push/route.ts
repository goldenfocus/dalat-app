import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/web-push';

/**
 * Direct web push test - bypasses Novu, tests only browser push
 * GET /api/test-push
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  console.log('[test-push] Testing push for user:', user.id);

  const result = await sendPushToUser(user.id, {
    title: '🧪 Test Push Notification',
    body: 'If you see this, web push is working!',
    url: 'https://dalat.app',
    tag: 'test-push',
  });

  console.log('[test-push] Result:', result);

  return NextResponse.json({
    userId: user.id,
    result,
    diagnosis: result.sent > 0
      ? '✅ Push notification sent successfully!'
      : result.failed > 0
        ? '❌ Push failed - subscription may be expired'
        : '❌ No subscriptions found - enable notifications in settings',
  });
}

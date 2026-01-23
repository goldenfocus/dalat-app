import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/lib/web-push';

/**
 * Direct web push test with diagnostics
 * GET /api/test-push - sends a test push notification
 * GET /api/test-push?diagnose=true - detailed diagnostics without sending
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const diagnoseOnly = url.searchParams.get('diagnose') === 'true';

  // Get subscriptions for diagnostics
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: subscriptions, error: subError } = await serviceClient
    .from('push_subscriptions')
    .select('id, endpoint, created_at, notification_mode, updated_at')
    .eq('user_id', user.id);

  // Build diagnostics
  const diagnostics = {
    userId: user.id,
    email: user.email,
    subscriptionCount: subscriptions?.length ?? 0,
    subscriptions: subscriptions?.map(s => ({
      id: s.id,
      endpoint: s.endpoint?.substring(0, 80) + '...',
      created: s.created_at,
      updated: s.updated_at,
      mode: s.notification_mode,
      platform: detectPlatform(s.endpoint),
    })) ?? [],
    subscriptionError: subError?.message,
    config: {
      hasVapidPublicKey: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      hasVapidPrivateKey: !!process.env.VAPID_PRIVATE_KEY,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // Build diagnosis messages
  const issues: string[] = [];

  if (!diagnostics.config.hasVapidPublicKey || !diagnostics.config.hasVapidPrivateKey) {
    issues.push('❌ VAPID keys not configured - push will fail');
  }

  if (diagnostics.subscriptionCount === 0) {
    issues.push('❌ No push subscriptions found');
    issues.push('   → On iOS: Add to Home Screen first, then enable notifications');
    issues.push('   → On Android: Enable notifications in Settings or when prompted');
    issues.push('   → Clear localStorage key "notification-prompted" and reload to re-prompt');
  } else {
    issues.push(`✅ Found ${diagnostics.subscriptionCount} subscription(s)`);

    // Check for platform-specific issues
    const hasIOS = subscriptions?.some(s => detectPlatform(s.endpoint) === 'iOS');
    const hasAndroid = subscriptions?.some(s => detectPlatform(s.endpoint) === 'Android');
    const hasChrome = subscriptions?.some(s => detectPlatform(s.endpoint) === 'Chrome');

    if (hasIOS) {
      issues.push('📱 iOS subscription detected - requires iOS 16.4+ and PWA installed to Home Screen');
    }
    if (hasAndroid || hasChrome) {
      issues.push('🤖 Android/Chrome subscription detected');
    }
  }

  if (diagnoseOnly) {
    return NextResponse.json({
      ...diagnostics,
      diagnosis: issues,
    });
  }

  // Actually send the test push
  console.log('[test-push] Testing push for user:', user.id);

  const result = await sendPushToUser(user.id, {
    title: '🧪 Test Push Notification',
    body: 'If you see this, web push is working!',
    url: 'https://dalat.app',
    tag: 'test-push',
  });

  console.log('[test-push] Result:', result);

  // Add result-specific diagnosis
  if (result.sent > 0) {
    issues.push(`✅ Push sent successfully to ${result.sent} device(s)!`);
    issues.push('   → Check your device - notification should appear shortly');
    issues.push('   → If not received, check Do Not Disturb / Focus mode');
  }
  if (result.failed > 0) {
    issues.push(`⚠️ Push failed for ${result.failed} device(s) - subscriptions may be expired`);
  }

  return NextResponse.json({
    ...diagnostics,
    result,
    diagnosis: issues,
  });
}

function detectPlatform(endpoint: string | null): string {
  if (!endpoint) return 'Unknown';
  if (endpoint.includes('apple') || endpoint.includes('web.push.apple')) return 'iOS';
  if (endpoint.includes('fcm.googleapis.com')) return 'Android';
  if (endpoint.includes('updates.push.services.mozilla.com')) return 'Firefox';
  if (endpoint.includes('wns.windows.com')) return 'Windows';
  return 'Chrome';
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Debug endpoint to check notification configuration for current user
 * GET /api/notifications/debug
 */
export async function GET() {
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Use service role to check subscriptions
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check push subscriptions
  const { data: subscriptions, error: subError } = await serviceClient
    .from('push_subscriptions')
    .select('id, endpoint, created_at, notification_mode')
    .eq('user_id', user.id);

  // Check environment configuration
  const config = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasVapidPublicKey: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    hasVapidPrivateKey: !!process.env.VAPID_PRIVATE_KEY,
    hasResendApiKey: !!process.env.RESEND_API_KEY,
    hasInngestEventKey: !!process.env.INNGEST_EVENT_KEY,
    hasInngestSigningKey: !!process.env.INNGEST_SIGNING_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    pushSubscriptions: {
      count: subscriptions?.length ?? 0,
      subscriptions: subscriptions?.map(s => ({
        id: s.id,
        endpoint: s.endpoint?.substring(0, 50) + '...',
        created: s.created_at,
        mode: s.notification_mode,
      })) ?? [],
      error: subError?.message,
    },
    config,
    diagnosis: getDiagnosis(subscriptions?.length ?? 0, config),
  });
}

function getDiagnosis(subCount: number, config: Record<string, unknown>): string[] {
  const issues: string[] = [];

  if (subCount === 0) {
    issues.push('❌ No push subscriptions found - browser notifications not enabled');
    issues.push('   → Go to Settings and enable notifications, or clear localStorage key "notification-prompted" and reload');
  }

  if (!config.hasVapidPublicKey || !config.hasVapidPrivateKey) {
    issues.push('❌ VAPID keys not configured - web push will fail');
  }

  if (!config.hasSupabaseUrl || !config.hasSupabaseServiceKey) {
    issues.push('❌ Supabase service config missing - in-app and scheduled notifications will fail');
  }

  if (!config.hasInngestEventKey || !config.hasInngestSigningKey) {
    issues.push('⚠️ Inngest keys not fully configured - scheduled reminders may not run outside local/dev');
  }

  if (issues.length === 0) {
    issues.push('✅ Configuration looks good');
    if (subCount > 0) {
      issues.push(`✅ Found ${subCount} push subscription(s)`);
    }
  }

  return issues;
}

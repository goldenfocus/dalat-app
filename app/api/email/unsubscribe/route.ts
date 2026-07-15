import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyUnsubscribeToken, type UnsubscribeScope } from '@/lib/notifications/unsubscribe';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/lib/notifications/preferences';
import type { Locale } from '@/lib/types';

// Minimal localized copy for the confirmation pages (email land — outside next-intl routing,
// same hardcoded-map pattern as lib/notifications/templates.ts)
const COPY: Record<Locale, { confirmTitle: string; confirmButton: string; done: string; note: string }> = {
  en: { confirmTitle: 'Unsubscribe from these emails?', confirmButton: 'Unsubscribe', done: "You're unsubscribed", note: 'You can change this anytime in your notification settings on dalat.app.' },
  vi: { confirmTitle: 'Hủy đăng ký nhận email này?', confirmButton: 'Hủy đăng ký', done: 'Bạn đã hủy đăng ký', note: 'Bạn có thể thay đổi bất cứ lúc nào trong cài đặt thông báo trên dalat.app.' },
  ko: { confirmTitle: '이 이메일 수신을 거부할까요?', confirmButton: '수신 거부', done: '수신 거부되었습니다', note: 'dalat.app의 알림 설정에서 언제든지 변경할 수 있습니다.' },
  zh: { confirmTitle: '要退订这些邮件吗？', confirmButton: '退订', done: '已退订', note: '您可以随时在 dalat.app 的通知设置中更改。' },
  ru: { confirmTitle: 'Отписаться от этих писем?', confirmButton: 'Отписаться', done: 'Вы отписались', note: 'Вы можете изменить это в любое время в настройках уведомлений на dalat.app.' },
  fr: { confirmTitle: 'Se désabonner de ces e-mails ?', confirmButton: 'Se désabonner', done: 'Vous êtes désabonné', note: 'Vous pouvez modifier cela à tout moment dans vos paramètres de notification sur dalat.app.' },
  ja: { confirmTitle: 'このメールの配信を停止しますか？', confirmButton: '配信停止', done: '配信停止しました', note: 'dalat.app の通知設定でいつでも変更できます。' },
  ms: { confirmTitle: 'Berhenti melanggan e-mel ini?', confirmButton: 'Berhenti melanggan', done: 'Anda telah berhenti melanggan', note: 'Anda boleh mengubahnya bila-bila masa dalam tetapan pemberitahuan di dalat.app.' },
  th: { confirmTitle: 'ยกเลิกการรับอีเมลเหล่านี้?', confirmButton: 'ยกเลิกการรับ', done: 'ยกเลิกการรับอีเมลแล้ว', note: 'คุณเปลี่ยนได้ทุกเมื่อในการตั้งค่าการแจ้งเตือนบน dalat.app' },
  de: { confirmTitle: 'Diese E-Mails abbestellen?', confirmButton: 'Abbestellen', done: 'Du bist abgemeldet', note: 'Du kannst das jederzeit in deinen Benachrichtigungseinstellungen auf dalat.app ändern.' },
  es: { confirmTitle: '¿Cancelar la suscripción a estos correos?', confirmButton: 'Cancelar suscripción', done: 'Suscripción cancelada', note: 'Puedes cambiarlo en cualquier momento en tu configuración de notificaciones en dalat.app.' },
  id: { confirmTitle: 'Berhenti berlangganan email ini?', confirmButton: 'Berhenti berlangganan', done: 'Kamu berhenti berlangganan', note: 'Kamu bisa mengubahnya kapan saja di pengaturan notifikasi dalat.app.' },
};

type NotificationPreferencesUpdate = Parameters<typeof updateUserPreferences>[1];

async function applyUnsubscribe(userId: string, scope: UnsubscribeScope): Promise<boolean> {
  if (scope === 'all') {
    return updateUserPreferences(userId, { email_enabled: false });
  }
  // Granular: mute audience blasts only (keep in-app so nothing is silently lost)
  const prefs = await getUserPreferences(userId);
  const channel_preferences = {
    ...(prefs?.channel_preferences ?? {}),
    audience_invitation: ['in_app'],
  } as NotificationPreferencesUpdate['channel_preferences'];
  return updateUserPreferences(userId, { channel_preferences });
}

async function getUserLocale(userId: string): Promise<Locale> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return 'en';
  const admin = createClient(url, serviceKey);
  const { data } = await admin.from('profiles').select('locale').eq('id', userId).single();
  return ((data?.locale as Locale) || 'en');
}

function page(emoji: string, heading: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${heading}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f9fafb;">
  <div style="text-align:center; padding:40px; max-width:400px;">
    <p style="font-size:48px; margin:0 0 16px;">${emoji}</p>
    <h1 style="font-size:22px; color:#111827; margin:0 0 12px;">${heading}</h1>
    ${body}
  </div>
</body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// GET — human clicks the footer link. Shows a confirmation page WITHOUT applying anything:
// mail scanners and link prefetchers (Outlook SafeLinks etc.) follow every GET in an email,
// so applying on GET would silently unsubscribe users who never clicked.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return new NextResponse('Invalid unsubscribe link', { status: 400 });
  }

  const locale = await getUserLocale(verified.userId);
  const copy = COPY[locale] ?? COPY.en;
  return page(
    '📭',
    copy.confirmTitle,
    `<form method="POST" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}">
      <button type="submit" style="font-size:16px; padding:12px 28px; border:none; border-radius:8px; background:#111827; color:white; cursor:pointer;">${copy.confirmButton}</button>
    </form>
    <p style="font-size:14px; color:#6b7280; margin:16px 0 0;">${copy.note}</p>`
  );
}

// POST — applies the unsubscribe. Reached two ways:
// 1. RFC 8058 one-click (mail client posts List-Unsubscribe=One-Click on user action)
// 2. The confirmation form above
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const ok = await applyUnsubscribe(verified.userId, verified.scope);
  if (!ok) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }

  // Browser form submits want a human-readable page; one-click clients want a 200
  if (request.headers.get('accept')?.includes('text/html')) {
    const locale = await getUserLocale(verified.userId);
    const copy = COPY[locale] ?? COPY.en;
    return page('👋', copy.done, `<p style="font-size:15px; color:#6b7280; margin:0;">${copy.note}</p>`);
  }
  return NextResponse.json({ success: true });
}

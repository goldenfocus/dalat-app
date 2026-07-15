import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless, signed unsubscribe tokens for email links.
 * scope 'all'      → email_enabled = false (kills all notification emails)
 * scope 'audience' → mutes audience_invitation blasts only (keeps personal invites)
 */
export type UnsubscribeScope = 'all' | 'audience';

const SCOPES: UnsubscribeScope[] = ['all', 'audience'];

function getSecret(): string | null {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function sign(userId: string, scope: UnsubscribeScope, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${scope}`)
    .digest('base64url');
}

export function createUnsubscribeToken(
  userId: string,
  scope: UnsubscribeScope
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return `${userId}.${scope}.${sign(userId, scope, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; scope: UnsubscribeScope } | null {
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, scope, sig] = parts;
  if (!userId || !SCOPES.includes(scope as UnsubscribeScope)) return null;

  const expected = sign(userId, scope as UnsubscribeScope, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { userId, scope: scope as UnsubscribeScope };
}

export function buildUnsubscribeUrl(
  userId: string,
  scope: UnsubscribeScope
): string | null {
  const token = createUnsubscribeToken(userId, scope);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://dalat.app';
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

'use client';
export type SignupIntent =
  | { kind: 'community'; slug: string; inviteCode?: string }
  | { kind: 'event'; slug: string; joinCommunity?: boolean }
  | { kind: 'profile'; slug: string };
export async function startSignupIntent(intent: SignupIntent): Promise<void> {
  const response = await fetch('/api/auth/intent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...intent, locale: document.documentElement.lang || 'en' }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not continue. Please try again.');
  window.location.assign(data.url);
}

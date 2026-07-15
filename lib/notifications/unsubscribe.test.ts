import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from './unsubscribe';

describe('unsubscribe tokens', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dalat.app');
  });

  it('round-trips a valid token', () => {
    const token = createUnsubscribeToken('user-123', 'audience');
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token!)).toEqual({
      userId: 'user-123',
      scope: 'audience',
    });
  });

  it('rejects a tampered token', () => {
    const token = createUnsubscribeToken('user-123', 'audience')!;
    const tampered = token.replace('user-123', 'user-456');
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects a token with an invalid scope', () => {
    const token = createUnsubscribeToken('user-123', 'all')!;
    const forged = token.replace('.all.', '.everything.');
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyUnsubscribeToken('not-a-token')).toBeNull();
    expect(verifyUnsubscribeToken('a.b.c')).toBeNull();
  });

  it('builds a URL containing the token', () => {
    const url = buildUnsubscribeUrl('user-123', 'all');
    expect(url).toContain('https://dalat.app/api/email/unsubscribe?token=');
  });

  it('returns null when no secret is configured', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(createUnsubscribeToken('user-123', 'all')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiChatJson } from './provider';

const PROVIDER_ENV_KEYS = [
  'LOCAL_AI_URL',
  'LOCAL_AI_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_TOKEN',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

const originalEnv = Object.fromEntries(
  PROVIDER_ENV_KEYS.map(key => [key, process.env[key]])
);

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of PROVIDER_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('aiChat production fallback', () => {
  it('uses Anthropic when the zero-credit providers are not configured', async () => {
    for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: 'text', text: '{"disposition":"current-news"}' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(aiChatJson<{ disposition: string }>({
      prompt: 'Classify this story',
      maxTokens: 128,
    })).resolves.toEqual({ disposition: 'current-news' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'test-anthropic-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Classify this story' }],
    });
  });
});

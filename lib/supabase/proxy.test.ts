import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { updateSession } from './proxy';

vi.mock('next-intl/middleware', () => ({
  default: () => () => new Response(null, { status: 200 }),
}));

vi.mock('../i18n/routing', () => ({
  routing: {
    locales: ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'],
    defaultLocale: 'en',
  },
}));

vi.mock('../utils', () => ({ hasEnvVars: true }));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

function request(
  path: string,
  { acceptLanguage, cookie }: { acceptLanguage?: string; cookie?: string } = {},
) {
  return new NextRequest(`https://dalat.app${path}`, {
    headers: {
      ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
}

describe('locale routing', () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReset();
  });

  it('redirects the homepage to Spanish for a Spanish browser', async () => {
    const response = await updateSession(request('/', {
      acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://dalat.app/es/');
  });

  it('prefers a language the visitor previously selected', async () => {
    const response = await updateSession(request('/', {
      acceptLanguage: 'es-ES,es;q=0.9',
      cookie: 'NEXT_LOCALE=fr',
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://dalat.app/fr/');
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('uses the connected member profile when there is no locale cookie', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { locale: 'fr' } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'member-1' } } }),
      },
      from: vi.fn(() => ({ select })),
    } as never);

    const response = await updateSession(request('/', {
      acceptLanguage: 'es-ES,es;q=0.9',
      cookie: 'sb-test-auth-token=session',
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://dalat.app/fr/');
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  it('rewrites unsupported browser languages to the English homepage', async () => {
    const response = await updateSession(request('/', {
      acceptLanguage: 'pt-BR,pt;q=0.9',
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://dalat.app/en');
  });
});

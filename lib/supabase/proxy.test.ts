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
  {
    acceptLanguage,
    cookie,
    userAgent,
  }: { acceptLanguage?: string; cookie?: string; userAgent?: string } = {},
) {
  return new NextRequest(`https://dalat.app${path}`, {
    headers: {
      ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
      ...(cookie ? { cookie } : {}),
      ...(userAgent ? { 'user-agent': userAgent } : {}),
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
    expect(response.headers.get('content-language')).toBe('en');
  });

  it('declares the explicit route locale for non-JavaScript parsers', async () => {
    const response = await updateSession(request('/fr/events/festival'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-language')).toBe('fr');
  });

  it('returns a true localized 404 to indexing crawlers for a missing event leaf', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ limit }));
    const or = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ or }));
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
    } as never);

    const response = await updateSession(request('/vi/events/not-a-real-event', {
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
    }));

    expect(response.status).toBe(404);
    expect(response.headers.get('content-language')).toBe('vi');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(or).toHaveBeenCalledWith(
      'slug.eq.not-a-real-event,previous_slugs.cs.{not-a-real-event}',
    );
  });

  it('fails open for a real event and never preflights collection routes', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: 'event-1' }], error: null });
    const eq = vi.fn(() => ({ limit }));
    const or = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ or }));
    const from = vi.fn(() => ({ select }));
    vi.mocked(createServerClient).mockReturnValue({ from } as never);

    const realEvent = await updateSession(request('/events/real-event', {
      userAgent: 'OAI-SearchBot/1.0',
    }));
    expect(realEvent.status).toBe(200);
    expect(realEvent.headers.get('x-middleware-rewrite')).toBe(
      'https://dalat.app/en/events/real-event',
    );
    expect(from).toHaveBeenCalledOnce();

    vi.mocked(createServerClient).mockClear();
    const collection = await updateSession(request('/events/upcoming', {
      userAgent: 'Googlebot/2.1',
    }));
    expect(collection.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

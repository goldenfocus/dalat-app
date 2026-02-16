import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { hasEnvVars } from "../utils";
import { routing } from "../i18n/routing";

// Create next-intl middleware for locale handling
const intlMiddleware = createIntlMiddleware(routing);

// Pre-compiled regex patterns (avoid creating new RegExp per request)
const localePattern = routing.locales.join('|');
const localeAtUsernameRegex = new RegExp(`^\\/(${localePattern})\\/@([a-zA-Z0-9_]+)$`);
const localeStripRegex = new RegExp(`^\\/(${localePattern})`);

// Social media crawlers that Next.js doesn't recognize as bots.
// These need metadata in the initial <head> for link previews to work.
const socialCrawlerPattern = /Zalo|Line\/|Telegram|Viber|KakaoTalk|Slackbot|Discordbot|PinterestBot|LinkedInBot|Whatsapp|Snapchat|Twitterbot|vkShare/i;

// Check if a string is a valid locale
function isLocale(segment: string): boolean {
  return routing.locales.includes(segment as typeof routing.locales[number]);
}

// Detect browser's preferred locale from Accept-Language header
function detectBrowserLocale(request: NextRequest): string | null {
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) return null;

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,vi;q=0.8,fr;q=0.7")
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, qValue] = lang.trim().split(';q=');
      return {
        code: code.split('-')[0].toLowerCase(), // Get base language code
        q: qValue ? parseFloat(qValue) : 1.0
      };
    })
    .sort((a, b) => b.q - a.q);

  // Find first matching supported locale
  for (const lang of languages) {
    if (isLocale(lang.code)) {
      return lang.code;
    }
  }

  return null;
}

// Check if path looks like a username (3+ chars, alphanumeric + underscore)
function looksLikeUsername(segment: string): boolean {
  const username = segment.replace(/^@/, '');
  return username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username);
}

// Get locale from pathname
function getLocaleFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0])) {
    return segments[0];
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  // Normalize pathname by removing trailing slash (except for root "/")
  // This prevents redirect loops with Next.js default trailingSlash: false
  const rawPathname = request.nextUrl.pathname;
  const pathname = rawPathname.length > 1 && rawPathname.endsWith('/')
    ? rawPathname.slice(0, -1)
    : rawPathname;

  // Pass through feed/data routes that live outside /[locale]/ and /api/
  if (
    pathname === '/blog/rss.xml' ||
    pathname === '/blog/feed.json' ||
    pathname === '/news/rss.xml' ||
    pathname === '/news/sitemap.xml'
  ) {
    return NextResponse.next({ request });
  }

  // Detect social media crawlers that Next.js doesn't natively recognize as bots.
  // When detected, we override the User-Agent via response headers so Next.js waits
  // for metadata/Suspense to resolve before streaming <head>. This ensures OG tags
  // appear inside <head> for proper link preview rendering on Zalo, Line, Telegram, etc.
  const isSocialCrawler = socialCrawlerPattern.test(request.headers.get('user-agent') || '');

  // Helper: tell Next.js renderer to treat this request as a bot.
  // Uses x-middleware-override-headers to replace User-Agent for the rendering pipeline.
  function spoofBotUA(response: NextResponse): NextResponse {
    if (isSocialCrawler) {
      response.headers.set('x-middleware-override-headers', 'user-agent');
      response.headers.set('x-middleware-request-user-agent', 'facebookexternalhit/1.1');
    }
    return response;
  }

  // =========================================================================
  // REDIRECT LOOP DETECTION
  // =========================================================================
  // Track rapid redirects via a short-lived cookie. If a user hits 5+ redirects
  // within 10 seconds, bail out and show a friendly help page instead of looping.
  const redirectCount = parseInt(request.cookies.get('_rc')?.value || '0', 10);
  if (redirectCount >= 5) {
    const locale = getLocaleFromPath(pathname) || routing.defaultLocale;
    const helpUrl = new URL(`/${locale}/auth/redirect-help`, request.url);
    const response = NextResponse.redirect(helpUrl);
    response.cookies.delete('_rc');
    return response;
  }

  // Helper: increment redirect counter on redirect responses
  function trackRedirect(response: NextResponse): NextResponse {
    if (response.status >= 300 && response.status < 400) {
      response.cookies.set('_rc', String(redirectCount + 1), {
        maxAge: 10, path: '/', httpOnly: true, sameSite: 'lax',
      });
    } else {
      // Successful response — clear the counter
      if (redirectCount > 0) {
        response.cookies.delete('_rc');
      }
    }
    return response;
  }

  // =========================================================================
  // UNIFIED SLUG NAMESPACE: Legacy URL Redirects
  // =========================================================================
  // Redirect old /venues/[slug] and /organizers/[slug] URLs to unified /[slug]
  // These are permanent (301) redirects for SEO preservation.

  // Check for legacy venue URLs: /venues/[slug] or /{locale}/venues/[slug]
  // But NOT /venues/[slug]/events (venue event list) - that stays
  const legacyVenueMatch = pathname.match(/^(?:\/([a-z]{2}))?\/venues\/([a-zA-Z0-9_-]+)$/);
  if (legacyVenueMatch) {
    const [, locale, venueSlug] = legacyVenueMatch;
    const targetLocale = locale || routing.defaultLocale;
    const url = new URL(`/${targetLocale}/${venueSlug}`, request.url);
    return NextResponse.redirect(url, { status: 301 });
  }

  // Check for legacy organizer URLs: /organizers/[slug] or /{locale}/organizers/[slug]
  const legacyOrganizerMatch = pathname.match(/^(?:\/([a-z]{2}))?\/organizers\/([a-zA-Z0-9_-]+)$/);
  if (legacyOrganizerMatch) {
    const [, locale, organizerSlug] = legacyOrganizerMatch;
    const targetLocale = locale || routing.defaultLocale;
    const url = new URL(`/${targetLocale}/${organizerSlug}`, request.url);
    return NextResponse.redirect(url, { status: 301 });
  }

  // =========================================================================

  // Skip locale handling for API routes and static files
  const shouldSkipLocale =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/confirm') ||
    pathname.startsWith('/auth/verify') ||
    pathname.includes('.');

  if (!shouldSkipLocale) {
    // Handle locale routing
    const pathnameLocale = getLocaleFromPath(pathname);
    const defaultLocale = routing.defaultLocale;

    // CRITICAL FOR ISR: Homepage (/) must NOT read cookies or redirect based on user preference
    // This allows Vercel to cache the homepage response for all users
    // Users can switch language via the LocaleMismatchBanner after page loads
    if (pathname === '/') {
      // Fast path: Always rewrite homepage to /en for ISR caching
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/${defaultLocale}`;
      return spoofBotUA(NextResponse.rewrite(rewriteUrl));
    }

    // For non-homepage routes, we can personalize (but try to minimize cookie reads)
    // Only read cookies for pages without locale prefix that need personalization
    const needsCookieRead = !pathnameLocale;
    const cookieLocale = needsCookieRead
      ? request.cookies.get('NEXT_LOCALE')?.value
      : undefined;
    const browserLocale = detectBrowserLocale(request);

    // Priority: cookie > browser detection > default
    const preferredLocale = (cookieLocale && isLocale(cookieLocale))
      ? cookieLocale
      : (browserLocale || defaultLocale);

    // If no locale in path, handle based on localePrefix: 'as-needed' setting
    // Only redirect if user prefers non-default locale; default locale uses rewrite (no redirect)
    if (!pathnameLocale) {
      // Check if this is a short username URL: /yan or /@yan
      const rootSegmentMatch = pathname.match(/^\/(@?[a-zA-Z0-9_]+)$/);
      if (rootSegmentMatch) {
        const segment = rootSegmentMatch[1];
        const cleanSegment = segment.replace(/^@/, '');

        // If it looks like a username, handle with rewrite (default) or redirect (non-default)
        if (looksLikeUsername(segment)) {
          if (preferredLocale !== defaultLocale) {
            const url = new URL(`/${preferredLocale}/${cleanSegment}`, request.url);
            return NextResponse.redirect(url);
          }
          // For default locale, rewrite internally (no redirect penalty)
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = `/${defaultLocale}/${cleanSegment}`;
          return spoofBotUA(NextResponse.rewrite(rewriteUrl));
        }
      }

      // For non-default locale preference, redirect to add locale prefix
      if (preferredLocale !== defaultLocale) {
        const targetPath = `/${preferredLocale}${pathname}`;
        const url = new URL(targetPath, request.url);
        url.search = request.nextUrl.search;
        return NextResponse.redirect(url);
      }

      // For default locale (English), rewrite internally without redirect
      // This eliminates the redirect chain penalty for ~80% of users
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = pathname === '/' ? `/${defaultLocale}` : `/${defaultLocale}${pathname}`;
      return spoofBotUA(NextResponse.rewrite(rewriteUrl));
    }

    // Handle /{locale}/@{username} -> /{locale}/{username} redirect (normalize @ prefix)
    const localeAtUsernameMatch = pathname.match(localeAtUsernameRegex);
    if (localeAtUsernameMatch) {
      const [, locale, username] = localeAtUsernameMatch;
      const url = new URL(`/${locale}/${username}`, request.url);
      return NextResponse.redirect(url);
    }

    // Handle homepage search redirect: /?q=search -> /search/search-slug
    // This is done in middleware to allow the homepage to be statically cached
    const searchQuery = request.nextUrl.searchParams.get('q');
    if (searchQuery && searchQuery.trim()) {
      const pathnameLocale = getLocaleFromPath(pathname);
      const isHomepage = pathname === '/' || pathname === `/${pathnameLocale}`;
      if (isHomepage) {
        const slug = searchQuery
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        if (slug) {
          const locale = pathnameLocale || routing.defaultLocale;
          const url = new URL(`/${locale}/search/${slug}`, request.url);
          return NextResponse.redirect(url, { status: 308 }); // Permanent redirect
        }
      }
    }
  }

  // Determine public routes BEFORE any cookie/session handling
  // This is critical for ISR caching - avoid cookie operations on cacheable pages
  const pathWithoutLocale = pathname.replace(localeStripRegex, '');
  const isPublicRoute =
    pathWithoutLocale === "/" ||
    pathWithoutLocale === "" ||
    pathWithoutLocale.startsWith("/login") ||
    pathWithoutLocale.startsWith("/auth") ||
    pathname.startsWith("/auth") || // Root-level auth routes
    pathname.startsWith("/api") ||
    pathWithoutLocale.startsWith("/events") ||
    pathWithoutLocale.startsWith("/festivals") ||
    pathWithoutLocale.startsWith("/organizers") ||
    pathWithoutLocale.startsWith("/venues") ||  // Public venue pages
    pathWithoutLocale.startsWith("/moments") ||  // Public moments discovery
    pathWithoutLocale.startsWith("/feed") ||  // Public moments feed
    pathWithoutLocale.startsWith("/blog") ||  // Public blog articles
    pathWithoutLocale.startsWith("/map") ||  // Public map view
    pathWithoutLocale.startsWith("/calendar") ||  // Public calendar view
    pathWithoutLocale.startsWith("/test") ||  // Test pages (dev only)
    pathWithoutLocale.startsWith("/invite") ||  // Public invite links
    pathWithoutLocale.startsWith("/@");  // Public profile pages

  // API routes should pass through without any middleware processing
  // next-intl middleware expects locale prefixes which API routes don't have
  if (pathname.startsWith("/api")) {
    return NextResponse.next({ request });
  }

  // For public routes, use next-intl middleware to properly set locale context
  // This is critical for translations to work - skipping this breaks i18n
  if (isPublicRoute) {
    // Bypass intlMiddleware for locale-prefixed auth routes to prevent redirect loops.
    // Root-level /auth/* route handlers redirect to /{locale}/auth/* pages, but
    // intlMiddleware with localePrefix:'as-needed' strips the default locale prefix,
    // redirecting back to /auth/* and creating an infinite loop.
    if (pathWithoutLocale.startsWith('/auth/') && getLocaleFromPath(pathname)) {
      return spoofBotUA(NextResponse.next({ request }));
    }
    return trackRedirect(spoofBotUA(intlMiddleware(request)));
  }

  // If the env vars are not set, skip auth check
  if (!hasEnvVars) {
    return NextResponse.next({ request });
  }

  // Only run auth for protected routes
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    const locale = getLocaleFromPath(pathname) || routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth/login`;
    return trackRedirect(NextResponse.redirect(url));
  }

  // For authenticated routes, still need to run intl middleware for locale context
  // Merge the supabase response cookies with the intl middleware response
  const intlResponse = intlMiddleware(request);

  // Copy cookies from supabase response to intl response
  supabaseResponse.cookies.getAll().forEach(cookie => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  return trackRedirect(spoofBotUA(intlResponse));
}

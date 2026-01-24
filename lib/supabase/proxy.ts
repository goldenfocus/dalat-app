import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { routing } from "../i18n/routing";

// Pre-compiled regex patterns (avoid creating new RegExp per request)
const localePattern = routing.locales.join('|');
const localeAtUsernameRegex = new RegExp(`^\\/(${localePattern})\\/@([a-zA-Z0-9_]+)$`);
const localeStripRegex = new RegExp(`^\\/(${localePattern})`);

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
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    const browserLocale = detectBrowserLocale(request);
    const defaultLocale = routing.defaultLocale;

    // Priority: cookie > browser detection > default
    const preferredLocale = (cookieLocale && isLocale(cookieLocale))
      ? cookieLocale
      : (browserLocale || defaultLocale);

    // If no locale in path, redirect to locale-prefixed version
    if (!pathnameLocale) {
      // Check if this is a short username URL: /yan or /@yan
      const rootSegmentMatch = pathname.match(/^\/(@?[a-zA-Z0-9_]+)$/);
      if (rootSegmentMatch) {
        const segment = rootSegmentMatch[1];
        const cleanSegment = segment.replace(/^@/, '');

        // If it looks like a username, redirect to /{locale}/{username}
        if (looksLikeUsername(segment)) {
          const url = new URL(`/${preferredLocale}/${cleanSegment}`, request.url);
          return NextResponse.redirect(url);
        }
      }

      // Standard redirect to add locale prefix (ensure no double slashes)
      const targetPath = pathname === '/' ? `/${preferredLocale}` : `/${preferredLocale}${pathname}`;
      const url = new URL(targetPath, request.url);
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url);
    }

    // Handle /{locale}/@{username} -> /{locale}/{username} redirect (normalize @ prefix)
    const localeAtUsernameMatch = pathname.match(localeAtUsernameRegex);
    if (localeAtUsernameMatch) {
      const [, locale, username] = localeAtUsernameMatch;
      const url = new URL(`/${locale}/${username}`, request.url);
      return NextResponse.redirect(url);
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check
  if (!hasEnvVars) {
    return supabaseResponse;
  }

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

  // Public routes that don't require authentication (now with locale prefix)
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
    pathWithoutLocale.startsWith("/moments") ||  // Public moments discovery
    pathWithoutLocale.startsWith("/feed") ||  // Public moments feed
    pathWithoutLocale.startsWith("/blog") ||  // Public blog articles
    pathWithoutLocale.startsWith("/map") ||  // Public map view
    pathWithoutLocale.startsWith("/calendar") ||  // Public calendar view
    pathWithoutLocale.startsWith("/invite") ||  // Public invite links
    pathWithoutLocale.startsWith("/@");  // Public profile pages

  if (!user && !isPublicRoute) {
    const locale = getLocaleFromPath(pathname) || routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth/login`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

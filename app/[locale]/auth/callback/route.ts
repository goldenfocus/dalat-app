import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/lib/i18n/routing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale: urlLocale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Helper to redirect to error page with message
  const redirectToError = (error: string, locale: string) => {
    const errorUrl = new URL(`/${locale}/auth/error`, url.origin);
    errorUrl.searchParams.set("error", error);
    return NextResponse.redirect(errorUrl);
  };

  if (!code) {
    return redirectToError("No authorization code provided", urlLocale || routing.defaultLocale);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToError(error.message, urlLocale || routing.defaultLocale);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToError("Could not retrieve user after authentication", urlLocale || routing.defaultLocale);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, locale")
    .eq("id", user.id)
    .single();

  // Determine user's preferred locale: profile > URL > default
  const locale = profile?.locale && routing.locales.includes(profile.locale as typeof routing.locales[number])
    ? profile.locale
    : routing.locales.includes(urlLocale as typeof routing.locales[number])
      ? urlLocale
      : routing.defaultLocale;

  // Helper to create locale-prefixed redirect with cookie
  const createRedirect = (path: string) => {
    // Ensure path starts with locale
    const localePath = path.startsWith(`/${locale}`) ? path : `/${locale}${path.startsWith('/') ? path : `/${path}`}`;
    const response = NextResponse.redirect(new URL(localePath, url.origin));
    // Set locale cookie for future visits
    response.cookies.set('NEXT_LOCALE', locale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    return response;
  };

  // Check if user needs onboarding (no username)
  if (!profile?.username) {
    return createRedirect('/onboarding');
  }

  // Redirect to next URL or home
  return createRedirect(next === '/' ? '/' : next);
}

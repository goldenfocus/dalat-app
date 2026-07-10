import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  // Recovery links must land on the set-password form — the /auth/verify
  // click-through gate drops the `next` param, so derive it from `type`.
  const next =
    type === "recovery"
      ? "/auth/reset-password"
      : url.searchParams.get("next") ?? "/";

  // Helper to create locale-prefixed redirect with optional cookie
  const createRedirect = (path: string, locale: string, setCookie = false) => {
    const localePath = path.startsWith(`/${locale}`) ? path : `/${locale}${path.startsWith('/') ? path : `/${path}`}`;
    const response = NextResponse.redirect(new URL(localePath, url.origin));
    if (setCookie) {
      response.cookies.set('NEXT_LOCALE', locale, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }
    return response;
  };

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, locale")
          .eq("id", user.id)
          .single();

        const locale = profile?.locale && routing.locales.includes(profile.locale as typeof routing.locales[number])
          ? profile.locale
          : routing.defaultLocale;

        if (!profile?.username) {
          return createRedirect('/onboarding', locale, true);
        }

        return createRedirect(next, locale, true);
      }
    }

    return createRedirect(`/auth/error?error=${encodeURIComponent(error?.message || 'Unknown error')}`, routing.defaultLocale);
  }

  return createRedirect('/auth/error?error=No token hash or type', routing.defaultLocale);
}

import { updateSession } from "@/lib/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { locales } from "@/lib/i18n/routing";

// Edge middleware (NOT proxy.ts): the OpenNext Cloudflare adapter only
// supports edge middleware, and in Next 16 proxy.ts always compiles to the
// unsupported Node runtime. Exactly ONE of middleware.ts/proxy.ts may exist
// — both at once crashes the app (enforced by the prebuild script).
export async function middleware(request: NextRequest) {
  // One application, a dedicated meeting host, and no claimed public username.
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase()
    || request.nextUrl.hostname;
  if (hostname === "phuong.dalat.app") {
    const segment = request.nextUrl.pathname.replace(/^\/|\/$/g, "");
    const archiveMatch=segment.match(new RegExp(`^(?:(${locales.join("|")})/)?archive/v1$`));
    if (archiveMatch) {
      const locale=archiveMatch[1] || "en";
      const destination=request.nextUrl.clone();
      destination.pathname=`/${locale}/collaborate/phuong/archive/v1`;
      const headers=new Headers(request.headers);headers.set("x-next-intl-locale",locale);
      return NextResponse.rewrite(destination,{request:{headers}});
    }
    if (!segment || locales.includes(segment as (typeof locales)[number])) {
      const locale = segment || "en";
      const destination = request.nextUrl.clone();
      destination.pathname = `/${locale}/collaborate/phuong`;
      const headers = new Headers(request.headers);
      headers.set("x-next-intl-locale", locale);
      return NextResponse.rewrite(destination, { request: { headers } });
    }
    // Keep authentication cookies on this host; reuse the existing login/onboarding flow.
    const path = request.nextUrl.pathname.replace(new RegExp(`^/(${locales.join("|")})(?=/|$)`), "");
    if (path.startsWith("/auth/") || path === "/onboarding" || path.startsWith("/onboarding/")) {
      return await updateSession(request);
    }
    // Shared shell links go to the real app, not duplicate public pages here.
    const destination = request.nextUrl.clone();
    destination.hostname = "dalat.app";
    destination.protocol = "https:";
    destination.port = "";
    return NextResponse.redirect(destination);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest, sw.js, sitemap (PWA/SEO files)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp, .ico
     * - audio/video - .mp3, .wav, .ogg, .mp4, .webm
     */
    "/((?!api/|auth/callback|auth/confirm|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|mp4|webm|txt)$).*)",
  ],
};

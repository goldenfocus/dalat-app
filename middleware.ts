import { updateSession } from "@/lib/supabase/proxy";
import { NextRequest, NextResponse } from "next/server";
import { locales } from "@/lib/i18n/routing";
import {
  innerPath,
  parsePreviewPath,
  splitLocale,
  withChannel,
  type PreviewPath,
} from "@/lib/preview-channel";

// Paths the matcher below never sends through middleware. A redirect to one
// of them must not gain the preview prefix.
const outsideMiddleware =
  /^\/(?:api|experience-media|auth\/(?:deovia|callback|confirm|continue))(?:\/|$)/;

/**
 * Preview channel (see lib/preview-channel.ts): serve /v3/<path> from the
 * route for /<path>, with locale, auth and redirect handling unchanged. The
 * browser keeps the channel URL; redirects are put back under the prefix.
 */
async function previewChannel(request: NextRequest, preview: PreviewPath) {
  // A plain URL: NextURL would carry a trailing slash over to the new path.
  const inner = new URL(request.nextUrl.href);
  if (inner.searchParams.get("preview") === "off") {
    inner.pathname = `${preview.locale}${preview.rest}` || "/";
    return NextResponse.redirect(inner);
  }
  inner.pathname = innerPath(preview);

  const response = await updateSession(
    new NextRequest(inner, { headers: request.headers, method: request.method }),
  );
  // Channel URLs duplicate canonical pages; keep them out of every index.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, inner);
    if (
      target.origin === inner.origin &&
      !outsideMiddleware.test(splitLocale(target.pathname).rest)
    ) {
      target.pathname = withChannel(target.pathname, preview.channel);
      response.headers.set("location", target.toString());
    }
  } else if (response.headers.has("x-middleware-next")) {
    // "Continue" would serve the channel URL itself, which has no route.
    response.headers.delete("x-middleware-next");
    response.headers.set("x-middleware-rewrite", inner.toString());
  }
  return response;
}

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
  const preview = parsePreviewPath(request.nextUrl.pathname);
  if (preview) return previewChannel(request, preview);
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest(.json/.webmanifest), sw.js, sitemap (PWA/SEO files)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp, .ico
     * - audio/video - .mp3, .wav, .ogg, .mp4, .webm
     */
    "/((?!api/|experience-media/|auth/deovia/|auth/callback|auth/confirm|auth/continue|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|manifest\\.json|sw\\.js|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|mp4|webm|txt)$).*)",
  ],
};

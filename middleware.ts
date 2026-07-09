import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

// Edge middleware (NOT proxy.ts): the OpenNext Cloudflare adapter only
// supports edge middleware, and in Next 16 proxy.ts always compiles to the
// unsupported Node runtime. Exactly ONE of middleware.ts/proxy.ts may exist
// — both at once crashes the app (enforced by the prebuild script).
export async function middleware(request: NextRequest) {
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
    "/((?!api/|auth/callback|auth/confirm|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|mp4|webm)$).*)",
  ],
};

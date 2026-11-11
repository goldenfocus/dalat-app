import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { arrivalContext } from "@/lib/arrival/server";
import { doorKey } from "@/lib/arrival/door";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,180}$/.test(slug)) return new Response(null, { status: 400 });
  const locale = request.nextUrl.searchParams.get("locale") || "en";
  const locales = new Set(["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"]);
  if (!locales.has(locale)) return new Response(null, { status: 400 });
  const url = new URL(`${locale === "en" ? "" : `/${locale}`}/events/${slug}/arrive`, request.nextUrl.origin);
  // `door=1` is the host desk's variant. It carries the presence key, so it is only
  // rendered for signed-in welcome staff and is never cached or shared between viewers.
  // The plain URL stays the public, cacheable guest QR.
  const door = request.nextUrl.searchParams.get("door") === "1";
  if (door) {
    try {
      const { user, event, access } = await arrivalContext(slug);
      if (!user || !access.canWelcome) return new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
      url.searchParams.set("door", doorKey(event.id));
    } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
  }
  const svg = await QRCode.toString(url.href, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 320 });
  return new Response(svg, { headers: {
    "Content-Type": "image/svg+xml",
    ...(door ? { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" } : { "Cache-Control": "public, max-age=3600" }),
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  } });
}

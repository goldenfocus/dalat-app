import type { NextRequest } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,180}$/.test(slug)) return new Response(null, { status: 400 });
  const locale = request.nextUrl.searchParams.get("locale") || "en";
  const locales = new Set(["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"]);
  if (!locales.has(locale)) return new Response(null, { status: 400 });
  const url = new URL(`${locale === "en" ? "" : `/${locale}`}/events/${slug}/arrive`, request.nextUrl.origin);
  const svg = await QRCode.toString(url.href, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 320 });
  return new Response(svg, { headers: {
    "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  } });
}

import { NextResponse } from "next/server";
import { isGoogleMapsUrl, isShortGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/geo/parse-location";

async function resolveShortLink(input: string, method: "HEAD" | "GET", signal: AbortSignal) {
  let url = input;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { method, redirect: "manual", signal });
    const target = response.headers.get("location");
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400 || !target) return null;
    url = new URL(target, url).href;
    if (!isGoogleMapsUrl(url)) return null;
    if (!isShortGoogleMapsUrl(url)) return url;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (typeof url !== "string" || !isShortGoogleMapsUrl(url)) {
      return NextResponse.json({ error: "Only short Google Maps URLs are supported" }, { status: 400 });
    }

    const signal = AbortSignal.timeout(6000);
    const resolvedUrl = await resolveShortLink(url.trim(), "HEAD", signal) ??
      await resolveShortLink(url.trim(), "GET", signal);
    if (!resolvedUrl) return NextResponse.json({ error: "Could not resolve Maps link" }, { status: 422 });

    const point = parseGoogleMapsUrl(resolvedUrl);
    return NextResponse.json({
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      resolvedUrl,
    });
  } catch {
    return NextResponse.json({ error: "Could not resolve Maps link" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { momentFilename, asciiFilename } from "@/lib/moments/download";
import { getCfStreamDownloadUrl } from "@/lib/media-utils";
import { enableVideoDownloads } from "@/lib/cloudflare-stream";

interface Params {
  params: Promise<{ id: string }>;
}

/** Hosts we're willing to proxy. Guards against SSRF via a doctored media_url. */
const ALLOWED_HOSTS = new Set([
  "cdn.dalat.app",
  "aljcmodwjqlznzcydyor.supabase.co", // legacy Supabase Storage originals
]);

/**
 * GET /api/moments/[id]/download
 *
 * Streams the original media for a moment with `Content-Disposition:
 * attachment`. This exists because messaging-app WebViews (Zalo especially)
 * have no download manager and silently ignore blob/`a[download]` saving —
 * a plain navigation to an attachment response is the one signal they honour.
 *
 * Being same-origin also sidesteps R2's CORS allowlist, which doesn't include
 * the Capacitor native shell's origin.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: moment, error } = await supabase
    .from("moments")
    .select("id, media_url, content_type, original_filename, mime_type, cf_video_uid")
    .eq("id", id)
    // Explicit rather than leaning on RLS. RLS would return *different* bytes
    // depending on who is asking (a creator can read their own unmoderated
    // moments), which makes the response uncacheable. Pinning to published
    // makes it identity-independent, so the long edge cache below is safe.
    .eq("status", "published")
    .single();

  if (error || !moment) {
    return NextResponse.json({ error: "Moment not found" }, { status: 404 });
  }
  // Stream-only videos have no media_url; their downloadable MP4 lives on the
  // Cloudflare Stream customer subdomain instead.
  const streamDownloadUrl =
    !moment.media_url && moment.content_type === "video"
      ? getCfStreamDownloadUrl(moment.cf_video_uid)
      : null;

  if (!moment.media_url && !streamDownloadUrl) {
    return NextResponse.json({ error: "No media to download" }, { status: 404 });
  }

  let upstream: URL;
  if (moment.media_url) {
    try {
      upstream = new URL(moment.media_url);
    } catch {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 422 });
    }
    if (upstream.protocol !== "https:" || !ALLOWED_HOSTS.has(upstream.hostname)) {
      console.warn(`[moment-download] refused ${upstream.protocol}//${upstream.hostname} for ${id}`);
      return NextResponse.json({ error: "Unsupported media host" }, { status: 422 });
    }
  } else {
    // Constructed server-side from the video UID — no allowlist concern.
    upstream = new URL(streamDownloadUrl!);
  }

  const fetchUpstream = () =>
    fetch(upstream, {
      cache: "no-store",
      // media_url is user-influenced: a redirect from an allowed host would
      // escape the allowlist. The Stream URL is ours, and it 302s to a signed
      // /dl/ URL by design — following is required there.
      redirect: streamDownloadUrl ? "follow" : "manual",
      signal: request.signal,
    });

  let res: Response;
  try {
    res = await fetchUpstream();

    // Stream returns 404 until the MP4 rendition has been enabled + encoded.
    // Enable it lazily and give it a short window to finish — most videos are
    // already backfilled, so this only fires for brand-new uploads.
    if (!res.ok && streamDownloadUrl && moment.cf_video_uid) {
      let status = await enableVideoDownloads(moment.cf_video_uid);
      for (let i = 0; i < 5 && status.status !== "ready"; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        status = await enableVideoDownloads(moment.cf_video_uid);
      }
      if (status.status === "ready") {
        res = await fetchUpstream();
      }
    }
  } catch (err) {
    // Rung 3 navigates the user directly here, so an uncaught throw would land
    // them on a raw error page instead of a handled response.
    console.error(`[moment-download] fetch failed for ${id}:`, err);
    return NextResponse.json({ error: "Media unavailable" }, { status: 502 });
  }

  if (!res.ok || !res.body) {
    console.error(`[moment-download] upstream ${res.status} for ${id}`);
    return NextResponse.json(
      { error: "Media unavailable" },
      { status: res.status === 404 ? 404 : 502 }
    );
  }

  // The Stream rendition is always an MP4 regardless of the uploaded
  // container, so the filename must not inherit a .mov/.webm extension.
  const filename = streamDownloadUrl
    ? momentFilename(moment).replace(/\.[a-z0-9]{2,5}$/i, ".mp4")
    : momentFilename(moment);
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") || "application/octet-stream",
    // filename* (RFC 5987) carries the UTF-8 name; filename is the ASCII
    // fallback. Both are sanitized — original_filename is user-supplied, and
    // a CR/LF in it would otherwise crash the Headers constructor.
    "Content-Disposition": `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  return new NextResponse(res.body, { status: 200, headers });
}

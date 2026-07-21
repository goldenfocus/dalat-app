import { NextResponse } from "next/server";
import { downloadZip } from "client-zip";
import { createClient } from "@/lib/supabase/server";
import {
  momentFilename,
  asciiFilename,
  DOWNLOAD_BRAND,
} from "@/lib/moments/download";

interface Params {
  params: Promise<{ slug: string }>;
}

/** Guard against a runaway album pinning the isolate for its whole budget. */
const MAX_FILES = 300;

const ALLOWED_HOSTS = new Set([
  "cdn.dalat.app",
  "aljcmodwjqlznzcydyor.supabase.co",
]);

/**
 * GET /api/events/[slug]/moments/download.zip
 *
 * Streams an event's photos as a zip. Server-side rather than client-side
 * (JSZip) because the WebViews that most need this can't run the client path
 * at all — and a plain `<a href>` to this route works anywhere that can
 * download at all.
 *
 * Uses client-zip rather than archiver: this app runs on Cloudflare Workers
 * via OpenNext, where archiver's Node `fs`/stream internals don't belong.
 * client-zip is Web Streams end to end, stores without compressing (photos
 * don't deflate), and pulls each source lazily — so exactly one upstream
 * response is in flight at a time and memory stays flat regardless of album
 * size. An eager loop would hand 300 unconsumed body streams to the zipper
 * at once and OOM the isolate.
 *
 * Photos only. Video originals turn a quick download into a multi-minute one
 * that mobile browsers tend to kill; videos are downloadable individually.
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, slug, title")
    .eq("slug", slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: moments, error: momentsError } = await supabase
    .from("moments")
    .select("id, media_url, content_type, original_filename, mime_type, captured_at, created_at")
    .eq("event_id", event.id)
    // Every other moments read path filters on this. Without it a creator's
    // zip would quietly include pending, rejected and removed moments.
    .eq("status", "published")
    .in("content_type", ["photo", "image"])
    .not("media_url", "is", null)
    .order("captured_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(MAX_FILES);

  if (momentsError) {
    console.error(`[album-download] query failed for ${slug}:`, momentsError);
    return NextResponse.json({ error: "Could not load album" }, { status: 500 });
  }
  if (!moments || moments.length === 0) {
    return NextResponse.json({ error: "No photos to download" }, { status: 404 });
  }

  const skipped: string[] = [];

  // Lazily yielded — client-zip pulls the next entry only after draining the
  // previous one, which is what keeps this to one upstream fetch at a time.
  async function* entries() {
    const used = new Set<string>();

    for (const moment of moments!) {
      if (request.signal.aborted) return;

      try {
        const upstream = new URL(moment.media_url!);
        if (upstream.protocol !== "https:" || !ALLOWED_HOSTS.has(upstream.hostname)) {
          skipped.push(moment.id);
          continue;
        }

        const res = await fetch(upstream, {
          cache: "no-store",
          // Don't follow redirects: a redirect from an allowed host would
          // otherwise escape the allowlist entirely.
          redirect: "manual",
          signal: request.signal,
        });
        if (!res.ok || !res.body) {
          console.warn(`[album-download] skipped ${moment.id}: HTTP ${res.status}`);
          skipped.push(moment.id);
          continue;
        }

        // De-duplicate names so two IMG_0001.jpg uploads don't collide.
        let name = momentFilename(moment);
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = `${name.slice(0, dot)}-${moment.id.slice(0, 4)}${name.slice(dot)}`;
        }
        used.add(name);

        yield {
          name,
          input: res,
          lastModified: new Date(moment.captured_at ?? moment.created_at),
        };
      } catch (err) {
        if (request.signal.aborted) return;
        console.warn(`[album-download] skipped ${moment.id}:`, err);
        skipped.push(moment.id);
      }
    }

    // A partial album must never look complete. If anything was skipped, the
    // zip says so in a file the user will actually see when they open it.
    if (skipped.length > 0) {
      yield {
        name: "MISSING-PHOTOS.txt",
        input:
          `${skipped.length} of ${moments!.length} photos could not be retrieved ` +
          `and are missing from this archive.\n\n` +
          `Try downloading again later, or view the full album at ` +
          `https://dalat.app/events/${slug}/moments\n\n` +
          `Missing moment ids:\n${skipped.join("\n")}\n`,
        lastModified: new Date(),
      };
    }
  }

  const zipped = downloadZip(entries());
  const filename = `${DOWNLOAD_BRAND}-${asciiFilename(slug)}-photos.zip`;

  return new NextResponse(zipped.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Album contents change as moments are added or moderated, and this
      // response is assembled per-request. Never cache it at the edge.
      "Cache-Control": "private, no-store",
    },
  });
}

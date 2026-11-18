import { createClient } from "@/lib/supabase/server";
import { isAllowedMediaDownloadUrl } from "@/lib/media-download-url";
import { asciiFilename } from "@/lib/moments/download";
import type { EventPromoMedia } from "@/lib/types";
export async function GET(request: Request, { params }: {params: Promise<{slug: string; id: string}>}) {
  const {slug, id} = await params; const db = await createClient();
  const {data: event} = await db.from("events").select("id").eq("slug", slug).eq("status", "published").single();
  if (!event) return new Response(null, {status: 404});
  const {data} = await db.rpc("get_event_promo_media", {p_event_id: event.id});
  const item = (data as EventPromoMedia[] | null)?.find(p => p.id === id);
  if (!item) return new Response(null, {status: 404});
  if (item.source_moment_id) {
    const target = new URL(`/api/moments/${item.source_moment_id}/download`, request.url);
    if (new URL(request.url).searchParams.get("quality") === "mobile") target.searchParams.set("quality", "mobile");
    return Response.redirect(target, 307);
  }
  if (!item.media_url || !isAllowedMediaDownloadUrl(item.media_url)) return new Response(null, {status: 404});
  try {
    const upstream = await fetch(item.media_url, {redirect: "manual", signal: request.signal});
    if (!upstream.ok || !upstream.body) return new Response(null, {status: 502});
    const leaf = new URL(item.media_url).pathname.split("/").pop() || "media";
    const headers = new Headers({"Content-Type": upstream.headers.get("content-type") || "application/octet-stream", "Content-Disposition": `attachment; filename="${asciiFilename("dalat.app-"+leaf)}"`, "Cache-Control":"public, max-age=3600", "X-Content-Type-Options":"nosniff"});
    const size = upstream.headers.get("content-length"); if(size) headers.set("Content-Length",size);
    return new Response(upstream.body,{headers});
  } catch {return new Response(null,{status:502});}
}

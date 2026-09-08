import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getVideoDetails } from "@/lib/cloudflare-stream";

// Authorize with RLS before using the service key to reconcile provider metadata.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createClient();
  const fields = "id,cf_video_uid,video_status,cf_playback_url,thumbnail_url,video_duration_seconds";
  const { data: moment, error } = await client.from("moments").select(fields).eq("id", id).single();
  if (error || !moment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!moment.cf_video_uid || moment.video_status === "ready" || moment.video_status === "error") {
    return NextResponse.json(moment, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const details = await getVideoDetails(moment.cf_video_uid);
    const state = details.readyToStream && details.status.state !== "error"
      ? "ready" : details.status.state;
    if (state !== "ready" && state !== "error") return NextResponse.json(moment);
    if (state === "ready" && !details.playback?.hls) throw new Error("Missing playback URL");
    const patch = state === "ready" ? {
      video_status: "ready", cf_playback_url: details.playback!.hls,
      thumbnail_url: moment.thumbnail_url || details.thumbnail || null,
      video_duration_seconds: details.duration ?? null,
    } : { video_status: "error" };
    const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error: updateError } = await service.from("moments").update(patch)
      .eq("id", id).eq("cf_video_uid", moment.cf_video_uid).in("video_status", ["processing", "uploading"]);
    if (updateError) throw updateError;
    return NextResponse.json({ ...moment, ...patch }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Video status reconciliation failed", id, error);
    return NextResponse.json({ error: "Status temporarily unavailable" }, { status: 503 });
  }
}
